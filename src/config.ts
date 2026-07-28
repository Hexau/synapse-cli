import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

interface GlobalConfig {
  serverUrl?: string;
  apiToken?: string;
  theme?: string;
}

interface ProjectSession {
  context_id?: string;
}

const GLOBAL_CONFIG_DIR = path.join(os.homedir(), ".synapse");
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CONFIG_DIR, "config.json");

const DEFAULT_SERVER_URL = "http://localhost:50080";

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function getGlobalConfig(): GlobalConfig {
  return readJson<GlobalConfig>(GLOBAL_CONFIG_PATH) ?? {};
}

export function setGlobalConfig(patch: Partial<GlobalConfig>): GlobalConfig {
  const merged = { ...getGlobalConfig(), ...patch };
  writeJson(GLOBAL_CONFIG_PATH, merged);
  return merged;
}

export function resolveServerUrl(): string {
  return getGlobalConfig().serverUrl || DEFAULT_SERVER_URL;
}

export function resolveApiToken(): string {
  return getGlobalConfig().apiToken || "";
}

export function resolveThemeName(): string | undefined {
  return getGlobalConfig().theme;
}

export function setThemeName(theme: string): void {
  setGlobalConfig({ theme });
}

// Same derivation as synapse-vscode's extension.ts computeAutoContextId():
// hostname + workspace path, so a CLI running in the same directory a
// developer already has open in VSCode lands on the SAME context —
// continuing that conversation instead of starting a parallel one. If a
// .synapse/session.json already recorded a context_id for this directory
// (e.g. a manual override, or one created before this derivation existed),
// that value wins.
function deriveAutoContextId(projectDir: string): string {
  const raw = `${os.hostname()}|${projectDir}`;
  return crypto.createHash("md5").update(raw).digest("hex").slice(0, 8);
}

function sessionPath(projectDir: string): string {
  return path.join(projectDir, ".synapse", "session.json");
}

export function resolveContextId(projectDir: string): string {
  const existing = readJson<ProjectSession>(sessionPath(projectDir));
  if (existing?.context_id) return existing.context_id;

  const derived = deriveAutoContextId(projectDir);
  writeJson(sessionPath(projectDir), { context_id: derived });
  return derived;
}
