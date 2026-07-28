import { SynapseRestClient, AgentProfileSummary } from "@synapse/protocol";
import { resolveServerUrl, resolveApiToken, resolveContextId } from "../config.js";

function client(): SynapseRestClient {
  return new SynapseRestClient({ serverUrl: resolveServerUrl(), apiToken: resolveApiToken() });
}

function formatAgent(a: AgentProfileSummary, current: string): string {
  const marker = a.key === current ? "* " : "  ";
  return `${marker}${a.key} — ${a.label}`;
}

// chats_list is the only endpoint that reports the profile actually bound
// to a given context_id (agent_profile_set can't be queried directly — see
// api/agent_profile_set.py, it's write-only). Look this directory's context
// up in that list rather than assuming "default".
async function currentProfile(rest: SynapseRestClient, contextId: string): Promise<string> {
  const { contexts } = await rest.listChats();
  const match = contexts.find((c) => c.id === contextId);
  return (match?.agent_profile as string) || "default";
}

export async function runAgentCommand(args: string[]): Promise<void> {
  const rest = client();
  const contextId = resolveContextId(process.cwd());
  const [sub, name] = args;

  if (!sub || sub === "list") {
    const [agents, current] = await Promise.all([rest.listAgents(), currentProfile(rest, contextId)]);
    if (!agents.data?.length) {
      console.log("No agent profiles found.");
      return;
    }
    console.log(`Current profile for this directory's chat: ${current}\n`);
    agents.data.forEach((a) => console.log(formatAgent(a, current)));
    console.log("\nUsage: synapse agent use <name>");
    return;
  }

  if (sub === "use") {
    if (!name) {
      console.error("Usage: synapse agent use <name>");
      process.exitCode = 1;
      return;
    }
    await rest.ensureChat(contextId);
    await rest.setAgentProfile(contextId, name);
    console.log(`Agent profile '${name}' is now active for chats in this directory.`);
    return;
  }

  console.error(`Unknown agent subcommand: ${sub}`);
  console.error("Usage: synapse agent [list|use <name>]");
  process.exitCode = 1;
}
