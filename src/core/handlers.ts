import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RevupError } from "../errors.ts";
import { FactsFileSchema, assignIds, type FactsFile } from "../scan/facts.ts";
import { getScanner } from "../scan/scanner.ts";
import type { Step } from "../state/machine.ts";
import type { Handler, Handlers, StepResult } from "./next.ts";
import type { Target } from "./target.ts";

const notImplemented = (step: Step): Handler => () => ({ ok: false, errors: [`etapa ${step} ainda não implementada`] });

/** 01-scan: 100% código, sem LLM. Escreve facts.json de forma determinística. */
export const scanHandler: Handler = async (t: Target): Promise<StepResult> => {
  const { config, sourceRoot } = t.project;
  try {
    const res = await getScanner(config.language).scan(t.entry, {
      sourceRoot,
      includePaths: config.includePaths,
      encoding: config.encoding,
    });
    const facts = assignIds(res.facts);
    const file: FactsFile = {
      version: 1,
      language: config.language,
      entry: t.entry,
      files: res.files,
      facts,
      unresolved: facts.filter((f) => !f.resolved).map((f) => f.id),
    };
    await mkdir(t.dir, { recursive: true });
    await writeFile(join(t.dir, "facts.json"), JSON.stringify(file, null, 2) + "\n");
    return { ok: true, errors: [], sourceHashes: Object.fromEntries(res.files.map((f) => [f.path, f.sha256])) };
  } catch (e) {
    if (e instanceof RevupError) return { ok: false, errors: [e.message] };
    throw e;
  }
};

/** Lê e valida facts.json já existente (sem reescanear). */
export async function loadFacts(t: Target): Promise<{ facts?: FactsFile; errors: string[] }> {
  let raw: string;
  try {
    raw = await readFile(join(t.dir, "facts.json"), "utf8");
  } catch {
    return { errors: ["facts.json ausente"] };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { errors: ["facts.json: JSON inválido"] };
  }
  const parsed = FactsFileSchema.safeParse(json);
  if (!parsed.success) {
    return { errors: parsed.error.issues.slice(0, 5).map((i) => `facts.json: ${i.path.join(".")}: ${i.message}`) };
  }
  const ids = new Set<string>();
  const errors: string[] = [];
  for (const f of parsed.data.facts) {
    if (ids.has(f.id)) errors.push(`facts.json: id duplicado ${f.id}`);
    ids.add(f.id);
  }
  return { facts: parsed.data, errors };
}

export const validateScan: Handler = async (t) => {
  const { errors } = await loadFacts(t);
  return { ok: errors.length === 0, errors };
};

/** Registro padrão; a Fase 3 substitui 02–04. */
export const defaultHandlers: Handlers = {
  "01-scan": scanHandler,
  "02-extract": notImplemented("02-extract"),
  "03-spec": notImplemented("03-spec"),
  "04-audit": notImplemented("04-audit"),
};

export const defaultValidators: Partial<Handlers> = {
  "01-scan": validateScan,
};
