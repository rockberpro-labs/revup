import { createHash } from "node:crypto";
import { z } from "zod";

/** Neutral kinds: language-specific detail lives in `source`/`name`. */
export const FACT_KINDS = ["include", "sql", "input", "session", "call", "redirect", "function_def", "parse_error"] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export const FactSchema = z.object({
  id: z.string().regex(/^F-[0-9a-f]{8}$/),
  kind: z.enum(FACT_KINDS),
  file: z.string(),
  line: z.number().int().positive(),
  snippet: z.string(),
  confidence: z.enum(["ast", "heuristic"]),
  resolved: z.boolean(),
  source: z.string().optional(),
  key: z.string().optional(),
  mode: z.enum(["read", "write"]).optional(),
  name: z.string().optional(),
  operation: z.string().optional(),
  tables: z.array(z.string()).optional(),
  target: z.string().optional(),
  text: z.string().optional(),
  note: z.string().optional(),
});
export type Fact = z.infer<typeof FactSchema>;
export type RawFact = Omit<Fact, "id">;

export const FactsFileSchema = z.object({
  version: z.literal(1),
  language: z.string(),
  entry: z.string(),
  files: z.array(z.object({ path: z.string(), sha256: z.string() })),
  facts: z.array(FactSchema),
  /** ids of facts that need a question (needsReview): shortcut for 02-extract */
  unresolved: z.array(z.string()),
});
export type FactsFile = z.infer<typeof FactsFileSchema>;

/** A real gap that requires a question in open-questions.md (not merely having a dynamic part). */
export function needsReview(f: Pick<RawFact, "kind" | "resolved" | "tables">): boolean {
  switch (f.kind) {
    case "include":
    case "input":
    case "session":
    case "call":
      return !f.resolved;
    case "parse_error":
      return true;
    case "sql":
      return !f.tables?.length || f.tables.some((t) => t.startsWith("{"));
    default:
      return false;
  }
}

/** Short, readable description of a fact (error messages and audit.md). */
export function describeFact(f: Fact): string {
  const where = `${f.file}:${f.line}`;
  switch (f.kind) {
    case "input":
    case "session":
      return `${f.source}${f.key !== undefined ? `[${f.key}]` : ""} ${f.mode} (${where})`;
    case "sql":
      return `${f.operation} ${(f.tables ?? []).join(",")} (${where})`;
    case "redirect":
    case "include":
      return `${f.kind} ${f.target} (${where})`;
    default:
      return `${f.kind} ${f.name ?? f.snippet} (${where})`;
  }
}

export function normalizeSnippet(s: string, max = 240): string {
  const n = s.replace(/\s+/g, " ").trim();
  return n.length > max ? n.slice(0, max) : n;
}

/**
 * Stable IDs: sha1(kind|file|snippet|occurrence). No line number,
 * so editing code above does not renumber citations.
 */
export function assignIds(raw: RawFact[]): Fact[] {
  const seen = new Map<string, number>();
  const used = new Set<string>();
  return raw.map((f) => {
    const base = `${f.kind}|${f.file}|${f.snippet}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    let salt = 0;
    let id: string;
    do {
      id = "F-" + createHash("sha1").update(`${base}|${n}|${salt++}`).digest("hex").slice(0, 8);
    } while (used.has(id));
    used.add(id);
    return { id, ...f };
  });
}
