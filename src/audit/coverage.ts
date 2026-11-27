import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseQuestions } from "../artifacts/validate.ts";
import { extractCitations } from "../artifacts/markdown.ts";
import { loadFacts } from "../core/facts-io.ts";
import type { StepResult } from "../core/next.ts";
import type { Target } from "../core/target.ts";
import { describeFact, needsReview, type Fact } from "../scan/facts.ts";

/** Fatos que a spec precisa cobrir. call/function_def/include resolvido são contexto, não exigem citação. */
const COVERED_KINDS = new Set(["sql", "input", "session", "redirect"]);
export const requiredFacts = (facts: Fact[]): Fact[] => facts.filter((f) => COVERED_KINDS.has(f.kind) || needsReview(f));

const PENDING = "<PENDENTE>";

async function read(t: Target, name: string): Promise<string> {
  try {
    return await readFile(join(t.dir, name), "utf8");
  } catch {
    return "";
  }
}

/** `Proposta padrão:` já preenchidas no audit.md anterior, por Q-xx. */
export function parseProposals(md: string): Map<string, string> {
  const out = new Map<string, string>();
  let q: string | undefined;
  for (const line of md.split(/\r?\n/)) {
    const h = /^###\s+(Q-\d+)\b/.exec(line);
    if (h) q = h[1];
    const p = /^\s*[-*]\s+Proposta padrão:\s*(.*?)\s*$/i.exec(line);
    if (p && q) out.set(q, p[1]!);
  }
  return out;
}

export interface Audit {
  md: string;
  verdict: "READY" | "BLOCKED";
  errors: string[];
}

export async function computeAudit(t: Target): Promise<Audit | { errors: string[] }> {
  const { facts, errors: fe } = await loadFacts(t);
  if (!facts) return { errors: fe };
  const spec = await read(t, "spec.md");
  const qmd = await read(t, "open-questions.md");
  const cited = new Set([...extractCitations(spec), ...extractCitations(qmd)]);
  const required = requiredFacts(facts.facts);
  const uncovered = required.filter((f) => !cited.has(f.id));
  const { questions } = parseQuestions(qmd);
  const proposals = parseProposals(await read(t, "audit.md"));
  const missing = questions.filter((q) => {
    const p = proposals.get(q.id);
    return !p || p === PENDING;
  });

  const errors = [
    ...uncovered.map((f) => `fato ${f.id} não coberto na spec: ${describeFact(f)}`),
    ...missing.map((q) => `${q.id} sem "Proposta padrão" em audit.md`),
  ];
  const verdict = errors.length ? "BLOCKED" : "READY";

  const md = [
    `# Auditoria — ${t.id}`,
    "",
    "## Cobertura",
    `- Fatos exigidos: ${required.length}`,
    `- Cobertos: ${required.length - uncovered.length}`,
    `- Não cobertos: ${uncovered.length}`,
    ...uncovered.map((f) => `  - [${f.id}] ${describeFact(f)}`),
    "",
    "## Perguntas",
    ...(questions.length ? [] : ["- Nenhuma."]),
    ...questions.flatMap((q) => [
      `### ${q.id} ${q.title}`,
      `- Evidência: ${q.evidencia.map((e) => `[${e}]`).join(" ")}`,
      `- Ambiguidade: ${q.ambiguidade}`,
      `- Proposta padrão: ${proposals.get(q.id) || PENDING}`,
      "",
    ]),
    "## Status",
    verdict,
    "",
  ].join("\n");
  return { md, verdict, errors };
}

/** 04-audit (run): gera audit.md deterministicamente; preserva propostas já escritas pelo agente. */
export async function auditHandler(t: Target): Promise<StepResult> {
  const a = await computeAudit(t);
  if (!("md" in a)) return { ok: false, errors: a.errors };
  await writeFile(join(t.dir, "audit.md"), a.md);
  return { ok: true, errors: a.errors, verdict: a.verdict };
}

/** 04-audit (validate): mesma conta, sem escrever. */
export async function auditValidator(t: Target): Promise<StepResult> {
  const a = await computeAudit(t);
  if (!("md" in a)) return { ok: false, errors: a.errors };
  return { ok: a.verdict === "READY", errors: a.errors, verdict: a.verdict };
}
