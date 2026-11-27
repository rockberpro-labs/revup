import { join } from "node:path";
import { TARGET_ID, type Project } from "../config.ts";
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
