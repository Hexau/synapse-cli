import type { DiffWalkthroughFile } from "@synapse/protocol";

export interface DiffStep {
  fileIndex: number;
  hunkIndex: number;
  file: DiffWalkthroughFile;
}

// One step per hunk, in file order then hunk order — the natural reading
// order of a diff. A file with zero hunks (shouldn't happen in practice,
// but the backend doesn't guarantee it) contributes no steps rather than
// crashing the flattening.
export function flattenSteps(files: DiffWalkthroughFile[]): DiffStep[] {
  const steps: DiffStep[] = [];
  files.forEach((file, fileIndex) => {
    file.hunks.forEach((_hunk, hunkIndex) => {
      steps.push({ fileIndex, hunkIndex, file });
    });
  });
  return steps;
}

const STATUS_LABEL: Record<DiffWalkthroughFile["status"], string> = {
  added: "added",
  modified: "modified",
  deleted: "deleted",
  renamed: "renamed",
};

export function formatStep(steps: DiffStep[], index: number): string {
  const step = steps[index];
  const hunk = step.file.hunks[step.hunkIndex];
  const fileLabel = `${step.file.path} (${STATUS_LABEL[step.file.status]})`;
  const hunkLabel =
    step.file.hunks.length > 1 ? ` — hunk ${step.hunkIndex + 1}/${step.file.hunks.length}` : "";

  return [
    `[${index + 1}/${steps.length}] ${fileLabel}${hunkLabel}`,
    hunk.header,
    ...hunk.lines,
  ].join("\n");
}

export function formatAllSteps(steps: DiffStep[]): string {
  return steps.map((_step, index) => formatStep(steps, index)).join("\n\n");
}
