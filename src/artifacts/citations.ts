import { extractCitations } from "./markdown.ts";

/** Errors for ids cited in `text` that do not exist in facts.json. */
export function unknownCitations(text: string, known: Set<string>, label: string): string[] {
  const bad = [...new Set(extractCitations(text).filter((id) => !known.has(id)))];
  return bad.map((id) => `${label}: citation of a nonexistent fact ${id}`);
}
