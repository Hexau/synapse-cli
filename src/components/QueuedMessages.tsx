import React from "react";
import { Box, Text } from "ink";
import { Theme } from "../theme.js";

export interface QueuedMessagesProps {
  queued: string[];
  theme: Theme;
}

// Shows messages submitted while a turn was still running (see App.tsx's
// enqueueMessage/dequeueMessage) — pattern from Hermes Agent's
// queuedMessages.tsx, simplified: our queue is realistically 1-3 items (one
// user typing ahead), so no sliding window/pagination is needed, just a
// flat list with a count.
export function QueuedMessages({ queued, theme }: QueuedMessagesProps) {
  if (queued.length === 0) return null;

  return (
    <Box flexDirection="column">
      <Text color={theme.dim} dimColor>
        queued ({queued.length}) — will send after the current turn finishes
      </Text>
      {queued.map((text, idx) => (
        <Text key={idx} color={theme.dim} dimColor>
          {"  "}
          {idx + 1}. {text.length > 80 ? text.slice(0, 77) + "..." : text}
        </Text>
      ))}
    </Box>
  );
}
