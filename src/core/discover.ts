import { readdir, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { MODULE_ID, type Project } from "../config.ts";
import { RevupError } from "../errors.ts";
import { getScanner } from "../scan/scanner.ts";

export interface Proposal {
  id: string;
  entry: string;
  inputs: number;
  session: number;
}
export interface Skipped {
  file: string;
  reason: string;
}
export interface Discovery {
  module: string;
  dir: string;
  proposals: Proposal[];
  skipped: Skipped[];
}

async function listFiles(root: string, exts: string[]): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string): Promise<void> => {
    const entries = await readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && exts.includes(extname(e.name).toLowerCase())) out.push(p);
    }
  };
  await walk(root);
  return out;
}

function slug(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, "_");
}

/**
 * Proposes manifest entries for the files under `dir` (relative to sourceRoot):
 * a file is an entry point when no other file in the directory includes it.
 * Read-only: scans but writes nothing.
 */
export async function discover(project: Project, module: string, dir: string): Promise<Discovery> {
  if (!MODULE_ID.test(module)) throw new RevupError(`invalid module: "${module}" (expected domain/module)`);
  const root = resolve(project.sourceRoot, dir);
  const toRel = (abs: string) => relative(project.sourceRoot, abs).split(sep).join("/");
  if (toRel(root).startsWith("..")) throw new RevupError(`directory is outside sourceRoot: ${dir}`);
  try {
    if (!(await stat(root)).isDirectory()) throw new Error();
  } catch {
    throw new RevupError(`directory not found: ${dir} (sourceRoot: ${project.sourceRoot})`);
  }

  const scanner = getScanner(project.config.language);
  const candidates = (await listFiles(root, scanner.extensions)).map(toRel).sort();
  if (!candidates.length) throw new RevupError(`no ${scanner.extensions.join("/")} files under ${dir}`);
  const candidateSet = new Set(candidates);

  const includedBy = new Map<string, string>();
  const counts = new Map<string, { inputs: number; session: number }>();
  const skipped: Skipped[] = [];
  const failed = new Set<string>();
  for (const file of candidates) {
    try {
      const res = await scanner.scan(file, {
        sourceRoot: project.sourceRoot,
        includePaths: project.config.includePaths,
        encoding: project.config.encoding,
      });
      // facts of the entry file itself only: included files are context, not evidence for this entry
      const own = res.facts.filter((f) => f.file === file);
      counts.set(file, {
        inputs: own.filter((f) => f.kind === "input").length,
        session: own.filter((f) => f.kind === "session").length,
      });
      for (const f of res.facts) {
        if (f.kind !== "include" || !f.resolved || !f.target || f.target === file) continue;
        if (candidateSet.has(f.target) && !includedBy.has(f.target)) includedBy.set(f.target, f.file);
      }
    } catch (e) {
      if (!(e instanceof RevupError)) throw e;
      failed.add(file);
      skipped.push({ file, reason: `scan failed: ${e.message}` });
    }
  }

  const registered = new Map(project.manifest.programs.map((p) => [p.entry, p.id]));
  const used = new Set(project.manifest.programs.map((p) => p.id));
  const entries = candidates.filter((f) => !failed.has(f) && !includedBy.has(f));
  for (const [file, by] of includedBy) skipped.push({ file, reason: `included by ${by}` });

  const baseNames = new Map<string, number>();
  for (const f of entries) {
    const b = slug(basename(f, extname(f)));
    baseNames.set(b, (baseNames.get(b) ?? 0) + 1);
  }

  const proposals: Proposal[] = [];
  for (const file of entries) {
    const known = registered.get(file);
    if (known) {
      skipped.push({ file, reason: `already in manifest as ${known}` });
      continue;
    }
    const base = slug(basename(file, extname(file)));
    let name = base;
    if ((baseNames.get(base) ?? 0) > 1) {
      const sub = relative(root, resolve(project.sourceRoot, file)).split(sep).slice(0, -1).map(slug);
      name = [...sub, base].join("-");
    }
    let id = `${module}/${name}`;
    for (let n = 2; used.has(id); n++) id = `${module}/${name}-${n}`;
    used.add(id);
    const c = counts.get(file)!;
    proposals.push({ id, entry: file, inputs: c.inputs, session: c.session });
  }
  skipped.sort((a, b) => a.file.localeCompare(b.file));
  return { module, dir, proposals, skipped };
}

export function renderDiscovery(d: Discovery, written: boolean): string {
  const lines: string[] = [];
  if (d.proposals.length) {
    lines.push(`${written ? "added" : "proposed"} for ${d.module} (dir: ${d.dir}):`);
    const w = Math.max(...d.proposals.map((p) => p.id.length));
    for (const p of d.proposals) {
      lines.push(`  + ${p.id.padEnd(w)}  ${p.entry}  (inputs: ${p.inputs}, session: ${p.session})`);
    }
  } else {
    lines.push(`no new entry points for ${d.module} (dir: ${d.dir})`);
  }
  if (d.skipped.length) {
    lines.push("skipped:");
    const w = Math.max(...d.skipped.map((s) => s.file.length));
    for (const s of d.skipped) lines.push(`  ${s.file.padEnd(w)}  ${s.reason}`);
  }
  if (d.proposals.length && !written) {
    lines.push(`run again with --write to add ${d.proposals.length} program(s) to revup.manifest.json`);
  }
  return lines.join("\n");
}
