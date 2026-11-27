import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { RevupError } from "./errors.ts";

export const TARGET_ID = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/;

export const ConfigSchema = z.object({
  language: z.string().default("php"),
  sourceRoot: z.string().min(1),
  outDir: z.string().default("./revup-out"),
  includePaths: z.array(z.string()).default([]),
  encoding: z.enum(["auto", "utf8", "latin1"]).default("auto"),
});
export type Config = z.infer<typeof ConfigSchema>;

export const ManifestSchema = z.object({
  programs: z.array(
    z.object({
      id: z.string().regex(TARGET_ID, "id must be domain/module/program"),
      entry: z.string().min(1),
    }),
  ),
});
export type Manifest = z.infer<typeof ManifestSchema>;

export interface Project {
  dir: string;
  config: Config;
  manifest: Manifest;
  /** absolute sourceRoot */
  sourceRoot: string;
  /** absolute outDir */
  outDir: string;
}

export const CONFIG_FILE = "revup.config.json";
export const MANIFEST_FILE = "revup.manifest.json";

async function readJson<T>(file: string, schema: z.ZodType<T>): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new RevupError(`file not found: ${file} (run \`revup init\`)`);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new RevupError(`invalid JSON in ${file}: ${(e as Error).message}`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new RevupError(`${file} is invalid:\n  ${issues.join("\n  ")}`);
  }
  return parsed.data;
}

export async function loadProject(projectDir: string): Promise<Project> {
  const dir = resolve(projectDir);
  const config = await readJson(join(dir, CONFIG_FILE), ConfigSchema);
  const manifest = await readJson(join(dir, MANIFEST_FILE), ManifestSchema);
  const ids = new Set<string>();
  for (const p of manifest.programs) {
    if (ids.has(p.id)) throw new RevupError(`${MANIFEST_FILE}: duplicate id: ${p.id}`);
    ids.add(p.id);
  }
  return {
    dir,
    config,
    manifest,
    sourceRoot: resolve(dir, config.sourceRoot),
    outDir: resolve(dir, config.outDir),
  };
}
