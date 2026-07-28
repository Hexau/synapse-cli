import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Static, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import {
  SynapseWsClient,
  SynapseRestClient,
  ConnectorEvent,
  createLocalFileOpHandler,
  createLocalExecOpHandler,
  buildRemoteTreeSnapshot,
} from "@synapse/protocol";
import { CommandPalette } from "./components/CommandPalette.js";
import { SubMenu, SubMenuOption } from "./components/SubMenu.js";
import { ToolCard } from "./components/ToolCard.js";
import { Markdown } from "./components/Markdown.js";
import { QueuedMessages } from "./components/QueuedMessages.js";
import { HelpHint } from "./components/HelpHint.js";
import { LaunchScreen } from "./components/LaunchScreen.js";
import { THEMES, resolveTheme, Theme } from "./theme.js";

// The server only injects the remote file structure into the agent's
// prompt if the snapshot is younger than 90s (see
// _76_include_remote_file_structure.py) — refresh comfortably inside that
// window so it never goes stale mid-session.
const REMOTE_TREE_REFRESH_MS = 60_000;
import { resolveServerUrl, resolveApiToken, resolveContextId, resolveThemeName, setThemeName } from "./config.js";
import { listPrompts, expandPrompt } from "./prompts.js";

interface ChatSummary {
  id: string;
  name?: string;
  running?: boolean;
}

interface DisplayLine {
  sequence: number;
  event: ConnectorEvent["event"];
  text: string;
  heading?: string;
  // Carries event_bridge.py's log "kvps" (thoughts, step, tool_name, etc.)
  // — same data the WebUI's drawMessageAgent() uses for its richer live
  // activity view (see plugins/_a0_connector/helpers/event_bridge.py:61-68).
  meta?: Record<string, unknown>;
}

// Color/label per event type — mirrors event_bridge.py's _LOG_TYPE_MAP
// semantics (which log "type" maps to which connector event) so the CLI's
// visual language matches what the WebUI already implies with its own
// per-type log styling. Colors come from the active Theme (see theme.ts)
// instead of being hardcoded, so /theme can restyle the whole transcript.
function styleFor(event: ConnectorEvent["event"], theme: Theme): { color: string; label: string } {
  switch (event) {
    case "user_message":
      return { color: theme.you, label: "you" };
    case "assistant_message":
    case "assistant_delta":
      return { color: theme.assistant, label: "synapse" };
    case "tool_start":
    case "tool_output":
    case "tool_end":
      return { color: theme.tool, label: "tool" };
    case "code_start":
    case "code_output":
      return { color: theme.code, label: "code" };
    case "error":
      return { color: theme.error, label: "error" };
    case "warning":
      return { color: theme.warn, label: "warn" };
    default:
      return { color: theme.status, label: "status" };
  }
}

// Ink's <Static> permanently prints its content to the real terminal
// scrollback — clearing our React state (setLines([])/setStaticLines([]))
// removes it from Ink's virtual tree, but whatever was already printed
// stays on screen. When the user starts fresh (new chat, switched chat,
// /clear) they expect the old conversation to actually disappear, so
// explicitly clear the terminal's screen AND scrollback (not just the
// visible viewport) before Ink redraws — matches what a normal shell's
// `clear`/`cls` does.
function clearTerminal(): void {
  process.stdout.write("\x1Bc");
}

const TOOL_EVENTS = new Set<ConnectorEvent["event"]>(["tool_start", "tool_output", "tool_end"]);

type RenderItem =
  | { kind: "line"; line: DisplayLine }
  | { kind: "tool-card"; key: number; lines: DisplayLine[] };

// Collapses consecutive tool_start/tool_output/tool_end DisplayLines into a
// single card entry — see ToolCard.tsx's comment on why these arrive as
// separate log items instead of one that updates in place.
function groupToolCards(lines: DisplayLine[]): RenderItem[] {
  const items: RenderItem[] = [];
  for (const line of lines) {
    const prev = items[items.length - 1];
    if (TOOL_EVENTS.has(line.event)) {
      if (prev && prev.kind === "tool-card") {
        prev.lines.push(line);
      } else {
        items.push({ kind: "tool-card", key: line.sequence, lines: [line] });
      }
    } else {
      items.push({ kind: "line", line });
    }
  }
  return items;
}

// Shared between the <Static> (frozen history) and the live (current turn)
// render paths so both produce identical output for a given RenderItem —
// see the staticLines/lines split comment in App() for why history is split
// this way.
function renderTranscriptItem(
  item: RenderItem,
  theme: Theme,
  toolCardsExpanded: boolean
): React.ReactNode {
  if (item.kind === "tool-card") {
    return (
      <Box key={item.key} marginBottom={1}>
        <ToolCard lines={item.lines} expanded={toolCardsExpanded} color={theme.tool} />
      </Box>
    );
  }
  const { line } = item;
  const { color, label } = styleFor(line.event, theme);

  // A blank-line gap before each new user turn makes it much easier to scan
  // back through a long (now-visible, see Fase J's history load) transcript
  // and spot where each exchange starts.
  const topMargin = line.event === "user_message" ? 1 : 0;

  // "status" events (Agent-Zero log type "agent") stream data.text as the
  // RAW, still-partial JSON the LLM is emitting (`{"thoughts": [...`) — the
  // WebUI never shows that text directly, it shows the parsed heading/kvps
  // instead (see plugins/_a0_connector/helpers/event_bridge.py's kvps and
  // extensions/python/response_stream/_10_log_from_stream.py's step/thoughts
  // construction). Mirror that here instead of dumping the raw blob.
  if (line.event === "status") {
    const step = typeof line.meta?.step === "string" ? (line.meta.step as string) : undefined;
    const thoughts = Array.isArray(line.meta?.thoughts) ? (line.meta!.thoughts as unknown[]) : undefined;
    if (step || thoughts) {
      return (
        <Box key={line.sequence} flexDirection="column" marginBottom={1}>
          <Text color={color} bold>
            🤔 {step || line.heading || "Thinking..."}
          </Text>
          {/* Collapsed by default — reasoning can run to many lines per
              step and buries the actual conversation. Same Ctrl+T toggle
              that expands ToolCard detail (see App.tsx) expands this too. */}
          {toolCardsExpanded
            ? thoughts?.map((t, idx) => (
                <Text key={idx} color={theme.dim} dimColor>
                  {"  · "}
                  {String(t)}
                </Text>
              ))
            : thoughts && thoughts.length > 0 && (
                <Text dimColor>
                  {"  "}({thoughts.length} thought{thoughts.length === 1 ? "" : "s"} — Ctrl+T to expand)
                </Text>
              )}
        </Box>
      );
    }
  }

  return (
    <Box key={line.sequence} flexDirection="column" marginTop={topMargin} marginBottom={line.heading ? 1 : 0}>
      {line.heading ? (
        <Text color={color} bold>
          [{label}] {line.heading}
        </Text>
      ) : null}
      {line.event === "assistant_message" ? (
        <Markdown text={line.text} color={color} theme={theme} />
      ) : (
        <Text color={color}>{line.text}</Text>
      )}
    </Box>
  );
}

export default function App({ projectDir }: { projectDir: string }) {
  const { exit } = useApp();
  const [connected, setConnected] = useState(false);
  // "lines" holds only the CURRENT turn's still-possibly-updating events
  // (tool progress replaced in place by sequence, per onEvent below).
  // "staticLines" holds everything already finished — rendered through
  // Ink's <Static>, which commits it to the terminal once and never
  // re-renders it again. Without this split, ink-spinner's ~80ms re-render
  // ticks force Ink to redraw the ENTIRE transcript every frame; once a
  // response is long (e.g. a big markdown table), many terminals (observed
  // on Windows/Git Bash) can't redraw that much content per frame cleanly
  // and leave duplicate copies behind in scrollback instead of overwriting
  // — which is exactly the "same message repeated many times" bug reported.
  const [staticLines, setStaticLines] = useState<DisplayLine[]>([]);
  const liveLinesRef = useRef<DisplayLine[]>([]);
  const [lines, setLines] = useState<DisplayLine[]>([]);
  useEffect(() => {
    liveLinesRef.current = lines;
  }, [lines]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Messages submitted while a turn is in flight get queued instead of
  // firing a second concurrent sendMessage (the server processes one turn
  // per context at a time — see chat_ensure's ownership model). queueRef is
  // the source of truth so the onComplete handler (registered once at mount,
  // see the ws setup effect) always reads the latest queue instead of a
  // stale closure over queue's initial empty array; queueVersion just forces
  // a re-render so <QueuedMessages> reflects it.
  const queueRef = useRef<string[]>([]);
  const [queueVersion, setQueueVersion] = useState(0);
  const enqueueMessage = (text: string) => {
    queueRef.current = [...queueRef.current, text];
    setQueueVersion((v) => v + 1);
  };
  const dequeueMessage = (): string | undefined => {
    const [next, ...rest] = queueRef.current;
    queueRef.current = rest;
    setQueueVersion((v) => v + 1);
    return next;
  };
  // Files staged via /attach — sent with the NEXT message only (see
  // sendToAgent), same ref-as-source-of-truth pattern as queueRef above.
  const pendingAttachmentsRef = useRef<string[]>([]);
  const [pendingAttachmentsVersion, setPendingAttachmentsVersion] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Shown in the status bar once known — same data /model already surfaces,
  // just visible up front instead of only after opening the picker.
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [subMenu, setSubMenu] = useState<{
    kind: "model" | "skill" | "agent" | "chat" | "theme";
    title: string;
    loading: boolean;
    error: string | null;
    options: SubMenuOption[];
  } | null>(null);
  const [toolCardsExpanded, setToolCardsExpanded] = useState(false);
  const [themeName, setThemeNameState] = useState(() => resolveThemeName() || "dark");
  const theme = resolveTheme(themeName);
  // First Ctrl+C pauses the running agent (or just arms exit if it's idle);
  // a second Ctrl+C within EXIT_ARM_WINDOW_MS actually quits — mirrors the
  // "press again to exit" convention so a stray Ctrl+C can't kill the
  // session by accident while a turn is in flight.
  const [exitArmed, setExitArmed] = useState(false);
  const exitArmTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const defaultContextId = useMemo(() => resolveContextId(projectDir), [projectDir]);
  // Starts unset — the user picks a chat on <LaunchScreen> (or creates a new
  // one) before this is ever assigned; nothing auto-loads. Mutable after
  // that so /chat's picker can still switch the active session mid-run
  // without restarting the CLI.
  const [contextId, setContextId] = useState<string | null>(null);
  const serverUrl = useMemo(() => resolveServerUrl(), []);
  const apiToken = useMemo(() => resolveApiToken(), []);

  // Set once the WS/REST clients are actually constructed (end of the mount
  // effect below) — <LaunchScreen> needs restRef.current to call
  // listChats(), but its own mount effect (a child) would otherwise fire
  // BEFORE this component's effect (React runs child effects first in the
  // same commit), racing restRef.current while it's still null.
  const [wsReady, setWsReady] = useState(false);

  const wsRef = useRef<SynapseWsClient | null>(null);
  const restRef = useRef<SynapseRestClient | null>(null);
  // Gates the input: sending before chat_ensure() resolves would 404 (the
  // server never auto-creates a context for a client-derived id — see
  // ensureChat's doc comment) and silently hang forever, since our previous
  // sendMessage() never read the ack. Now it does, but ensuring first avoids
  // that failure mode entirely instead of just reporting it after the fact.
  const [ready, setReady] = useState(false);

  const EXIT_ARM_WINDOW_MS = 2500;

  useInput((_input, key) => {
    if (key.ctrl && _input === "t") {
      setToolCardsExpanded((prev) => !prev);
      return;
    }
    if (key.ctrl && _input === "c") {
      if (exitArmed) {
        exit();
        return;
      }
      if (busy && contextId) {
        restRef.current?.pause(contextId, true).catch(() => {});
        appendStatus("Paused (Ctrl+C). Press Ctrl+C again within a couple seconds to exit.");
      } else {
        appendStatus("Press Ctrl+C again to exit.");
      }
      setExitArmed(true);
      if (exitArmTimeoutRef.current) clearTimeout(exitArmTimeoutRef.current);
      exitArmTimeoutRef.current = setTimeout(() => setExitArmed(false), EXIT_ARM_WINDOW_MS);
    }
  });

  // Freezes the current turn's lines (plus any trailing line passed in, e.g.
  // the final assistant/error line from onComplete) into staticLines and
  // clears the live buffer — see the staticLines/lines split comment above.
  // liveLinesRef (mirrored from `lines` via the effect above) is what makes
  // this safe to call from the onComplete/onError closures registered once
  // at mount: it always reads the latest live lines, not a stale snapshot.
  const commitLiveLines = React.useCallback((trailing: DisplayLine[] = []) => {
    setStaticLines((prev) => [...prev, ...liveLinesRef.current, ...trailing]);
    setLines([]);
  }, []);

  // Stable across renders (empty deps — wsRef is a ref, setBusy/setLines are
  // setState functions, both stable) so the onComplete/onError handlers
  // registered below can call it directly without going stale. Sends
  // whatever's queued in pendingAttachmentsRef (see /attach) with this
  // message, then clears it — attachments are one-shot, not sticky across
  // turns.
  const sendToAgent = React.useCallback(async (trimmed: string) => {
    if (!wsRef.current) return;
    setBusy(true);
    const attachments = pendingAttachmentsRef.current;
    pendingAttachmentsRef.current = [];
    setPendingAttachmentsVersion((v) => v + 1);
    const seq = -Date.now();
    const displayText =
      attachments.length > 0
        ? `${trimmed}\n📎 ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}`
        : trimmed;
    setLines((prev) => [...prev, { sequence: seq, event: "user_message", text: displayText }]);
    const error = await wsRef.current.sendMessage(trimmed, attachments);
    if (error) {
      setBusy(false);
      setLines((prev) => [...prev, { sequence: seq - 1, event: "error", text: `Send failed: ${error}` }]);
    }
  }, []);

  useEffect(() => {
    const ws = new SynapseWsClient({
      serverUrl,
      onStatus: setConnected,
      fileOpHandler: createLocalFileOpHandler(),
      execOpHandler: createLocalExecOpHandler(),
    });
    ws.updateApiToken(apiToken);

    ws.onEvent((event) => {
      const { data, sequence, event: type } = event;
      if (!data.text && !data.heading) return;
      setLines((prev) => {
        const idx = prev.findIndex((l) => l.sequence === sequence);
        const line: DisplayLine = {
          sequence,
          event: type,
          text: data.text ?? "",
          heading: data.heading,
          meta: data.meta,
        };
        if (idx === -1) return [...prev, line];
        const next = [...prev];
        next[idx] = line;
        return next;
      });
    });

    // The final assistant answer arrives ONLY here, not through onEvent's
    // stream (see ConnectorContextComplete's doc comment) — this is also
    // the sole signal that a turn actually finished, so it's what clears
    // the busy spinner.
    ws.onComplete((complete) => {
      setBusy(false);
      const trailing: DisplayLine[] = [];
      if (complete.response) {
        trailing.push({ sequence: Date.now(), event: "assistant_message", text: complete.response! });
      } else if (complete.status === "error" && complete.error) {
        trailing.push({ sequence: Date.now(), event: "error", text: complete.error! });
      }
      // Turn finished — freeze it (see commitLiveLines) so Ink stops
      // redrawing this potentially-large response on every future frame.
      commitLiveLines(trailing);
      // If the user queued messages while this turn was running (see
      // handleSubmit), send the next one now instead of waiting for them
      // to resubmit it by hand.
      const next = dequeueMessage();
      if (next) sendToAgent(next);
    });

    ws.onError((err) => {
      setBusy(false);
      commitLiveLines([{ sequence: Date.now(), event: "error", text: err.message }]);
      const next = dequeueMessage();
      if (next) sendToAgent(next);
    });

    ws.start();
    wsRef.current = ws;

    const rest = new SynapseRestClient({ serverUrl, apiToken });
    restRef.current = rest;
    setWsReady(true);

    return () => {
      ws.stop();
    };
  }, [serverUrl, apiToken]);

  // Context-scoped setup — re-runs whenever contextId changes, either from
  // a <LaunchScreen> selection or from switching chats via the /chat
  // picker. Deliberately kept separate from the effect above so a chat
  // switch doesn't tear down and reconnect the socket itself. No-ops until
  // contextId is actually set (LaunchScreen hasn't chosen one yet).
  useEffect(() => {
    const ws = wsRef.current;
    const rest = restRef.current;
    if (!ws || !rest || !contextId) return;

    ws.updateContextId(contextId);
    setReady(false);
    setActivePreset(null);

    rest
      .ensureChat(contextId)
      .then(async () => {
        // Load this chat's prior history so re-opening the CLI in the same
        // directory shows the conversation that was already there instead
        // of an empty screen — same log_tail endpoint `synapse chat logs`
        // already uses (commands/chat.ts), same event shape ws.onEvent
        // consumes live, so it renders through the exact same pipeline.
        // Goes straight into staticLines (frozen/<Static>) since it's all
        // already-finished history by definition.
        try {
          const history = (await rest.logTail(contextId, 0, 250)) as {
            events?: Array<{ sequence: number; event: ConnectorEvent["event"]; data: ConnectorEvent["data"] }>;
          };
          const historyLines: DisplayLine[] = (history.events ?? [])
            .filter((e) => e.data.text || e.data.heading)
            .map((e) => ({
              sequence: e.sequence,
              event: e.event,
              text: e.data.text ?? "",
              heading: e.data.heading,
              meta: e.data.meta,
            }));
          if (historyLines.length > 0) setStaticLines(historyLines);
        } catch {
          // Non-fatal — an older server or a brand-new chat with no history
          // yet just means we fall back to today's empty-screen behavior.
        }
        // Same call the /model picker already makes (openSubMenu) — just
        // surfaced up front in the status bar too, not only inside the picker.
        rest
          .modelSwitcher({ action: "get", context_id: contextId })
          .then((state) => {
            const override = (state as { override?: { preset_name?: string } | null }).override;
            setActivePreset(override?.preset_name ?? null);
          })
          .catch(() => setActivePreset(null));
        setReady(true);
      })
      .catch((err: Error) => {
        setLines((prev) => [
          ...prev,
          { sequence: -1, event: "error", text: `Failed to prepare chat context: ${err.message}` },
        ]);
      });

    // Auto-index this directory on start, same as synapse-vscode's
    // triggerCodebaseIndex — fire-and-forget, no need to block the UI.
    rest.indexProject({ path: projectDir, context_id: contextId }).catch(() => {
      // Silent — server may be unreachable or indexing already in progress.
    });

    // Push (and keep refreshing) the file tree so the agent automatically
    // knows what project/files this directory contains — without this the
    // agent has no way to tell "PrintDesk_production" apart from an empty
    // workdir, since the separate "projects" registry can't reference an
    // arbitrary external path like this one.
    const pushTree = () => {
      const { tree, treeHash } = buildRemoteTreeSnapshot(projectDir);
      ws.sendRemoteTreeUpdate(projectDir, tree, treeHash);
    };
    pushTree();
    const treeInterval = setInterval(pushTree, REMOTE_TREE_REFRESH_MS);

    return () => {
      clearInterval(treeInterval);
    };
  }, [contextId, projectDir]);

  const appendStatus = (text: string, event: DisplayLine["event"] = "status") =>
    setLines((prev) => [...prev, { sequence: Date.now() + Math.random(), event, text }]);

  // Slash commands reuse the exact same REST client (and contextId) as the
  // `synapse model/skill/agent/chat` standalone subcommands — same backend
  // calls, just surfaced without leaving the chat. Kept intentionally
  // terser than those files' output (no need to duplicate full formatting
  // logic for an inline confirmation line).
  const handleSlashCommand = async (line: string): Promise<boolean> => {
    const [cmd, ...rest] = line.trim().split(/\s+/);
    const rc = restRef.current;
    // Slash commands only run from the main chat UI, which never renders
    // before contextId is set (see the LaunchScreen render gate below) —
    // this narrows `contextId` from `string | null` for the rest of the
    // function instead of asserting `!` at every call site.
    if (!rc || !contextId) return true;

    try {
      if (cmd === "/help") {
        setHelpOpen(true);
      } else if (cmd === "/model" && rest[0] !== "use" && rest[0] !== "clear") {
        const presets = await rc.modelPresets({ action: "get" });
        const state = (await rc.modelSwitcher({ action: "get", context_id: contextId })) as {
          override?: { preset_name?: string } | null;
        };
        const names = presets.presets?.map((p) => p.name).join(", ") || "(none)";
        appendStatus(
          `Presets: ${names}${state.override?.preset_name ? ` — active: ${state.override.preset_name}` : ""}`
        );
      } else if (cmd === "/model" && rest[0] === "use" && rest[1]) {
        await rc.modelSwitcher({ action: "set_preset", context_id: contextId, preset_name: rest[1] });
        setActivePreset(rest[1]);
        appendStatus(`Model preset '${rest[1]}' activated.`);
      } else if (cmd === "/model" && rest[0] === "clear") {
        await rc.modelSwitcher({ action: "clear", context_id: contextId });
        setActivePreset(null);
        appendStatus("Model override cleared.");
      } else if (cmd === "/skill" && rest[0] !== "activate") {
        const skills = await rc.listSkills({ contextId });
        appendStatus(`${skills.data?.length ?? 0} skill(s) available — see 'synapse skill' for the full list.`);
      } else if (cmd === "/skill" && rest[0] === "activate" && rest[1]) {
        await rc.activateSkill(contextId, rest[1]);
        appendStatus(`Skill activated: ${rest[1]}`);
      } else if (cmd === "/agent" && rest[0] !== "use") {
        const agents = await rc.listAgents();
        const names = agents.data?.map((a) => a.key).join(", ") || "(none)";
        appendStatus(`Profiles: ${names}`);
      } else if (cmd === "/agent" && rest[0] === "use" && rest[1]) {
        await rc.setAgentProfile(contextId, rest[1]);
        appendStatus(`Agent profile '${rest[1]}' activated.`);
      } else if (cmd === "/attach") {
        // Strip a single pair of surrounding quotes — natural to type when
        // pasting a Windows path with spaces/accented characters, but a
        // literal quote in the string makes it relative (fs treats a
        // leading '"' as neither a drive letter nor "\\", so Node resolves
        // it against cwd instead of erroring outright) rather than failing
        // fast with a clear "no such file" message.
        let filePath = rest.join(" ").trim();
        if (
          (filePath.startsWith('"') && filePath.endsWith('"')) ||
          (filePath.startsWith("'") && filePath.endsWith("'"))
        ) {
          filePath = filePath.slice(1, -1);
        }
        if (!filePath) {
          appendStatus("Usage: /attach <path to file, e.g. a screenshot>", "error");
        } else {
          try {
            const serverPath = await rc.uploadFile(filePath);
            pendingAttachmentsRef.current = [...pendingAttachmentsRef.current, serverPath];
            setPendingAttachmentsVersion((v) => v + 1);
            appendStatus(
              `Attached: ${filePath} — will be sent with your next message (${pendingAttachmentsRef.current.length} pending).`
            );
          } catch (err) {
            appendStatus(
              `Failed to attach '${filePath}': ${err instanceof Error ? err.message : String(err)}`,
              "error"
            );
          }
        }
      } else if (cmd === "/chat" && rest[0] === "new") {
        try {
          const created = (await rc.createChat(contextId)) as { context_id?: string };
          if (!created.context_id) {
            appendStatus("Failed to create a new chat: no context_id in response.", "error");
          } else {
            clearTerminal();
            setLines([]);
            setStaticLines([]);
            setContextId(created.context_id);
            appendStatus(`New chat created: ${created.context_id}`);
          }
        } catch (err) {
          appendStatus(
            `Failed to create a new chat: ${err instanceof Error ? err.message : String(err)}`,
            "error"
          );
        }
      } else if (cmd === "/theme" && !rest[0]) {
        appendStatus(`Themes: ${Object.keys(THEMES).join(", ")} — active: ${themeName}`);
      } else if (cmd === "/theme" && rest[0]) {
        if (!THEMES[rest[0]]) {
          appendStatus(`Unknown theme '${rest[0]}'. Available: ${Object.keys(THEMES).join(", ")}`, "error");
        } else {
          setThemeNameState(rest[0]);
          setThemeName(rest[0]);
          appendStatus(`Theme switched to ${rest[0]}`);
        }
      } else if (cmd === "/clear") {
        await rc.resetChat(contextId);
        clearTerminal();
        setLines([]);
        setStaticLines([]);
      } else if (cmd === "/compact") {
        const result = (await rc.compactChat(contextId)) as { ok: boolean; message?: string };
        appendStatus(result.message || (result.ok ? "Compaction started." : "Compaction failed."));
      } else if (cmd === "/pause") {
        await rc.pause(contextId, true);
        appendStatus("Agent paused.");
      } else if (cmd === "/resume") {
        await rc.pause(contextId, false);
        appendStatus("Agent resumed.");
      } else if (cmd === "/prompts") {
        const templates = listPrompts();
        if (!templates.length) {
          appendStatus(
            "No project prompts found. Add templates under .synapse/prompts/<name>.md in this project, then run /run <name>."
          );
        } else {
          const lines = templates
            .map((t) => `  /run ${t.name}${t.description ? ` — ${t.description}` : ""}`)
            .join("\n");
          appendStatus(`${templates.length} project prompt(s):\n${lines}`);
        }
      } else if (cmd === "/run") {
        const name = rest[0];
        if (!name) {
          appendStatus("Usage: /run <name> [args] — see /prompts for the list.", "error");
        } else {
          const expanded = expandPrompt(name, rest.slice(1).join(" "));
          if (expanded === null) {
            appendStatus(`No project prompt named '${name}'. See /prompts.`, "error");
          } else if (busy) {
            queueRef.current = [...queueRef.current, expanded];
            setQueueVersion((v) => v + 1);
            appendStatus(`Prompt '${name}' queued (agent busy).`);
          } else {
            await sendToAgent(expanded);
          }
        }
      } else {
        return false; // not a recognized slash command — send as a normal message
      }
    } catch (err) {
      appendStatus(`Command failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    }
    return true;
  };

  // Typing "/" as the very first character opens the palette instead of
  // just inserting it — matches the plan's "Fase A" trigger. Anything typed
  // after that (e.g. continuing to type a command by hand) still works
  // normally since we only intercept the empty-to-"/" transition.
  const handleInputChange = (value: string) => {
    if (value === "/" && input === "") {
      setInput("");
      setPaletteOpen(true);
      return;
    }
    setInput(value);
  };

  // Actions whose slash command needs a target get a second-level SubMenu
  // populated from the real server data instead of running immediately —
  // this is what lets the user pick "Model" then pick a preset by arrow
  // keys, rather than having to type "/model use <exact-name>" by hand.
  const openSubMenu = async (kind: "model" | "skill" | "agent" | "chat" | "theme") => {
    const titles: Record<typeof kind, string> = {
      model: "Select a model preset",
      skill: "Select a skill to activate",
      agent: "Select an agent profile",
      chat: "Switch to a chat",
      theme: "Select a color theme",
    };
    setSubMenu({ kind, title: titles[kind], loading: true, error: null, options: [] });

    if (kind === "theme") {
      const options: SubMenuOption[] = Object.keys(THEMES).map((name) => ({
        label: name === themeName ? `${name} (active)` : name,
        value: name,
      }));
      setSubMenu((prev) => (prev && prev.kind === "theme" ? { ...prev, loading: false, options } : prev));
      return;
    }

    const rc = restRef.current;
    if (!rc || !contextId) return;

    try {
      if (kind === "model") {
        const [presets, state] = await Promise.all([
          rc.modelPresets({ action: "get" }),
          rc.modelSwitcher({ action: "get", context_id: contextId }) as Promise<{
            override?: { preset_name?: string } | null;
          }>,
        ]);
        const current = state.override?.preset_name;
        const options: SubMenuOption[] = (presets.presets ?? []).map((p) => ({
          label: p.name === current ? `${p.name} (active)` : p.name,
          value: p.name,
        }));
        setSubMenu((prev) => (prev && prev.kind === "model" ? { ...prev, loading: false, options } : prev));
      } else if (kind === "skill") {
        const result = await rc.listSkills({ contextId });
        const options: SubMenuOption[] = (result.data ?? []).map((s) => ({
          label: `${s.name} [${s.origin}]`,
          value: s.path,
        }));
        setSubMenu((prev) => (prev && prev.kind === "skill" ? { ...prev, loading: false, options } : prev));
      } else if (kind === "agent") {
        const [agents, chats] = await Promise.all([rc.listAgents(), rc.listChats()]);
        const current = chats.contexts.find((c) => c.id === contextId)?.agent_profile as string | undefined;
        const options: SubMenuOption[] = (agents.data ?? []).map((a) => ({
          label: a.key === current ? `${a.label} (active)` : a.label,
          value: a.key,
        }));
        setSubMenu((prev) => (prev && prev.kind === "agent" ? { ...prev, loading: false, options } : prev));
      } else {
        const { contexts } = await rc.listChats();
        const options: SubMenuOption[] = (contexts as unknown as ChatSummary[] ?? []).map((c) => {
          const label = c.name || "(unnamed)";
          const running = c.running ? " [running]" : "";
          return {
            label: c.id === contextId ? `${label} — ${c.id} (current)${running}` : `${label} — ${c.id}${running}`,
            value: c.id,
          };
        });
        setSubMenu((prev) => (prev && prev.kind === "chat" ? { ...prev, loading: false, options } : prev));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSubMenu((prev) => (prev && prev.kind === kind ? { ...prev, loading: false, error: message } : prev));
    }
  };

  const handleSubMenuSelect = async (value: string) => {
    const kind = subMenu?.kind;
    setSubMenu(null);
    if (kind === "model") await handleSlashCommand(`/model use ${value}`);
    else if (kind === "skill") await handleSlashCommand(`/skill activate ${value}`);
    else if (kind === "agent") await handleSlashCommand(`/agent use ${value}`);
    else if (kind === "chat" && value !== contextId) {
      clearTerminal();
      setLines([]);
      setStaticLines([]);
      setContextId(value);
      appendStatus(`Switched to chat ${value}`);
    } else if (kind === "theme") {
      setThemeNameState(value);
      setThemeName(value);
      appendStatus(`Theme switched to ${value}`);
    }
  };

  const handlePaletteSelect = async (command: string) => {
    setPaletteOpen(false);
    if (
      command === "/model" ||
      command === "/skill" ||
      command === "/agent" ||
      command === "/chat" ||
      command === "/theme"
    ) {
      await openSubMenu(command.slice(1) as "model" | "skill" | "agent" | "chat" | "theme");
      return;
    }
    // Commands that need a free-text argument (no picker for it, e.g. a
    // filesystem path) can't just run — drop the command into the input box
    // with a trailing space instead, so the user types the rest and hits
    // Enter themselves. Signaled by PALETTE_ACTIONS giving them a value
    // that already ends in a space (see CommandPalette.tsx's "Attach file").
    if (command.endsWith(" ")) {
      setInput(command);
      return;
    }
    await handleSlashCommand(command);
  };

  const handleSubmit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !wsRef.current || !ready) return;

    if (trimmed === "/exit" || trimmed === "/quit") {
      exit();
      return;
    }

    if (trimmed.startsWith("/")) {
      setInput("");
      const handled = await handleSlashCommand(trimmed);
      if (handled) return;
    }

    setInput("");

    // The server processes one turn per context at a time (see chat_ensure's
    // ownership model) — firing sendMessage while a turn is still streaming
    // would just be a second concurrent turn stepping on the first. Queue it
    // instead; onComplete/onError above drain the queue automatically.
    if (busy) {
      enqueueMessage(trimmed);
      return;
    }

    await sendToAgent(trimmed);
  };

  if (!wsReady) {
    return (
      <Box>
        <Text dimColor>Connecting...</Text>
      </Box>
    );
  }

  if (!contextId) {
    return (
      <LaunchScreen
        projectDir={projectDir}
        defaultContextId={defaultContextId}
        rest={restRef.current!}
        theme={theme}
        onSelect={setContextId}
      />
    );
  }

  return (
    <Box flexDirection="column" width="100%">
      <Box marginBottom={1}>
        <Text bold color={connected ? "green" : "red"}>
          {connected ? "● connected" : "○ disconnected"}
        </Text>
        <Text dimColor> — context {contextId} — {projectDir}</Text>
        {activePreset ? <Text dimColor> — model: {activePreset}</Text> : null}
        {!ready ? <Text color="yellow"> (preparing chat...)</Text> : null}
      </Box>

      <Static items={groupToolCards(staticLines)}>
        {(item) => renderTranscriptItem(item, theme, toolCardsExpanded)}
      </Static>

      <Box flexDirection="column" marginBottom={1}>
        {groupToolCards(lines).map((item) => renderTranscriptItem(item, theme, toolCardsExpanded))}
      </Box>

      {helpOpen ? (
        <HelpHint theme={theme} onClose={() => setHelpOpen(false)} />
      ) : paletteOpen ? (
        <CommandPalette onSelect={handlePaletteSelect} onCancel={() => setPaletteOpen(false)} />
      ) : subMenu ? (
        <SubMenu
          title={subMenu.title}
          loading={subMenu.loading}
          error={subMenu.error}
          options={subMenu.options}
          onSelect={handleSubMenuSelect}
          onCancel={() => setSubMenu(null)}
        />
      ) : (
        <Box flexDirection="column">
          <Box>
            <Text color="cyan">{"> "}</Text>
            <TextInput value={input} onChange={handleInputChange} onSubmit={handleSubmit} />
            {busy ? (
              <Text color="yellow">
                {" "}
                <Spinner type="dots" />
              </Text>
            ) : null}
          </Box>
          {pendingAttachmentsRef.current.length > 0 ? (
            <Text color={theme.dim} dimColor>
              📎 {pendingAttachmentsRef.current.length} attachment
              {pendingAttachmentsRef.current.length === 1 ? "" : "s"} staged — sent with your next message
            </Text>
          ) : null}
          <QueuedMessages queued={queueRef.current} theme={theme} />
        </Box>
      )}
    </Box>
  );
}
