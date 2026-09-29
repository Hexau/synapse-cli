#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import meow from "meow";
import App from "./App.js";
import { setGlobalConfig, getGlobalConfig } from "./config.js";
import { runModelCommand } from "./commands/model.js";
import { runSkillCommand } from "./commands/skill.js";
import { runAgentCommand } from "./commands/agent.js";
import { runConfigCommand } from "./commands/config.js";
import { runChatCommand } from "./commands/chat.js";
import { runDiffCommand } from "./commands/diff.js";
import { runMultiRunCommand } from "./commands/multirun.js";
import { runPolicyCommand } from "./commands/policy.js";

const cli = meow(
  `
  Usage
    $ synapse                        Start a chat session for the current directory
    $ synapse login                   Set your server URL and API token
    $ synapse login --token <t> --server <url>
    $ synapse model                   Show current model + list presets
    $ synapse model use <name>        Set a model preset for this directory's chats
    $ synapse model clear             Clear the model override
    $ synapse skill                   List available skills
    $ synapse skill activate <path>   Activate a skill for this directory's chats
    $ synapse skill delete <path>     Delete a skill
    $ synapse agent                   List agent profiles
    $ synapse agent use <name>        Set the agent profile for this directory's chats
    $ synapse config                  Show all settings
    $ synapse config get <key>        Show one setting
    $ synapse config set <key> <val>  Set one top-level setting
    $ synapse config apikey <p> <k>   Set an API key for provider <p>
    $ synapse chat                     List chats ('*' = this directory's)
    $ synapse chat reset [id]          Reset a chat (defaults to this directory's)
    $ synapse chat delete <id>         Delete a chat
    $ synapse chat logs [id]           Show recent log entries for a chat
    $ synapse diff <repo_slug> [ref]   Step through an agent's changes hunk by hunk
    $ synapse multirun start <repo> <task_slug> <prompt> --variants a,b
                                       Fan out a task to N agents in parallel worktrees
    $ synapse multirun status <run_id> Check a multi-run's progress/result
    $ synapse multirun pick <repo> <run_id> <variant>
                                       Merge the winning variant, discard the rest
    $ synapse policy list              List remembered allow/deny rules
    $ synapse policy remember <tool> <allow|deny> <args_json>
    $ synapse policy forget <action_id>
    $ synapse policy audit [n]         Show the last n policy decisions
    $ synapse policy pending           List tool calls currently blocked awaiting approval
    $ synapse policy approve <action_id>
    $ synapse policy deny <action_id>

  Inside a chat session, slash commands work too: /model, /skill, /agent,
  /clear, /compact, /pause, /resume, /trace, /help, /exit

  Options
    --token <t>     API token (from /api/my_account after logging into the WebUI)
    --server <url>  Synapse server URL (default: http://localhost:50080)
`,
  {
    importMeta: import.meta,
    flags: {
      token: { type: "string" },
      server: { type: "string" },
      variants: { type: "string" },
      agentProfile: { type: "string" },
    },
  }
);

const [command, ...rest] = cli.input;

const commands: Record<string, (args: string[], flags: Record<string, unknown>) => Promise<void>> = {
  model: runModelCommand,
  skill: runSkillCommand,
  agent: runAgentCommand,
  config: runConfigCommand,
  chat: runChatCommand,
  diff: runDiffCommand,
  multirun: runMultiRunCommand,
  policy: runPolicyCommand,
};

if (command === "login") {
  const patch: { serverUrl?: string; apiToken?: string } = {};
  if (cli.flags.server) patch.serverUrl = cli.flags.server;
  if (cli.flags.token) patch.apiToken = cli.flags.token;

  if (Object.keys(patch).length === 0) {
    const current = getGlobalConfig();
    console.log(`serverUrl: ${current.serverUrl ?? "(default) http://localhost:50080"}`);
    console.log(`apiToken:  ${current.apiToken ? "*".repeat(8) : "(not set)"}`);
    console.log("\nUsage: synapse login --token <t> --server <url>");
    process.exit(0);
  }

  setGlobalConfig(patch);
  console.log("Synapse config updated.");
  process.exit(0);
} else if (command && commands[command]) {
  commands[command](rest, cli.flags)
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((err: Error) => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
} else {
  render(<App projectDir={process.cwd()} />);
}
