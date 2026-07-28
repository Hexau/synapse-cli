import React from "react";
import { Box, Text } from "ink";
import { Theme } from "../theme.js";

export interface MarkdownProps {
  text: string;
  color: string;
  theme: Theme;
}

// Terminal markdown renderer — no dependency, covers the subset Agent-Zero's
// assistant responses actually use in practice (headers, bold, inline code,
// fenced code blocks with language label, bullet/nested lists, blockquotes,
// links, tables). Not a full CommonMark parser. The table/list-indent/
// blockquote/link handling here follows the same detection logic as Hermes
// Agent's ui-tui/src/components/markdown.tsx (splitRow/isTableDivider/
// indentDepth), rewritten against plain ink instead of their @hermes/ink
// fork — we don't pull in their vendored Ink, just the parsing approach.
export function Markdown({ text, color, theme }: MarkdownProps) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block — captures the language tag (```tsx) as a small label.
    const fenceMatch = /^```(\S*)\s*$/.exec(line.trim());
    if (fenceMatch) {
      const lang = fenceMatch[1];
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push(
        <Box key={key++} flexDirection="column" borderStyle="round" borderColor={theme.dim} paddingX={1}>
          {lang ? <Text color={theme.dim}>{lang}</Text> : null}
          {codeLines.map((l, idx) => (
            <Text key={idx} color={theme.code}>
              {l || " "}
            </Text>
          ))}
        </Box>
      );
      continue;
    }

    // Table: a "| a | b |" row followed by a "|---|---|" divider row.
    if (isTableRow(line) && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push(renderTable(key++, header, rows, color, theme));
      continue;
    }

    // Headers
    const headerMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headerMatch) {
      blocks.push(
        <Text key={key++} color={theme.accent} bold underline>
          {headerMatch[2]}
        </Text>
      );
      i++;
      continue;
    }

    // Blockquote
    const quoteMatch = /^\s*>\s?(.*)$/.exec(line);
    if (quoteMatch) {
      blocks.push(
        <Text key={key++} color={theme.dim}>
          {"┃ "}
          {renderInline(quoteMatch[1], theme.dim, theme)}
        </Text>
      );
      i++;
      continue;
    }

    // Bullet list item — indentation (2 spaces or 1 tab per level) nests it.
    const bulletMatch = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (bulletMatch) {
      const depth = indentDepth(bulletMatch[1]);
      blocks.push(
        <Text key={key++} color={color}>
          {"  ".repeat(depth + 1) + "• "}
          {renderInline(bulletMatch[2], color, theme)}
        </Text>
      );
      i++;
      continue;
    }

    if (line.trim() === "") {
      blocks.push(<Text key={key++}> </Text>);
      i++;
      continue;
    }

    blocks.push(
      <Text key={key++} color={color}>
        {renderInline(line, color, theme)}
      </Text>
    );
    i++;
  }

  return <Box flexDirection="column">{blocks}</Box>;
}

const indentDepth = (s: string) => Math.floor(s.replace(/\t/g, "  ").length / 2);

const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);

const isTableDivider = (line: string) => {
  if (!isTableRow(line)) return false;
  return splitRow(line).every((cell) => /^:?-+:?$/.test(cell.trim()));
};

const splitRow = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

function renderTable(key: number, header: string[], rows: string[][], color: string, theme: Theme): React.ReactNode {
  const widths = header.map((h, col) =>
    Math.max(h.length, ...rows.map((r) => (r[col] || "").length))
  );
  const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));
  const renderRow = (cells: string[], rowKey: string, bold?: boolean) => (
    <Text key={rowKey} color={color} bold={bold}>
      {cells.map((c, col) => pad(c, widths[col])).join("  ")}
    </Text>
  );

  return (
    <Box key={key} flexDirection="column">
      {renderRow(header, "header", true)}
      <Text color={theme.dim}>{widths.map((w) => "─".repeat(w)).join("  ")}</Text>
      {rows.map((r, idx) => renderRow(r, `row-${idx}`))}
    </Box>
  );
}

// Splits a line on **bold**, `code`, and [label](url) spans, rendering each
// with the right style — Ink Text doesn't parse markup itself, so this has
// to happen here.
function renderInline(line: string, color: string, theme: Theme): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(
        <Text key={key++} color={color} bold>
          {token.slice(2, -2)}
        </Text>
      );
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)!;
      parts.push(
        <Text key={key++}>
          <Text color={theme.accent} underline>
            {linkMatch[1]}
          </Text>
          <Text color={theme.dim}> ({linkMatch[2]})</Text>
        </Text>
      );
    } else {
      parts.push(
        <Text key={key++} color={theme.code}>
          {token.slice(1, -1)}
        </Text>
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }
  return parts;
}
