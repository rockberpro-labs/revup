import { stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Engine } from "php-parser";
import { RevupError } from "../../errors.ts";
import type { RawFact } from "../facts.ts";
import { readSource } from "../reader.ts";
import type { ScanContext, ScanResult, Scanner } from "../scanner.ts";
import { extractAst } from "./extract-ast.ts";
import { extractRegex } from "./extract-regex.ts";

const engine = new (Engine as any)({
  parser: { suppressErrors: true, extractDoc: false },
  ast: { withPositions: true },
});

function extractFile(text: string, file: string): RawFact[] {
  let ast: any;
  try {
    ast = engine.parseCode(text, file);
  } catch (e) {
    return fallback(text, file, (e as Error).message, 1);
  }
  if (ast.errors?.length) {
    return fallback(text, file, String(ast.errors[0].message), ast.errors[0].lineNumber ?? ast.errors[0].line ?? 1);
  }
  return extractAst(ast, text, file);
}

function fallback(text: string, file: string, message: string, line: number): RawFact[] {
  const err: RawFact = {
    kind: "parse_error",
    file,
    line: Math.max(1, line),
    snippet: message.slice(0, 240),
    confidence: "heuristic",
    resolved: false,
    note: "regex fallback; facts from this file are heuristic",
  };
  return [err, ...extractRegex(text, file)].sort((a, b) => a.line - b.line);
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/** Order: includer dir, includePaths, sourceRoot (absolute paths are also tried under sourceRoot). */
function candidates(target: string, includerAbs: string, ctx: ScanContext): string[] {
  const t = target.replaceAll("{__DIR__}", dirname(includerAbs));
  if (isAbsolute(t)) return [resolve(t), resolve(join(ctx.sourceRoot, t))];
  return [
    resolve(dirname(includerAbs), t),
    ...ctx.includePaths.map((p) => resolve(ctx.sourceRoot, p, t)),
    resolve(ctx.sourceRoot, t),
  ];
}

export const phpScanner: Scanner = {
  language: "php",
  extensions: [".php"],
  async scan(entry: string, ctx: ScanContext): Promise<ScanResult> {
    const sourceRoot = resolve(ctx.sourceRoot);
    const toRel = (abs: string) => relative(sourceRoot, abs).split(sep).join("/");
    const inside = (abs: string) => !toRel(abs).startsWith("..");
    const entryAbs = resolve(sourceRoot, entry);
    if (!(await isFile(entryAbs))) throw new RevupError(`entry not found: ${entry} (sourceRoot: ${sourceRoot})`);

    const files: ScanResult["files"] = [];
    const facts: RawFact[] = [];
    const done = new Set<string>();
    const stack: string[] = [];

    const scanFile = async (abs: string): Promise<void> => {
      done.add(abs);
      stack.push(abs);
      const rel = toRel(abs);
      const src = await readSource(abs, ctx.encoding);
      files.push({ path: rel, sha256: src.sha256 });
      const own = extractFile(src.text, rel);
      const children: string[] = [];

      for (const f of own) {
        if (f.kind !== "include") continue;
        if (!f.resolved) {
          f.note = "dynamic include";
          continue;
        }
        let found: string | undefined;
        for (const c of candidates(f.target!, abs, { ...ctx, sourceRoot })) {
          if (await isFile(c)) {
            found = c;
            break;
          }
        }
        if (!found) {
          f.resolved = false;
          f.note = "file not found";
        } else if (!inside(found)) {
          f.resolved = false;
          f.note = "outside sourceRoot";
        } else {
          f.target = toRel(found);
          if (stack.includes(found)) f.note = "cycle";
          else if (!done.has(found) && !children.includes(found)) children.push(found);
        }
      }
      facts.push(...own);
      for (const c of children) if (!done.has(c)) await scanFile(c);
      stack.pop();
    };

    await scanFile(entryAbs);
    return { files, facts };
  },
};
