import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ZodType } from "zod";
import { loadFacts } from "../core/facts-io.ts";
import type { StepResult } from "../core/next.ts";
import type { Target } from "../core/target.ts";
import type { FactsFile } from "../scan/facts.ts";
import { unknownCitations } from "./citations.ts";
import { extractCitations, parseBullets, parseSections, proseLines, type Section } from "./markdown.ts";
import {
  MAX_SPEC_LINES,
  OBSERVATIONS_SECTIONS,
  ObservationsSchema,
  QuestionSchema,
  SPEC_SECTIONS,
  SpecSchema,
  type Question,
} from "./schemas.ts";

async function readArtifact(t: Target, name: string): Promise<string | undefined> {
  try {
    return await readFile(join(t.dir, name), "utf8");
  } catch {
    return undefined;
  }
}

function zodErrors(label: string, section: string, err: { issues: { path: PropertyKey[]; message: string }[] }): string[] {
  return err.issues.map((i) => {
    const idx = i.path.find((p) => typeof p === "number");
    return `${label}: ## ${section}${idx !== undefined ? ` (item ${Number(idx) + 1})` : ""}: ${i.message}`;
  });
}

/** Checks the exact set of sections (template rigidity). */
function checkSections(label: string, sections: Section[], expected: string[]): string[] {
  const errors: string[] = [];
  const names = sections.map((s) => s.heading);
  for (const e of expected) if (!names.includes(e)) errors.push(`${label}: section "## ${e}" is missing`);
  for (const n of names) if (!expected.includes(n)) errors.push(`${label}: section "## ${n}" is not part of the template`);
  return errors;
}

function validateSection(label: string, s: Section, schema: ZodType, value: unknown, allowProse = false): string[] {
  const errors: string[] = [];
  const prose = allowProse ? [] : proseLines(s.lines);
  if (prose.length) errors.push(`${label}: ## ${s.heading}: prose outside a bullet ("${prose[0]!.trim().slice(0, 50)}")`);
  const r = schema.safeParse(value);
  if (!r.success) errors.push(...zodErrors(label, s.heading, r.error));
  return errors;
}

export function parseQuestions(md: string): { questions: Question[]; errors: string[] } {
  const errors: string[] = [];
  const questions: Question[] = [];
  for (const s of parseSections(md)) {
    const m = /^(Q-\d+)\s+(.+)$/.exec(s.heading);
    if (!m) {
      errors.push(`open-questions.md: section "## ${s.heading}" must be "## Q-01 Title"`);
      continue;
    }
    const line = (label: string) =>
      s.lines.map((l) => new RegExp(`^\\s*[-*]\\s+${label}:\\s*(.*)$`, "i").exec(l)?.[1]).find((x) => x !== undefined) ?? "";
    const q = QuestionSchema.safeParse({
      id: m[1],
      title: m[2],
      evidence: extractCitations(line("Evidence")),
      ambiguity: line("Ambiguity").trim(),
    });
    if (q.success) questions.push(q.data);
    else errors.push(...zodErrors("open-questions.md", s.heading, q.error));
  }
  const ids = questions.map((q) => q.id);
  for (const id of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) errors.push(`open-questions.md: duplicate id ${id}`);
  return { questions, errors };
}

async function withFacts(t: Target): Promise<{ facts?: FactsFile; errors: string[] }> {
  const r = await loadFacts(t);
  return r.facts ? { facts: r.facts, errors: [] } : { errors: r.errors };
}

/** 02-extract: observations.md + open-questions.md. */
export async function validateExtract(t: Target): Promise<StepResult> {
  const { facts, errors: fe } = await withFacts(t);
  if (!facts) return { ok: false, errors: fe };
  const known = new Set(facts.facts.map((f) => f.id));
  const errors: string[] = [];

  const obs = await readArtifact(t, "observations.md");
  if (obs === undefined) errors.push(`observations.md is missing (run \`revup prompt 02-extract ${t.id}\`)`);
  else {
    const sections = parseSections(obs);
    errors.push(...checkSections("observations.md", sections, OBSERVATIONS_SECTIONS));
    for (const s of sections.filter((x) => OBSERVATIONS_SECTIONS.includes(x.heading))) {
      errors.push(...validateSection("observations.md", s, ObservationsSchema.shape[s.heading as keyof typeof ObservationsSchema.shape], parseBullets(s.lines)));
    }
    errors.push(...unknownCitations(obs, known, "observations.md"));
  }

  const qmd = await readArtifact(t, "open-questions.md");
  if (qmd === undefined) errors.push(`open-questions.md is missing (run \`revup prompt 02-extract ${t.id}\`)`);
  else {
    const { errors: qe } = parseQuestions(qmd);
    errors.push(...qe, ...unknownCitations(qmd, known, "open-questions.md"));
    const cited = new Set(extractCitations(qmd));
    for (const id of facts.unresolved) {
      if (!cited.has(id)) errors.push(`open-questions.md: fact ${id} (unresolved) has no question`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** 03-spec: spec.md. */
export async function validateSpec(t: Target): Promise<StepResult> {
  const { facts, errors: fe } = await withFacts(t);
  if (!facts) return { ok: false, errors: fe };
  const known = new Set(facts.facts.map((f) => f.id));
  const spec = await readArtifact(t, "spec.md");
  if (spec === undefined) return { ok: false, errors: [`spec.md is missing (run \`revup prompt 03-spec ${t.id}\`)`] };

  const errors: string[] = [];
  if (spec.split(/\r?\n/).length > MAX_SPEC_LINES) errors.push(`spec.md: over ${MAX_SPEC_LINES} lines`);
  const sections = parseSections(spec);
  errors.push(...checkSections("spec.md", sections, SPEC_SECTIONS));

  const qmd = await readArtifact(t, "open-questions.md");
  const qids = new Set(qmd ? parseQuestions(qmd).questions.map((q) => q.id) : []);

  for (const s of sections.filter((x) => SPEC_SECTIONS.includes(x.heading))) {
    const shape = SpecSchema.shape as Record<string, ZodType>;
    if (s.heading === "Goal") {
      errors.push(...validateSection("spec.md", s, shape.Goal!, s.lines.map((l) => l.trim()).filter(Boolean), true));
    } else if (s.heading === "Open items") {
      const items = parseBullets(s.lines).map((b) => ({ text: b.text, none: b.none, qrefs: b.text.match(/\bQ-\d{2,}\b/g) ?? [] }));
      errors.push(...validateSection("spec.md", s, shape["Open items"]!, items));
      for (const it of items) {
        if (!it.none && !it.qrefs.length) errors.push(`spec.md: ## Open items: item without a Q-xx reference ("${it.text.slice(0, 40)}")`);
        for (const q of it.qrefs) if (!qids.has(q)) errors.push(`spec.md: ## Open items: ${q} does not exist in open-questions.md`);
      }
    } else {
      errors.push(...validateSection("spec.md", s, shape[s.heading]!, parseBullets(s.lines)));
    }
  }
  errors.push(...unknownCitations(spec, known, "spec.md"));
  return { ok: errors.length === 0, errors };
}
