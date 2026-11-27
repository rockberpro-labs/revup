import { extractCitations } from "./markdown.ts";

/** Erros para ids citados em `text` que não existem em facts.json. */
export function unknownCitations(text: string, known: Set<string>, label: string): string[] {
  const bad = [...new Set(extractCitations(text).filter((id) => !known.has(id)))];
  return bad.map((id) => `${label}: citação a fato inexistente ${id}`);
}
