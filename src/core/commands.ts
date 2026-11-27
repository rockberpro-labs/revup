import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CONFIG_FILE, MANIFEST_FILE, loadProject } from "../config.ts";
import { defaultHandlers, defaultValidators } from "./handlers.ts";
import { advance, check, statusRows, type Handlers, type Outcome } from "./next.ts";
import { buildPrompt, parseStep } from "./prompt.ts";
import { resolveTarget } from "./target.ts";

/** Resultado textual compartilhado por CLI e MCP. */
export interface CmdResult {
  ok: boolean;
  text: string;
}

function render(o: Outcome): CmdResult {
  const lines = [o.message, ...o.errors.map((e) => `  - ${e}`)];
  const blockedAudit = o.message.includes("BLOCKED");
  return { ok: !blockedAudit && (o.advanced || o.errors.length === 0), text: lines.join("\n") };
}

export async function cmdInit(projectDir: string): Promise<CmdResult> {
  const dir = resolve(projectDir);
  await mkdir(dir, { recursive: true });
  const created: string[] = [];
  const files: Record<string, unknown> = {
    [CONFIG_FILE]: { language: "php", sourceRoot: "../erp", outDir: "./revup-out", includePaths: [], encoding: "auto" },
    [MANIFEST_FILE]: { programs: [{ id: "dominio/modulo/programa", entry: "caminho/arquivo.php" }] },
  };
  for (const [name, body] of Object.entries(files)) {
    const path = join(dir, name);
    if (existsSync(path)) continue;
    await writeFile(path, JSON.stringify(body, null, 2) + "\n");
    created.push(name);
  }
  return { ok: true, text: created.length ? `criado: ${created.join(", ")}` : "nada a criar (arquivos já existem)" };
}

export async function cmdStatus(projectDir: string, id?: string): Promise<CmdResult> {
  const project = await loadProject(projectDir);
  const resolveId = (x: string) => resolveTarget(project, x);
  if (id) resolveId(id); // valida
  const rows = (await statusRows(project, resolveId)).filter((r) => !id || r.id === id);
  if (!rows.length) return { ok: true, text: "nenhum programa no manifest" };
  const text = rows
    .map((r) => `${r.id.padEnd(40)} ${r.step}${r.stale.length ? `  STALE (${r.stale.join(", ")})` : ""}`)
    .join("\n");
  return { ok: true, text };
}

export async function cmdNext(projectDir: string, id: string, handlers: Handlers = defaultHandlers): Promise<CmdResult> {
  const project = await loadProject(projectDir);
  return render(await advance(resolveTarget(project, id), handlers));
}

export async function cmdValidate(projectDir: string, id: string, handlers: Handlers = defaultHandlers): Promise<CmdResult> {
  const project = await loadProject(projectDir);
  return render(await check(resolveTarget(project, id), handlers, defaultValidators));
}

export async function cmdPrompt(projectDir: string, step: string, id: string): Promise<CmdResult> {
  const project = await loadProject(projectDir);
  return { ok: true, text: await buildPrompt(resolveTarget(project, id), parseStep(step)) };
}
