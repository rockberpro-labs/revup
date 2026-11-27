import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { RevupError } from "../errors.ts";
import { ARTIFACTS, STEPS, type Step } from "../state/machine.ts";
import { loadFacts } from "./facts-io.ts";
import type { Target } from "./target.ts";

/** Raiz do plugin (src/core → ../..). */
export const PLUGIN_ROOT = resolve(import.meta.dir, "../..");

const SKILL_DIR: Partial<Record<Step, string>> = {
  "02-extract": "revup-extract",
  "03-spec": "revup-spec",
  "04-audit": "revup-audit",
};

export function parseStep(s: string): Step {
  const step = STEPS.find((x) => x === s);
  if (!step) throw new RevupError(`etapa inválida: "${s}" (use ${STEPS.join(", ")})`);
  return step;
}

/** Instrução da etapa = corpo do SKILL.md + template + caminhos absolutos do alvo (fonte única). */
export async function buildPrompt(t: Target, step: Step): Promise<string> {
  const skill = SKILL_DIR[step];
  if (!skill) throw new RevupError(`${step} é determinística (sem agente): rode \`revup next ${t.id}\``);
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
    "## Arquivos a ler",
    ...reads,
    "",
    "## Arquivos a escrever",
    ...writes,
    "",
    `Ao terminar: \`revup next ${t.id}\` (tool \`revup_next\`) e repita a linha final que ele imprimir.`,
    "",
    body.trim(),
    "",
    "## Template",
    "",
    template.trim(),
    "",
  ].join("\n");
}
