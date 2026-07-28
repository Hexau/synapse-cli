import React, { useEffect, useState } from "react";
import * as path from "path";
import { Box, Text, useApp, useInput } from "ink";
import { Select } from "@inkjs/ui";
import { SynapseRestClient } from "@synapse/protocol";
import { fuzzyRank } from "../lib/fuzzy.js";
import { Theme } from "../theme.js";

interface ChatSummary {
  id: string;
  name?: string;
  running?: boolean;
  agent_profile?: string;
  project_name?: string;
}

interface LaunchOption {
  label: string;
  value: string;
  isNew?: boolean;
}

export interface LaunchScreenProps {
  projectDir: string;
  defaultContextId: string;
  rest: SynapseRestClient;
  theme: Theme;
  onSelect: (contextId: string) => void;
}

const NEW_CHAT_VALUE = "__new_chat__";

// First thing the user sees on startup — replaces the old behavior of
// silently loading whatever chat this directory's deterministic id last
// pointed to. Reuses the exact same listChats()/createChat() calls the
// in-session /chat and /chat new commands already use (App.tsx) — this is
// just those same actions surfaced before a context is chosen, not new
// backend behavior.
export function LaunchScreen({ projectDir, defaultContextId, rest, theme, onSelect }: LaunchScreenProps) {
  const { exit } = useApp();
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<LaunchOption[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    rest
      .listChats()
      .then(({ contexts }) => {
        if (cancelled) return;
        const chats = (contexts ?? []) as unknown as ChatSummary[];
        const folderChat = chats.find((c) => c.id === defaultContextId);

        const entries: LaunchOption[] = [];
        entries.push({ label: "+ New chat", value: NEW_CHAT_VALUE, isNew: true });
        entries.push({
          label: folderChat
            ? `This folder — ${defaultContextId}${folderChat.name ? ` (${folderChat.name})` : ""}`
            : `This folder — ${defaultContextId} (new)`,
          value: defaultContextId,
        });
        for (const c of chats) {
          if (c.id === defaultContextId) continue; // already listed above
          const label = c.name || "(unnamed)";
          const profile = c.agent_profile ? ` [${c.agent_profile}]` : "";
          const running = c.running ? " [running]" : "";
          const project = c.project_name ? ` (${c.project_name})` : "";
          entries.push({ label: `${label} — ${c.id}${profile}${running}${project}`, value: c.id });
        }
        setOptions(entries);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
        // Still usable even if listing chats failed — the two synthesized
        // entries above don't depend on the server.
        setOptions([
          { label: "+ New chat", value: NEW_CHAT_VALUE, isNew: true },
          { label: `This folder — ${defaultContextId}`, value: defaultContextId },
        ]);
      });
    return () => {
      cancelled = true;
    };
  }, [rest, defaultContextId]);

  useInput((inputChar, key) => {
    if (creating) return;
    if (key.escape) {
      exit();
      return;
    }
    if (key.backspace || key.delete) {
      setFilter((f) => f.slice(0, -1));
      return;
    }
    if (inputChar && !key.upArrow && !key.downArrow && !key.return) {
      setFilter((f) => f + inputChar);
    }
  });

  const handleChange = async (value: string) => {
    if (value === NEW_CHAT_VALUE) {
      setCreating(true);
      try {
        const created = (await rest.createChat()) as { context_id?: string };
        if (created.context_id) {
          onSelect(created.context_id);
        } else {
          setError("Failed to create a new chat: no context_id in response.");
          setCreating(false);
        }
      } catch (err) {
        setError(`Failed to create a new chat: ${err instanceof Error ? err.message : String(err)}`);
        setCreating(false);
      }
      return;
    }
    onSelect(value);
  };

  const filtered = fuzzyRank(options, filter, (o) => o.label).map((r) => r.item);
  const projectName = path.basename(projectDir);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} flexDirection="column">
        <Text bold color={theme.accent}>
          ◈ Synapse — terminal client
        </Text>
        <Text dimColor>
          Synapse es el agente de desarrollo del equipo — chatea, edita archivos y ejecuta código
        </Text>
        <Text dimColor>directamente en tu proyecto, con memoria persistente por chat.</Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Text bold color={theme.you}>
          {projectName}
        </Text>
        <Text dimColor>{projectDir}</Text>
      </Box>

      {creating ? (
        <Text color={theme.accent}>Creating a new chat...</Text>
      ) : (
        <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={1}>
          <Text color={theme.accent} bold>
            Elige un chat para continuar, o inicia uno nuevo {filter ? `— filter: ${filter}` : ""}
          </Text>
          {error ? <Text color={theme.error}>{error}</Text> : null}
          {loading ? (
            <Text dimColor>Loading chats...</Text>
          ) : filtered.length === 0 ? (
            <Text dimColor>No matches.</Text>
          ) : (
            <Select
              options={filtered.map((o) => ({ label: o.label, value: o.value }))}
              onChange={handleChange}
            />
          )}
          <Text dimColor>↑↓ navigate · type to filter · Enter select · Esc exit</Text>
        </Box>
      )}
    </Box>
  );
}
