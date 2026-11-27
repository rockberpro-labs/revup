import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProject } from "../src/config.ts";
import { resolveTarget } from "../src/core/target.ts";
import type { Handlers, StepResult } from "../src/core/next.ts";

export async function makeProject(files: Record<string, string> = { "a.php": "<?php echo 1;" }) {
  const dir = await mkdtemp(join(tmpdir(), "revup-"));
  const src = join(dir, "erp");
  await mkdir(src, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    await mkdir(join(src, name, ".."), { recursive: true });
    await writeFile(join(src, name), body);
  }
  await writeFile(join(dir, "revup.config.json"), JSON.stringify({ sourceRoot: "./erp", outDir: "./out" }));
  await writeFile(
    join(dir, "revup.manifest.json"),
    JSON.stringify({ programs: [{ id: "vendas/pedidos/cad", entry: "a.php" }] }),
  );
  const project = await loadProject(dir);
  return { dir, src, project, target: resolveTarget(project, "vendas/pedidos/cad") };
}

export const ok = (extra: Partial<StepResult> = {}): StepResult => ({ ok: true, errors: [], ...extra });

/** Handlers que escrevem os artefatos e passam. */
export function fakeHandlers(over: Partial<Handlers> = {}): Handlers {
  const write = (files: string[], extra: Partial<StepResult> = {}) => async (t: { dir: string }) => {
    await mkdir(t.dir, { recursive: true });
    for (const f of files) await writeFile(join(t.dir, f), "x");
    return ok(extra);
  };
  return {
    "01-scan": write(["facts.json"], { sourceHashes: {} }),
    "02-extract": write(["observations.md", "open-questions.md"]),
    "03-spec": write(["spec.md"]),
    "04-audit": write(["audit.md"], { verdict: "READY" }),
    ...over,
  };
}
