import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { STEPS } from "./machine.ts";

const StepEnum = z.enum(STEPS);

export const StateSchema = z.object({
  step: z.union([StepEnum, z.literal("DONE")]),
  completed: z.array(StepEnum),
  /** caminho relativo a sourceRoot -> sha256 */
  sourceHashes: z.record(z.string(), z.string()),
  updatedAt: z.string(),
});
export type State = z.infer<typeof StateSchema>;

export function initialState(): State {
  return { step: "01-scan", completed: [], sourceHashes: {}, updatedAt: new Date().toISOString() };
}

export function sha256(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export async function loadState(targetDir: string): Promise<State> {
  try {
    const raw = await readFile(join(targetDir, "state.json"), "utf8");
    return StateSchema.parse(JSON.parse(raw));
  } catch {
    return initialState();
  }
}

export async function saveState(targetDir: string, state: State): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const next = { ...state, updatedAt: new Date().toISOString() };
  await writeFile(join(targetDir, "state.json"), JSON.stringify(next, null, 2) + "\n");
}

/** Arquivos-fonte cujo hash mudou (ou que sumiram) desde o scan. */
export async function staleFiles(sourceRoot: string, hashes: Record<string, string>): Promise<string[]> {
  const stale: string[] = [];
  for (const [rel, hash] of Object.entries(hashes)) {
    try {
      if (sha256(await readFile(join(sourceRoot, rel))) !== hash) stale.push(rel);
    } catch {
      stale.push(rel);
    }
  }
  return stale;
}
