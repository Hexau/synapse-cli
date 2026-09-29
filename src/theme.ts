// Thin re-export of @synapse/tokens' terminal palette — the CLI's own theme
// values now live there (single source of truth shared with synapse-vscode
// and the WebUI's web palette; see synapse-tokens/src/terminal.ts). This
// file keeps its original name and public API (Theme/THEMES/DEFAULT_THEME/
// resolveTheme) so App.tsx's existing imports need no changes.
export {
  TerminalTheme as Theme,
  TERMINAL_THEMES as THEMES,
  DEFAULT_TERMINAL_THEME as DEFAULT_THEME,
  resolveTerminalTheme as resolveTheme,
} from "@synapse/tokens";
