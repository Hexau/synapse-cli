import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Select } from "@inkjs/ui";
import { fuzzyRank } from "../lib/fuzzy.js";

export interface SubMenuOption {
  label: string;
  value: string;
}

export interface SubMenuProps {
  title: string;
  loading: boolean;
  error?: string | null;
  options: SubMenuOption[];
  onSelect: (value: string) => void;
  onCancel: () => void;
}

// Second-level picker opened from a CommandPalette action that needs a
// target (e.g. "/model" -> pick a preset). Unlike CommandPalette, the
// option list is fetched from the server, so this also renders loading
// and empty/error states instead of assuming data is already there.
export function SubMenu({ title, loading, error, options, onSelect, onCancel }: SubMenuProps) {
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

  // Fuzzy match instead of showing the raw fetched list unfiltered — matters
  // most here (vs. CommandPalette's fixed 10 actions) since these lists come
  // from the server and can grow past what fits on screen (model presets,
  // skills, chats).
  const filtered = fuzzyRank(options, filter, (o) => o.label).map((r) => r.item);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>
        {title} {filter ? `— filter: ${filter}` : ""}
      </Text>
      {loading ? (
        <Text dimColor>Loading...</Text>
      ) : error ? (
        <Text color="red">{error}</Text>
      ) : filtered.length === 0 ? (
        <Text dimColor>{options.length === 0 ? "Nothing to select." : "No matches."}</Text>
      ) : (
        <Select options={filtered} onChange={onSelect} />
      )}
      <Text dimColor>↑↓ navigate · type to filter · Enter select · Esc cancel</Text>
    </Box>
  );
}
