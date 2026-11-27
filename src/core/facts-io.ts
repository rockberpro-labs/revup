import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FactsFileSchema, type FactsFile } from "../scan/facts.ts";
import type { Target } from "./target.ts";

/** Reads and validates an existing facts.json (without rescanning). */
export async function loadFacts(t: Target): Promise<{ facts?: FactsFile; errors: string[] }> {
  let raw: string;
  try {
    raw = await readFile(join(t.dir, "facts.json"), "utf8");
  } catch {
    return { errors: ["facts.json is missing"] };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { errors: ["facts.json: invalid JSON"] };
  }
  const parsed = FactsFileSchema.safeParse(json);
  if (!parsed.success) {
    return { errors: parsed.error.issues.slice(0, 5).map((i) => `facts.json: ${i.path.join(".")}: ${i.message}`) };
  }
  const ids = new Set<string>();
  const errors: string[] = [];
  for (const f of parsed.data.facts) {
    if (ids.has(f.id)) errors.push(`facts.json: duplicate id ${f.id}`);
    ids.add(f.id);
  }
  return { facts: parsed.data, errors };
}
