import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RevupError } from "../errors.ts";
import { assignIds, needsReview, type FactsFile } from "../scan/facts.ts";
import { loadFacts } from "./facts-io.ts";
import { getScanner } from "../scan/scanner.ts";
import { auditHandler, auditValidator } from "../audit/coverage.ts";
import { validateExtract, validateSpec } from "../artifacts/validate.ts";
import type { Handler, Handlers, StepResult } from "./next.ts";
import type { Target } from "./target.ts";

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
      unresolved: facts.filter(needsReview).map((f) => f.id),
    };
    await mkdir(t.dir, { recursive: true });
    await writeFile(join(t.dir, "facts.json"), JSON.stringify(file, null, 2) + "\n");
    return { ok: true, errors: [], sourceHashes: Object.fromEntries(res.files.map((f) => [f.path, f.sha256])) };
  } catch (e) {
    if (e instanceof RevupError) return { ok: false, errors: [e.message] };
    throw e;
  }
};

export const validateScan: Handler = async (t) => {
  const { errors } = await loadFacts(t);
  return { ok: errors.length === 0, errors };
};

/** Registro padrão. 02/03 são artefatos do agente: "rodar" = validar. */
export const defaultHandlers: Handlers = {
  "01-scan": scanHandler,
  "02-extract": validateExtract,
  "03-spec": validateSpec,
  "04-audit": auditHandler,
};

export const defaultValidators: Partial<Handlers> = {
  "01-scan": validateScan,
  "04-audit": auditValidator,
};
