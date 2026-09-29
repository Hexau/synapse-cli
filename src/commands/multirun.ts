import { SynapseRestClient } from "@synapse/protocol";
import type { MultiRunResultRow } from "@synapse/protocol";
import { resolveServerUrl, resolveApiToken } from "../config.js";

function client(): SynapseRestClient {
  return new SynapseRestClient({ serverUrl: resolveServerUrl(), apiToken: resolveApiToken() });
}

function formatResultRow(row: MultiRunResultRow): string {
  const lines = [`--- ${row.variant} ---`];
  if (row.error) {
    lines.push(`error: ${row.error}`);
  } else {
    lines.push(row.response ?? "(no response)");
    lines.push(
      `diff: ${row.files_changed} file(s), +${row.insertions}/-${row.deletions}${
        row.diff_error ? ` (diff error: ${row.diff_error})` : ""
      }`
    );
  }
  return lines.join("\n");
}

async function runStart(args: string[], flags: Record<string, unknown>): Promise<void> {
  const [repoSlug, taskSlug, taskPrompt] = args;
  const variantsFlag = typeof flags.variants === "string" ? flags.variants : null;
  const agentProfile = typeof flags.agentProfile === "string" ? flags.agentProfile : null;

  if (!repoSlug || !taskSlug || !taskPrompt || !variantsFlag) {
    console.error(
      "Usage: synapse multirun start <repo_slug> <task_slug> <task_prompt> --variants a,b [--agent-profile <name>]"
    );
    process.exitCode = 1;
    return;
  }

  const variants = variantsFlag.split(",").map((v) => v.trim()).filter(Boolean);
  const rc = client();
  const result = await rc.startMultiRun({
    repo_slug: repoSlug,
    task_slug: taskSlug,
    task_prompt: taskPrompt,
    variants,
    ...(agentProfile ? { agent_profile: agentProfile } : {}),
  });

  console.log(`Started run ${result.run_id} — variants: ${result.variants.join(", ")}`);
  console.log(`Check progress: synapse multirun status ${result.run_id}`);
}

async function runStatus(args: string[]): Promise<void> {
  const [runId] = args;
  if (!runId) {
    console.error("Usage: synapse multirun status <run_id>");
    process.exitCode = 1;
    return;
  }

  const rc = client();
  const { run } = await rc.getMultiRunStatus(runId);

  console.log(`Run ${run.run_id} (${run.task_slug}) — status: ${run.status}`);
  if (run.status === "failed") {
    console.log(`error: ${run.error}`);
    return;
  }
  if (run.status === "running") {
    console.log("Still running — check back shortly.");
    return;
  }
  if (run.result) {
    console.log("");
    console.log(run.result.results.map(formatResultRow).join("\n\n"));
  }
}

async function runPick(args: string[]): Promise<void> {
  const [repoSlug, runId, winningVariant] = args;
  if (!repoSlug || !runId || !winningVariant) {
    console.error("Usage: synapse multirun pick <repo_slug> <run_id> <winning_variant>");
    process.exitCode = 1;
    return;
  }

  const rc = client();
  const result = await rc.pickMultiRunWinner({
    repo_slug: repoSlug,
    run_id: runId,
    winning_variant: winningVariant,
  });

  console.log(`Merged ${result.merged_branch}.`);
  if (result.cleanup_errors.length) {
    console.log("Cleanup warnings:");
    result.cleanup_errors.forEach((e) => console.log(`  - ${e}`));
  }
}

export async function runMultiRunCommand(
  args: string[],
  flags: Record<string, unknown> = {}
): Promise<void> {
  const [sub, ...rest] = args;

  if (sub === "start") return runStart(rest, flags);
  if (sub === "status") return runStatus(rest);
  if (sub === "pick") return runPick(rest);

  console.error("Usage: synapse multirun [start|status|pick] ...");
  process.exitCode = 1;
}
