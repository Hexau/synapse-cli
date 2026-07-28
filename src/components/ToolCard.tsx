import React from "react";
import { Box, Text } from "ink";

export interface ToolCardLine {
  sequence: number;
  heading?: string;
  text: string;
}

export interface ToolCardProps {
  lines: ToolCardLine[];
  expanded: boolean;
  color: string;
}

// Renders a run of consecutive tool_start/tool_output/tool_end log lines
// (one Agent-Zero tool invocation typically spans several separate log
// items — see event_bridge.py's _LOG_TYPE_MAP: "tool" and "tool_output"
// are distinct entry types, so they arrive as distinct DisplayLines, not
// one that gets replaced in place like assistant_message does) as a single
// compact card instead of one line per log item — collapsed by default,
// full detail on demand via the global Ctrl+T toggle (see App.tsx).
export function ToolCard({ lines, expanded, color }: ToolCardProps) {
  if (lines.length === 0) return null;

  if (!expanded) {
    const summary = lines[lines.length - 1].heading || lines[lines.length - 1].text || lines[0].heading || "tool call";
    return (
      <Box>
        <Text color={color}>▸ [tool] {summary}</Text>
        {lines.length > 1 ? <Text dimColor> ({lines.length} steps — Ctrl+T to expand)</Text> : null}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color={color} dimColor>
        ▾ [tool] {lines.length} step(s) — Ctrl+T to collapse
      </Text>
      {lines.map((line) => (
        <Box key={line.sequence} flexDirection="column" paddingLeft={2}>
          {line.heading ? <Text color={color}>{line.heading}</Text> : null}
          {line.text ? <Text color={color}>{line.text}</Text> : null}
        </Box>
      ))}
    </Box>
  );
}
