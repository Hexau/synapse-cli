import { SynapseRestClient, ModelPreset } from "@synapse/protocol";
import { resolveServerUrl, resolveApiToken, resolveContextId } from "../config.js";

function formatPreset(p: ModelPreset, current?: string): string {
  const marker = p.name === current ? "* " : "  ";
  const chatLabel = `${p.chat.provider}/${p.chat.name}`;
  const utilityLabel = p.utility ? ` (utility: ${p.utility.provider}/${p.utility.name})` : "";
  return `${marker}${p.name} — ${chatLabel}${utilityLabel}`;
}

async function client(): Promise<SynapseRestClient> {
  return new SynapseRestClient({ serverUrl: resolveServerUrl(), apiToken: resolveApiToken() });
}

// model_switcher (per-chat override) requires an AgentContext that already
// exists — same requirement we hit for chat messages, see App.tsx's
// ensureChat() comment. Every subcommand here needs it, so centralize it.
async function ensureContext(rest: SynapseRestClient, contextId: string): Promise<void> {
  await rest.ensureChat(contextId);
}

export async function runModelCommand(args: string[]): Promise<void> {
  const rest = await client();
  const contextId = resolveContextId(process.cwd());
  const [sub, name] = args;

  if (!sub || sub === "list") {
    const presets = await rest.modelPresets({ action: "get" });
    const state = await rest.modelSwitcher({ action: "get", context_id: contextId });
    const stateData = state as {
      main_model?: { label?: string };
      utility_model?: { label?: string };
      override?: { preset_name?: string } | null;
    };

    console.log(`Chat model:    ${stateData.main_model?.label ?? "?"}`);
    console.log(`Utility model: ${stateData.utility_model?.label ?? "?"}`);
    if (stateData.override?.preset_name) {
      console.log(`Override active for this directory's chat: ${stateData.override.preset_name}`);
    }
    console.log("\nAvailable presets:");
    if (!presets.presets?.length) {
      console.log("  (none configured — add one from the WebUI's model settings first)");
      return;
    }
    for (const p of presets.presets) {
      console.log(formatPreset(p, stateData.override?.preset_name));
    }
    console.log("\nUsage: synapse model use <name>  |  synapse model clear");
    return;
  }

  if (sub === "use") {
    if (!name) {
      console.error("Usage: synapse model use <preset-name>");
      process.exitCode = 1;
      return;
    }
    await ensureContext(rest, contextId);
    await rest.modelSwitcher({ action: "set_preset", context_id: contextId, preset_name: name });
    console.log(`Model preset '${name}' is now active for chats in this directory.`);
    return;
  }

  if (sub === "clear") {
    await ensureContext(rest, contextId);
    await rest.modelSwitcher({ action: "clear", context_id: contextId });
    console.log("Model override cleared — back to the global default.");
    return;
  }

  console.error(`Unknown model subcommand: ${sub}`);
  console.error("Usage: synapse model [list|use <name>|clear]");
  process.exitCode = 1;
}
