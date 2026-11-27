import { join } from "node:path";
import { TARGET_ID, type Project } from "../config.ts";
import { RevupError } from "../errors.ts";

export interface Target {
  project: Project;
  id: string;
  /** caminho do entry relativo ao sourceRoot */
  entry: string;
  /** diretório de saída do alvo (absoluto) */
  dir: string;
}

export function resolveTarget(project: Project, id: string): Target {
  if (!TARGET_ID.test(id)) throw new RevupError(`alvo inválido: "${id}" (esperado domain/module/program)`);
  const program = project.manifest.programs.find((p) => p.id === id);
  if (!program) throw new RevupError(`alvo "${id}" não está em revup.manifest.json`);
  return { project, id, entry: program.entry, dir: join(project.outDir, ...id.split("/")) };
}
