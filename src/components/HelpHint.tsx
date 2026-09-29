import React from "react";
import { Box, Text, useInput } from "ink";
import { Theme } from "../theme.js";

const COMMANDS: [string, string][] = [
  ["/model", "show/switch model preset"],
  ["/skill", "list/activate a skill"],
  ["/agent", "list/switch agent profile"],
  ["/chat", "switch to another chat"],
  ["/chat new", "start a fresh chat in this directory"],
  ["/attach <path>", "attach a file (e.g. a screenshot) to your next message"],
  ["/theme", "switch color theme"],
  ["/clear", "reset this chat"],
  ["/compact", "compact this chat's history"],
  ["/pause", "pause the running agent"],
  ["/resume", "resume a paused agent"],
  ["/prompts", "list this project's prompt shortcuts (.synapse/prompts/)"],
  ["/run <name>", "run a project prompt shortcut with optional args"],
  ["/goal", "show the active session goal, if any"],
  ["/goal <objective>", "give the agent an objective — it keeps working toward it after each turn"],
  ["/goal pause", "pause auto-continuation without losing progress"],
  ["/goal resume", "resume a paused goal — nudges the agent to continue right away"],
  ["/goal clear", "clear the active goal"],
  ["/trace", "write a redacted diagnostic file to share when reporting a bug"],
  ["/exit", "quit the CLI"],
];

const HOTKEYS: [string, string][] = [
  ["/", "open the command palette"],
  ["Ctrl+T", "toggle tool-call + thinking detail"],
  ["Ctrl+C", "pause (or arm exit — press again to quit)"],
  ["Esc", "cancel a palette/picker"],
];

export interface HelpHintProps {
  theme: Theme;
  onClose: () => void;
}

// Full-panel replacement for the old one-line /help status message —
// pattern adapted from Hermes Agent's ui-tui/src/components/helpHint.tsx
// (columns aligned by the longest label, common commands + hotkeys grouped
// separately), rewritten against plain ink instead of their @hermes/ink
// fork's absolute-positioned overlay — this one just occupies the input's
// slot like CommandPalette/SubMenu already do, no floating overlay needed.
export function HelpHint({ theme, onClose }: HelpHintProps) {
  useInput((_input, key) => {
    if (key.escape || key.backspace || key.delete) onClose();
  });

  const labelWidth = Math.max(...COMMANDS.map(([k]) => k.length), ...HOTKEYS.map(([k]) => k.length));
  const pad = (s: string) => s + " ".repeat(Math.max(0, labelWidth - s.length + 2));

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={1}>
      <Text color={theme.accent} bold>
        Quick help
      </Text>

      <Box marginTop={1}>
        <Text color={theme.accent} bold>
          Commands
        </Text>
      </Box>
      {COMMANDS.map(([k, v]) => (
        <Text key={k}>
          <Text color={theme.you}>{pad(k)}</Text>
          <Text color={theme.dim}>{v}</Text>
        </Text>
      ))}

      <Box marginTop={1}>
        <Text color={theme.accent} bold>
          Hotkeys
        </Text>
      </Box>
      {HOTKEYS.map(([k, v]) => (
        <Text key={k}>
          <Text color={theme.you}>{pad(k)}</Text>
          <Text color={theme.dim}>{v}</Text>
        </Text>
      ))}

      <Box marginTop={1}>
        <Text dimColor>Esc or Backspace to close</Text>
      </Box>
    </Box>
  );
}
