// Project-local prompt shortcuts — the Synapse equivalent of Pi's
// `.pi/prompts/*.md` and Claude Code's `.claude/commands/`. Templates live in
// the project repo under `.synapse/prompts/<name>.md`, versioned alongside the
// code, so a team shares recurring prompts (release checklists, PR-review
// flows, etc.) the same way they share skills. Resolved entirely CLI-side and
// sent to the agent as an ordinary message — no backend change.

import fs from "node:fs";
import path from "node:path";

export interface PromptTemplate {
  name: string;
  description?: string;
  body: string;
  file: string;
}

/** Directory holding project-local prompt templates, relative to cwd. */
export function promptsDir(cwd: string = process.cwd()): string {
  return path.join(cwd, ".synapse", "prompts");
}

/** Parse optional `--- ... ---` frontmatter, returning its `description` and the body. */
function parseTemplate(raw: string): { description?: string; body: string } {
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fm) return { body: raw.trim() };
  const desc = fm[1].match(/^description:\s*(.+?)\s*$/m);
  return { description: desc?.[1]?.replace(/^["']|["']$/g, ""), body: fm[2].trim() };
}

/** List every `.md` template in the project's prompts dir (empty if none). */
export function listPrompts(cwd: string = process.cwd()): PromptTemplate[] {
  const dir = promptsDir(cwd);
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return []; // no .synapse/prompts here — feature is simply inactive
  }
  const out: PromptTemplate[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const file = path.join(dir, entry);
    try {
      const parsed = parseTemplate(fs.readFileSync(file, "utf8"));
      out.push({ name: entry.slice(0, -3), description: parsed.description, body: parsed.body, file });
    } catch {
      // Unreadable file — skip it rather than failing the whole listing.
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Expand a named template into a ready-to-send message. `args` (everything the
 * user typed after the name) replaces `$@` / `$ARGUMENTS`; if the template has
 * neither placeholder and args were given, they're appended on a new line.
 * Returns null when no template by that name exists.
 */
export function expandPrompt(
  name: string,
  args: string,
  cwd: string = process.cwd()
): string | null {
  const tpl = listPrompts(cwd).find((p) => p.name === name);
  if (!tpl) return null;
  const hasPlaceholder = /\$@|\$ARGUMENTS\b/.test(tpl.body);
  let body = tpl.body.replace(/\$@|\$ARGUMENTS\b/g, args);
  if (!hasPlaceholder && args.trim()) body = `${body}\n\n${args.trim()}`;
  return body;
}
