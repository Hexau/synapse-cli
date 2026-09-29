import * as readline from "readline";
import { SynapseRestClient } from "@synapse/protocol";
import { resolveServerUrl, resolveApiToken } from "../config.js";
import { flattenSteps, formatStep, formatAllSteps } from "../lib/diffWalkthrough.js";

function client(): SynapseRestClient {
  return new SynapseRestClient({ serverUrl: resolveServerUrl(), apiToken: resolveApiToken() });
}

// Interactive stepping needs real keyboard input to make sense of "next/
// prev" — piped/non-TTY stdin (scripts, CI) gets the full walkthrough
// printed at once instead, same fallback fx documents for its own
// noninteractive mode.
function stepInteractively(steps: ReturnType<typeof flattenSteps>): Promise<void> {
  return new Promise((resolve) => {
    let index = 0;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const printCurrent = () => {
      console.log("\n" + formatStep(steps, index) + "\n");
      rl.setPrompt(
        `[${index + 1}/${steps.length}] Enter=next  p=prev  q=quit> `
      );
      rl.prompt();
    };

    rl.on("line", (line) => {
      const input = line.trim().toLowerCase();
      if (input === "q" || input === "quit") {
        rl.close();
        return;
      }
      if (input === "p" || input === "prev") {
        index = Math.max(0, index - 1);
      } else {
        index = index + 1;
      }
      if (index >= steps.length) {
        console.log("\nEnd of diff.");
        rl.close();
        return;
      }
      printCurrent();
    });

    rl.on("close", resolve);
    printCurrent();
  });
}

export async function runDiffCommand(args: string[]): Promise<void> {
  const [repoSlug, baseRef] = args;
  if (!repoSlug) {
    console.error("Usage: synapse diff <repo_slug> [base_ref]");
    process.exitCode = 1;
    return;
  }

  const rc = client();
  const { files } = await rc.getDiffWalkthrough(repoSlug, baseRef);

  if (!files.length) {
    console.log(`No changes in ${repoSlug}${baseRef ? ` against ${baseRef}` : ""}.`);
    return;
  }

  const steps = flattenSteps(files);
  const fileCount = files.length;
  console.log(`${fileCount} file(s) changed, ${steps.length} hunk(s) — ${repoSlug}`);

  if (!process.stdin.isTTY) {
    console.log("\n" + formatAllSteps(steps));
    return;
  }

  await stepInteractively(steps);
}
