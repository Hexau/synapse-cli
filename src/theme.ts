export interface Theme {
  name: string;
  you: string;
  assistant: string;
  tool: string;
  code: string;
  error: string;
  warn: string;
  status: string;
  accent: string;
  dim: string;
}

export const THEMES: Record<string, Theme> = {
  dark: {
    name: "dark",
    you: "cyan",
    assistant: "green",
    tool: "yellow",
    code: "magenta",
    error: "red",
    warn: "redBright",
    status: "gray",
    accent: "cyan",
    dim: "gray",
  },
  light: {
    name: "light",
    you: "blue",
    assistant: "black",
    tool: "yellow",
    code: "magenta",
    error: "red",
    warn: "yellow",
    status: "gray",
    accent: "blue",
    dim: "gray",
  },
  mono: {
    name: "mono",
    you: "white",
    assistant: "white",
    tool: "gray",
    code: "gray",
    error: "white",
    warn: "white",
    status: "gray",
    accent: "white",
    dim: "gray",
  },
};

export const DEFAULT_THEME = "dark";

export function resolveTheme(name: string | undefined): Theme {
  return THEMES[name || DEFAULT_THEME] || THEMES[DEFAULT_THEME];
}
