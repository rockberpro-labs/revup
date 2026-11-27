import { join } from "node:path";
import { MODULE_ID, TARGET_ID, type Project } from "../config.ts";
import { RevupError } from "../errors.ts";

export interface Target {
  project: Project;
  id: string;
  /** entry path relative to sourceRoot */
  entry: string;
  /** target output directory (absolute) */
  dir: string;
}

export function resolveTarget(project: Project, id: string): Target {
  if (!TARGET_ID.test(id)) throw new RevupError(`invalid target: "${id}" (expected domain/module/program)`);
  const program = project.manifest.programs.find((p) => p.id === id);
  if (!program) throw new RevupError(`target "${id}" is not in revup.manifest.json`);
  return { project, id, entry: program.entry, dir: join(project.outDir, ...id.split("/")) };
}

/** `domain/module/program` -> that program; `domain` or `domain/module` -> every program under it. */
export function resolveSelection(project: Project, selection: string): Target[] {
  if (TARGET_ID.test(selection)) return [resolveTarget(project, selection)];
  if (!MODULE_ID.test(selection) && !/^[A-Za-z0-9_-]+$/.test(selection)) {
    throw new RevupError(`invalid target: "${selection}" (expected domain, domain/module or domain/module/program)`);
  }
  const found = project.manifest.programs.filter((p) => p.id.startsWith(selection + "/"));
  if (!found.length) throw new RevupError(`no programs under "${selection}" in revup.manifest.json`);
  return found.map((p) => resolveTarget(project, p.id));
}
