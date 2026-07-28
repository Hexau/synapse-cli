import { SynapseRestClient } from "@synapse/protocol";
import { resolveServerUrl, resolveApiToken } from "../config.js";

function client(): SynapseRestClient {
  return new SynapseRestClient({ serverUrl: resolveServerUrl(), apiToken: resolveApiToken() });
}

// settings_set merges shallowly (helpers/settings.py's convert_in overlays
// only the top-level keys present in the payload onto the current settings)
// — so sending {key: value} for one top-level key is safe and never wipes
// unrelated settings. It does NOT deep-merge though: sending a partial
// nested object (e.g. {api_keys: {anthropic: "..."}}) would replace the
// WHOLE api_keys dict, wiping every other provider's key. runApiKeyCommand
// below fetches the current nested dict first specifically to avoid that.
function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw; // plain string is fine — most settings fields are strings
  }
}

export async function runConfigCommand(args: string[]): Promise<void> {
  const rest = client();
  const [sub, key, value] = args;

  if (!sub || sub === "list") {
    const settings = await rest.getSettings();
    console.log(JSON.stringify(settings, null, 2));
    return;
  }

  if (sub === "get") {
    if (!key) {
      console.error("Usage: synapse config get <key>");
      process.exitCode = 1;
      return;
    }
    const settings = await rest.getSettings();
    if (!(key in settings)) {
      console.error(`No such setting: ${key}`);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(settings[key], null, 2));
    return;
  }

  if (sub === "set") {
    if (!key || value === undefined) {
      console.error("Usage: synapse config set <key> <value>");
      process.exitCode = 1;
      return;
    }
    await rest.setSettings({ [key]: parseValue(value) });
    console.log(`${key} updated.`);
    return;
  }

  if (sub === "apikey") {
    const [provider, apiKey] = [key, value];
    if (!provider || !apiKey) {
      console.error("Usage: synapse config apikey <provider> <key>");
      process.exitCode = 1;
      return;
    }
    const settings = await rest.getSettings();
    const currentKeys = (settings.api_keys as Record<string, string>) || {};
    // Merge just this provider in — see the module doc comment on why a
    // naive {api_keys: {provider: key}} payload would be unsafe here.
    await rest.setSettings({ api_keys: { ...currentKeys, [provider]: apiKey } });
    console.log(`API key for '${provider}' updated.`);
    return;
  }

  console.error(`Unknown config subcommand: ${sub}`);
  console.error("Usage: synapse config [list|get <key>|set <key> <value>|apikey <provider> <key>]");
  process.exitCode = 1;
}
