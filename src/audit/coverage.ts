import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseQuestions } from "../artifacts/validate.ts";
import { extractCitations } from "../artifacts/markdown.ts";
import { loadFacts } from "../core/facts-io.ts";
import type { StepResult } from "../core/next.ts";
import type { Target } from "../core/target.ts";
import { describeFact, needsReview, type Fact } from "../scan/facts.ts";

/** Facts the spec must cover. call/function_def/resolved include are context and need no citation. */
const COVERED_KINDS = new Set(["sql", "input", "session", "redirect"]);
export const requiredFacts = (facts: Fact[]): Fact[] => facts.filter((f) => COVERED_KINDS.has(f.kind) || needsReview(f));

const PENDING = "<PENDING>";

async function read(t: Target, name: string): Promise<string> {
  try {
    return await readFile(join(t.dir, name), "utf8");
  } catch {
    return "";
  }
}

/** `Default proposal:` entries already filled in the previous audit.md, by Q-xx. */
export function parseProposals(md: string): Map<string, string> {
  const out = new Map<string, string>();
  let q: string | undefined;
  for (const line of md.split(/\r?\n/)) {
    const h = /^###\s+(Q-\d+)\b/.exec(line);
    if (h) q = h[1];
    const p = /^\s*[-*]\s+Default proposal:\s*(.*?)\s*$/i.exec(line);
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
    ...uncovered.map((f) => `fact ${f.id} not covered in the spec: ${describeFact(f)}`),
    ...missing.map((q) => `${q.id} has no "Default proposal" in audit.md`),
  ];
  const verdict = errors.length ? "BLOCKED" : "READY";

  const md = [
    `# Audit — ${t.id}`,
    "",
    "## Coverage",
    `- Required facts: ${required.length}`,
    `- Covered: ${required.length - uncovered.length}`,
    `- Not covered: ${uncovered.length}`,
    ...uncovered.map((f) => `  - [${f.id}] ${describeFact(f)}`),
    "",
    "## Questions",
    ...(questions.length ? [] : ["- None."]),
    ...questions.flatMap((q) => [
      `### ${q.id} ${q.title}`,
      `- Evidence: ${q.evidence.map((e) => `[${e}]`).join(" ")}`,
      `- Ambiguity: ${q.ambiguity}`,
      `- Default proposal: ${proposals.get(q.id) || PENDING}`,
      "",
    ]),
    "## Status",
    verdict,
    "",
  ].join("\n");
  return { md, verdict, errors };
}

/** 04-audit (run): generates audit.md deterministically; preserves proposals the agent already wrote. */
export async function auditHandler(t: Target): Promise<StepResult> {
  const a = await computeAudit(t);
  if (!("md" in a)) return { ok: false, errors: a.errors };
  await writeFile(join(t.dir, "audit.md"), a.md);
  return { ok: true, errors: a.errors, verdict: a.verdict };
}

/** 04-audit (validate): same computation, without writing. */
export async function auditValidator(t: Target): Promise<StepResult> {
  const a = await computeAudit(t);
  if (!("md" in a)) return { ok: false, errors: a.errors };
  return { ok: a.verdict === "READY", errors: a.errors, verdict: a.verdict };
}
