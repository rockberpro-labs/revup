/** Pure state machine (no IO). */
export const STEPS = ["01-scan", "02-extract", "03-spec", "04-audit"] as const;
export type Step = (typeof STEPS)[number];
export type Current = Step | "DONE";

/** Artifacts each step produces, relative to the target directory. */
export const ARTIFACTS: Record<Step, string[]> = {
  "01-scan": ["facts.json"],
  "02-extract": ["observations.md", "open-questions.md"],
  "03-spec": ["spec.md"],
  "04-audit": ["audit.md"],
};

export function nextStep(step: Step): Current {
  const i = STEPS.indexOf(step);
  return STEPS[i + 1] ?? "DONE";
}

/** Artifacts required before running `current` that do not exist yet. */
export function missingPrerequisites(current: Current, exists: (file: string) => boolean): string[] {
  const upTo = current === "DONE" ? STEPS.length : STEPS.indexOf(current);
  return STEPS.slice(0, upTo)
    .flatMap((s) => ARTIFACTS[s].map((f) => ({ s, f })))
    .filter(({ f }) => !exists(f))
    .map(({ s, f }) => `${f} is missing (produced by ${s})`);
}

export function completionMessage(done: Step, next: Current): string {
  if (done === "04-audit") return `[04-audit done] -> Status: READY`;
  return `[${done} done] -> Next step: ${next}`;
}

export function blockedMessage(): string {
  return `[04-audit] -> Status: BLOCKED`;
}
