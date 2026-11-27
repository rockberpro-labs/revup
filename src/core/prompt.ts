import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { RevupError } from "../errors.ts";
import { ARTIFACTS, STEPS, type Step } from "../state/machine.ts";
import { loadFacts } from "./facts-io.ts";
import type { Target } from "./target.ts";

/** Plugin root (src/core → ../..). */
export const PLUGIN_ROOT = resolve(import.meta.dir, "../..");

const SKILL_DIR: Partial<Record<Step, string>> = {
  "02-extract": "revup-extract",
  "03-spec": "revup-spec",
  "04-audit": "revup-audit",
};

export function parseStep(s: string): Step {
  const step = STEPS.find((x) => x === s);
  if (!step) throw new RevupError(`invalid step: "${s}" (use ${STEPS.join(", ")})`);
  return step;
}

/** Step instructions = SKILL.md body + template + the target's absolute paths (single source). */
export async function buildPrompt(t: Target, step: Step): Promise<string> {
  const skill = SKILL_DIR[step];
  if (!skill) throw new RevupError(`${step} is deterministic (no agent): run \`revup next ${t.id}\``);
  const dir = join(PLUGIN_ROOT, "skills", skill);
  const body = (await readFile(join(dir, "SKILL.md"), "utf8")).replace(/^---[\s\S]*?---\s*/, "");
  const template = await readFile(join(dir, "references", "template.md"), "utf8");
  const { facts } = await loadFacts(t);
  const sources = (facts?.files ?? []).map((f) => `- ${join(t.project.sourceRoot, f.path)}`);

  const reads = [`- ${join(t.dir, "facts.json")}`, ...sources];
  if (step !== "02-extract") reads.push(`- ${join(t.dir, "observations.md")}`, `- ${join(t.dir, "open-questions.md")}`);
  if (step === "04-audit") reads.push(`- ${join(t.dir, "spec.md")}`);
  const writes = (step === "04-audit" ? ["audit.md"] : ARTIFACTS[step]).map((f) => `- ${join(t.dir, f)}`);

  return [
    `# Etapa ${step} — ${t.id}`,
    "",
    "## Files to read",
    ...reads,
    "",
    "## Files to write",
    ...writes,
    "",
    `When done: run \`revup next ${t.id}\` (tool \`revup_next\`) and repeat the final line it prints.`,
    "",
    body.trim(),
    "",
    "## Template",
    "",
    template.trim(),
    "",
  ].join("\n");
}
