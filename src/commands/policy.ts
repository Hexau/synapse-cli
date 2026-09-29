import { SynapseRestClient } from "@synapse/protocol";
import { resolveServerUrl, resolveApiToken } from "../config.js";

function client(): SynapseRestClient {
  return new SynapseRestClient({ serverUrl: resolveServerUrl(), apiToken: resolveApiToken() });
}

async function runList(): Promise<void> {
  const rc = client();
  const { rules } = await rc.listRememberedPolicyRules();

  if (!rules.length) {
    console.log("No remembered rules.");
    return;
  }
  rules.forEach((rule) => {
    const when = new Date(rule.created_at * 1000).toISOString();
    console.log(`${rule.action_id}  ${rule.decision.padEnd(5)}  ${rule.tool_name}  (${when})`);
  });
}

async function runRemember(args: string[]): Promise<void> {
  const [toolName, decision, argsJson] = args;
  if (!toolName || (decision !== "allow" && decision !== "deny") || !argsJson) {
    console.error('Usage: synapse policy remember <tool_name> <allow|deny> \'{"arg": "value"}\'');
    process.exitCode = 1;
    return;
  }

  let toolArgs: Record<string, unknown>;
  try {
    toolArgs = JSON.parse(argsJson);
  } catch {
    console.error("tool_args must be valid JSON, e.g. '{\"to\": \"a@b.com\"}'");
    process.exitCode = 1;
    return;
  }

  const rc = client();
  const result = await rc.rememberPolicyDecision({ tool_name: toolName, tool_args: toolArgs, decision });
  console.log(`Remembered ${result.decision} for ${result.tool_name} — action_id: ${result.action_id}`);
}

async function runForget(args: string[]): Promise<void> {
  const [actionId] = args;
  if (!actionId) {
    console.error("Usage: synapse policy forget <action_id>");
    process.exitCode = 1;
    return;
  }

  const rc = client();
  await rc.forgetPolicyDecision(actionId);
  console.log(`Forgot rule ${actionId}.`);
}

async function runAudit(args: string[]): Promise<void> {
  const limit = args[0] ? parseInt(args[0], 10) : 50;
  const rc = client();
  const { entries, chain_valid } = await rc.tailPolicyAudit(Number.isNaN(limit) ? 50 : limit);

  console.log(`Audit chain valid: ${chain_valid ? "yes" : "NO — tampered or corrupted"}`);
  if (!entries.length) {
    console.log("(no policy decisions recorded yet)");
    return;
  }
  entries.forEach((entry) => {
    const when = new Date(entry.ts * 1000).toISOString();
    const rule = entry.rule_name ? `rule=${entry.rule_name}` : "default";
    console.log(`${when}  ${entry.verdict.padEnd(5)}  ${entry.tool_name}  (${rule}) — ${entry.reason}`);
  });
}

async function runPending(): Promise<void> {
  const rc = client();
  const { pending } = await rc.listPendingApprovals();

  if (!pending.length) {
    console.log("Nothing waiting on approval right now.");
    return;
  }
  pending.forEach((p) => {
    const when = new Date(p.requested_at * 1000).toISOString();
    console.log(`${p.action_id}  ${p.tool_name}  ${JSON.stringify(p.tool_args)}  (asked ${when})`);
  });
}

async function runResolve(decision: "allow" | "deny", args: string[]): Promise<void> {
  const [actionId] = args;
  if (!actionId) {
    console.error(`Usage: synapse policy ${decision} <action_id>`);
    process.exitCode = 1;
    return;
  }

  const rc = client();
  await rc.approvePendingAction(actionId, decision);
  console.log(`${decision === "allow" ? "Approved" : "Denied"} ${actionId}.`);
}

export async function runPolicyCommand(args: string[]): Promise<void> {
  const [sub, ...rest] = args;

  if (!sub || sub === "list") return runList();
  if (sub === "remember") return runRemember(rest);
  if (sub === "forget") return runForget(rest);
  if (sub === "audit") return runAudit(rest);
  if (sub === "pending") return runPending();
  if (sub === "approve") return runResolve("allow", rest);
  if (sub === "deny") return runResolve("deny", rest);

  console.error("Usage: synapse policy [list|remember|forget|audit|pending|approve|deny] ...");
  process.exitCode = 1;
}
