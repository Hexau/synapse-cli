import { SynapseRestClient } from "@synapse/protocol";
import { resolveServerUrl, resolveApiToken, resolveContextId } from "../config.js";

function client(): SynapseRestClient {
  return new SynapseRestClient({ serverUrl: resolveServerUrl(), apiToken: resolveApiToken() });
}

interface ChatSummary {
  id: string;
  name?: string;
  agent_profile?: string;
  running?: boolean;
  last_message?: string;
  project_name?: string;
}

function formatChat(c: ChatSummary, here: string): string {
  const marker = c.id === here ? "* " : "  ";
  const status = c.running ? " [running]" : "";
  const label = c.name || "(unnamed)";
  return `${marker}${c.id}${status} — ${label} [${c.agent_profile || "default"}]${
    c.project_name ? ` (${c.project_name})` : ""
  }`;
}

export async function runChatCommand(args: string[]): Promise<void> {
  const rest = client();
  const here = resolveContextId(process.cwd());
  const [sub, target] = args;

  if (!sub || sub === "list") {
    const { contexts } = await rest.listChats();
    if (!contexts?.length) {
      console.log("No chats found.");
      return;
    }
    console.log(`${contexts.length} chat(s) — '*' marks this directory's chat:\n`);
    (contexts as unknown as ChatSummary[]).forEach((c) => console.log(formatChat(c, here)));
    console.log("\nUsage: synapse chat reset [id]  |  synapse chat delete <id>  |  synapse chat logs [id]");
    return;
  }

  if (sub === "reset") {
    const id = target || here;
    await rest.resetChat(id);
    console.log(`Chat reset: ${id}`);
    return;
  }

  if (sub === "delete") {
    if (!target) {
      console.error("Usage: synapse chat delete <id> (no default — this is destructive)");
      process.exitCode = 1;
      return;
    }
    await rest.deleteChat(target);
    console.log(`Chat deleted: ${target}`);
    return;
  }

  if (sub === "logs") {
    const id = target || here;
    const result = await rest.logTail(id, 0, 50);
    const events = (result as { events?: Array<{ event: string; data?: { text?: string; heading?: string } }> })
      .events;
    if (!events?.length) {
      console.log("(no log entries)");
      return;
    }
    for (const e of events) {
      const text = e.data?.heading || e.data?.text || "";
      if (text) console.log(`[${e.event}] ${text}`);
    }
    return;
  }

  console.error(`Unknown chat subcommand: ${sub}`);
  console.error("Usage: synapse chat [list|reset [id]|delete <id>|logs [id]]");
  process.exitCode = 1;
}
