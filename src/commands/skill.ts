import { SynapseRestClient, SkillSummary } from "@synapse/protocol";
import { resolveServerUrl, resolveApiToken, resolveContextId } from "../config.js";

function client(): SynapseRestClient {
  return new SynapseRestClient({ serverUrl: resolveServerUrl(), apiToken: resolveApiToken() });
}

function formatSkill(s: SkillSummary, index: number): string {
  return `${index + 1}. ${s.name} [${s.origin}]\n     ${s.description}\n     ${s.path}`;
}

export async function runSkillCommand(args: string[]): Promise<void> {
  const rest = client();
  const contextId = resolveContextId(process.cwd());
  const [sub, target] = args;

  if (!sub || sub === "list") {
    const result = await rest.listSkills({ contextId });
    if (!result.data?.length) {
      console.log("No skills found.");
      return;
    }
    console.log(`${result.data.length} skill(s) available:\n`);
    result.data.forEach((s, i) => console.log(formatSkill(s, i)));
    console.log("\nUsage: synapse skill activate <path>  |  synapse skill delete <path>");
    return;
  }

  if (sub === "activate") {
    if (!target) {
      console.error("Usage: synapse skill activate <path>");
      process.exitCode = 1;
      return;
    }
    await rest.ensureChat(contextId);
    await rest.activateSkill(contextId, target);
    console.log(`Skill activated for this directory's chat: ${target}`);
    return;
  }

  if (sub === "delete") {
    if (!target) {
      console.error("Usage: synapse skill delete <path>");
      process.exitCode = 1;
      return;
    }
    // Destructive — removes the skill's files from disk. Same action the
    // WebUI's skill manager exposes, so no extra gate beyond confirming the
    // exact path was typed (a typo here can't silently hit the wrong skill).
    await rest.deleteSkill(target);
    console.log(`Skill deleted: ${target}`);
    return;
  }

  console.error(`Unknown skill subcommand: ${sub}`);
  console.error("Usage: synapse skill [list|activate <path>|delete <path>]");
  process.exitCode = 1;
}
