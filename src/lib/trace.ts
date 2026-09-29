import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import type { SessionGoal } from "@synapse/protocol";

// Resolves the installed package's version without relying on a JSON module
// import (rootDir is "src", so package.json — one level above dist/lib/ once
// compiled — falls outside what tsc will let us `import`). Read it at
// runtime instead, relative to this module's own compiled location:
// dist/lib/trace.js -> ../../package.json is the package root in both the
// source checkout and an installed copy (package.json always ships next to
// dist/, see package.json's "files").
function resolveCliVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(here, "..", "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

export interface TraceLogEvent {
  sequence?: number;
  event: string;
  heading?: string;
  text?: string;
  timestamp?: string;
}

export interface TraceInput {
  serverUrl: string;
  apiTokenConfigured: boolean;
  contextId: string;
  projectDir: string;
  connected: boolean;
  ready: boolean;
  activePreset: string | null;
  tokenStatus: { tokenCount: number | null; contextWindow: number | null };
  sessionGoal: SessionGoal | null;
  logEvents: TraceLogEvent[];
  /** Set when the recent-activity fetch itself failed — surfaced as its own
   * section note instead of silently omitting the section. */
  logError?: string;
}

const MAX_LOG_LINES = 50;
const MAX_LINE_CHARS = 500;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… (truncated, ${text.length} chars total)`;
}

function formatGoal(goal: SessionGoal | null): string {
  if (!goal) return "No active goal.";
  const lines = [
    `- status: ${goal.status}`,
    `- objective: ${goal.objective}`,
    `- turns used: ${goal.turns_used}`,
    `- token budget: ${goal.token_budget ?? "(none)"}`,
  ];
  if (goal.note) lines.push(`- note: ${goal.note}`);
  return lines.join("\n");
}

function formatTokenStatus(status: TraceInput["tokenStatus"]): string {
  if (status.tokenCount == null || status.contextWindow == null || status.contextWindow <= 0) {
    return "Not available (no turn has completed yet this session).";
  }
  const pct = Math.round((status.tokenCount / status.contextWindow) * 100);
  return `${status.tokenCount.toLocaleString()} / ${status.contextWindow.toLocaleString()} tokens (${pct}%)`;
}

function formatLogEvents(events: TraceLogEvent[], logError?: string): string {
  if (logError) return `Could not fetch recent activity: ${logError}`;
  if (events.length === 0) return "(no recent activity)";
  const recent = events.slice(-MAX_LOG_LINES);
  return recent
    .map((e) => {
      const label = e.heading || e.text || "";
      const body = truncate(label.replace(/\s+/g, " ").trim(), MAX_LINE_CHARS);
      const ts = e.timestamp ? `${e.timestamp} ` : "";
      return `- ${ts}[${e.event}] ${body || "(empty)"}`;
    })
    .join("\n");
}

// Builds the trace document. Redaction rule: the raw API token NEVER
// appears here — only whether one is configured — since this file is meant
// to be pasted into a bug report or shared with someone helping debug.
export function buildTraceMarkdown(input: TraceInput): string {
  const version = resolveCliVersion();
  const generatedAt = new Date().toISOString();

  return `# Synapse CLI Trace

> Review before sharing — this file may contain paths, commands, or file
> contents from your session. The API token is redacted, but transcript
> excerpts below are not.

Generated: ${generatedAt}

## Session

- synapse-cli version: ${version}
- server URL: ${input.serverUrl}
- API token: ${input.apiTokenConfigured ? "configured (redacted)" : "not configured"}
- context/chat id: ${input.contextId}
- project directory: ${input.projectDir}
- websocket: ${input.connected ? "connected" : "disconnected"}
- chat ready: ${input.ready ? "yes" : "no"}

## Model / agent

- active model preset: ${input.activePreset ?? "(default — no override)"}

## Token usage

${formatTokenStatus(input.tokenStatus)}

## Goal

${formatGoal(input.sessionGoal)}

## Recent activity (last ${Math.min(input.logEvents.length, MAX_LOG_LINES)} of ${input.logEvents.length} fetched)

${formatLogEvents(input.logEvents, input.logError)}
`;
}

export function writeTraceFile(markdown: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(os.tmpdir(), `synapse-trace-${stamp}.md`);
  fs.writeFileSync(filePath, markdown, "utf8");
  return filePath;
}
