import React from "react";
import { Box, Text } from "ink";
import { Theme } from "../theme.js";
import type { SessionGoal } from "@synapse/protocol";

// Fase 2 - C*HUD de tokens + meta (see docs/decisions/2026-08-17-session-goal.md
// on the backend side). Purely presentational — App.tsx owns fetching
// token_status/session_goal (via refreshHud, called from ws.onComplete) and
// just passes the latest snapshot down. No live polling loop here: the
// context window only changes once per completed turn (see token_status.py's
// own docstring), so refreshing on every ws.onComplete is exactly as fresh
// as the underlying data ever gets.

export interface TokenHudProps {
  theme: Theme;
  tokenCount: number | null;
  contextWindow: number | null;
  goal: SessionGoal | null;
}

function pressureColor(ratio: number): string {
  if (ratio >= 0.9) return "red";
  if (ratio >= 0.7) return "yellow";
  return "green";
}

function goalColor(status: SessionGoal["status"], theme: Theme): string {
  switch (status) {
    case "active":
      return theme.accent;
    case "paused":
      return theme.dim;
    case "complete":
      return "green";
    case "blocked":
      return "red";
    case "budget_limited":
      return "yellow";
    default:
      return theme.dim;
  }
}

function goalLabel(goal: SessionGoal): string {
  if (goal.status === "active") {
    const turns = `${goal.turns_used} turn${goal.turns_used === 1 ? "" : "s"}`;
    return `goal: active (${turns})`;
  }
  return `goal: ${goal.status}`;
}

export function TokenHud({ theme, tokenCount, contextWindow, goal }: TokenHudProps) {
  const showTokens = tokenCount != null && contextWindow != null && contextWindow > 0;
  if (!showTokens && !goal) return null;

  return (
    <Box>
      <Text dimColor> — </Text>
      {showTokens ? (
        <Text color={pressureColor(tokenCount! / contextWindow!)}>
          {tokenCount!.toLocaleString()}/{contextWindow!.toLocaleString()} tok (
          {Math.round((tokenCount! / contextWindow!) * 100)}%)
        </Text>
      ) : null}
      {showTokens && goal ? <Text dimColor> — </Text> : null}
      {goal ? (
        <Text color={goalColor(goal.status, theme)}>
          {goalLabel(goal)}
          {goal.note ? <Text dimColor> · {goal.note}</Text> : null}
        </Text>
      ) : null}
    </Box>
  );
}
