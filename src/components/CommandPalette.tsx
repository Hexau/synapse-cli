import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Select } from "@inkjs/ui";
import { fuzzyRank } from "../lib/fuzzy.js";

export interface PaletteAction {
  label: string;
  value: string; // the slash command this action runs, e.g. "/model"
  hint?: string;
}

// Fase A scope: only actions that run with no extra argument (see the plan
// — actions needing a target, like "/model use <name>", get a proper
// second-level picker in Fase B instead of a raw text prompt here).
export const PALETTE_ACTIONS: PaletteAction[] = [
  { label: "Model", value: "/model", hint: "show current model + presets" },
  { label: "Skill", value: "/skill", hint: "list available skills" },
  { label: "Agent", value: "/agent", hint: "list agent profiles" },
  { label: "Chat", value: "/chat", hint: "switch to another chat" },
  { label: "New chat", value: "/chat new", hint: "start a fresh chat in this directory" },
  { label: "Attach file", value: "/attach ", hint: "attach a file (e.g. a screenshot) — type the path" },
  { label: "Pause", value: "/pause", hint: "pause the running agent" },
  { label: "Resume", value: "/resume", hint: "resume a paused agent" },
  { label: "Compact", value: "/compact", hint: "compact this chat's history" },
  { label: "Prompts", value: "/prompts", hint: "list this project's prompt shortcuts" },
  { label: "Run prompt", value: "/run ", hint: "run a project prompt shortcut — type its name" },
  { label: "Goal", value: "/goal", hint: "show the active session goal" },
  { label: "Set goal", value: "/goal ", hint: "give the agent an objective to keep working toward — type it" },
  { label: "Pause goal", value: "/goal pause", hint: "stop auto-continuation without losing progress" },
  { label: "Resume goal", value: "/goal resume", hint: "resume a paused goal — nudges the agent right away" },
  { label: "Clear chat", value: "/clear", hint: "reset this chat" },
  { label: "Theme", value: "/theme", hint: "switch color theme" },
  { label: "Trace", value: "/trace", hint: "write a redacted diagnostic file to share when reporting a bug" },
  { label: "Help", value: "/help", hint: "list all slash commands" },
];

export function CommandPalette({
  onSelect,
  onCancel,
}: {
  onSelect: (command: string) => void;
  onCancel: () => void;
}) {
  const [filter, setFilter] = useState("");

  useInput((inputChar, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.backspace || key.delete) {
      setFilter((f) => f.slice(0, -1));
      return;
    }
    // Printable characters narrow the list; Select handles arrows/enter itself.
    if (inputChar && !key.upArrow && !key.downArrow && !key.return) {
      setFilter((f) => f + inputChar);
    }
  });

  // Fuzzy subsequence match instead of plain substring — lets "gnt" find
  // "Agent" and ranks by match quality (prefix/word-boundary/contiguity)
  // rather than just first-match order. See lib/fuzzy.ts.
  const filtered = fuzzyRank(PALETTE_ACTIONS, filter, (a) => a.label).map((r) => r.item);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>
        Command Palette {filter ? `— filter: ${filter}` : ""}
      </Text>
      {filtered.length === 0 ? (
        <Text dimColor>No matching commands.</Text>
      ) : (
        <Select
          options={filtered.map((a) => ({
            label: a.hint ? `${a.label} — ${a.hint}` : a.label,
            value: a.value,
          }))}
          onChange={onSelect}
        />
      )}
      <Text dimColor>↑↓ navigate · type to filter · Enter select · Esc cancel</Text>
    </Box>
  );
}
