import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cmdInit, cmdNext, cmdStatus } from "../src/core/commands.ts";
import { advance, check } from "../src/core/next.ts";
import { resolveTarget } from "../src/core/target.ts";
import { loadProject } from "../src/config.ts";
import { completionMessage, missingPrerequisites, nextStep } from "../src/state/machine.ts";
import { loadState, saveState, sha256 } from "../src/state/store.ts";
import { fakeHandlers, makeProject, ok } from "./helpers.ts";

describe("machine", () => {
  test("ordem das etapas e mensagens", () => {
    expect(nextStep("01-scan")).toBe("02-extract");
    expect(nextStep("04-audit")).toBe("DONE");
    expect(completionMessage("01-scan", "02-extract")).toBe("[01-scan concluído] -> Próximo passo: 02-extract");
    expect(completionMessage("04-audit", "DONE")).toBe("[04-audit concluído] -> Status: READY");
  });
  test("pré-requisitos", () => {
    expect(missingPrerequisites("01-scan", () => false)).toEqual([]);
    expect(missingPrerequisites("03-spec", (f) => f === "observations.md")).toEqual([
      "facts.json ausente (produzido por 01-scan)",
      "open-questions.md ausente (produzido por 02-extract)",
    ]);
  });
});

describe("advance", () => {
  test("percorre as 4 etapas até DONE", async () => {
    const { target } = await makeProject();
    const h = fakeHandlers();
    const msgs: string[] = [];
    for (let i = 0; i < 4; i++) msgs.push((await advance(target, h)).message);
    expect(msgs).toEqual([
      "[01-scan concluído] -> Próximo passo: 02-extract",
      "[02-extract concluído] -> Próximo passo: 03-spec",
      "[03-spec concluído] -> Próximo passo: 04-audit",
      "[04-audit concluído] -> Status: READY",
    ]);
    expect((await loadState(target.dir)).step).toBe("DONE");
    expect((await advance(target, h)).message).toBe("[DONE] nada a fazer");
  });

  test("não avança quando o handler falha", async () => {
    const { target } = await makeProject();
    const r = await advance(target, fakeHandlers({ "01-scan": () => ({ ok: false, errors: ["boom"] }) }));
    expect(r.advanced).toBe(false);
    expect(r.errors).toEqual(["boom"]);
    expect((await loadState(target.dir)).step).toBe("01-scan");
  });

  test("recusa 03-spec sem facts.json", async () => {
    const { target } = await makeProject();
    await mkdir(target.dir, { recursive: true });
    await saveState(target.dir, {
      step: "03-spec",
      completed: ["01-scan", "02-extract"],
      sourceHashes: {},
      updatedAt: "",
    });
    let called = false;
    const r = await advance(target, fakeHandlers({ "03-spec": () => ((called = true), ok()) }));
    expect(called).toBe(false);
    expect(r.errors.join()).toContain("facts.json ausente");
    expect((await loadState(target.dir)).step).toBe("03-spec");
  });

  test("04-audit BLOCKED não avança", async () => {
    const { target } = await makeProject();
    const h = fakeHandlers({ "04-audit": () => ({ ok: true, errors: ["F-1 não citado"], verdict: "BLOCKED" }) });
    for (let i = 0; i < 3; i++) await advance(target, h);
    const r = await advance(target, h);
    expect(r.message).toBe("[04-audit] -> Status: BLOCKED");
    expect(r.errors).toEqual(["F-1 não citado"]);
    expect((await loadState(target.dir)).step).toBe("04-audit");
  });

  test("fonte alterado => STALE e reinício do 01-scan", async () => {
    const { target, src } = await makeProject({ "a.php": "<?php echo 1;" });
    const hashes = { "a.php": sha256("<?php echo 1;") };
    const h = fakeHandlers({ "01-scan": async (t) => {
      await mkdir(t.dir, { recursive: true });
      await writeFile(join(t.dir, "facts.json"), "{}");
      return ok({ sourceHashes: hashes });
    } });
    await advance(target, h);
    expect((await check(target, h)).errors).toEqual([]);
    await writeFile(join(src, "a.php"), "<?php echo 2;");
    expect((await check(target, h)).errors).toContain("fonte alterado: a.php");
    const r = await advance(target, h);
    expect(r.message).toContain("reiniciando a partir de 01-scan");
    expect(r.message).toContain("[01-scan concluído]");
  });
});

describe("alvos e comandos", () => {
  test("alvo inválido ou fora do manifest", async () => {
    const { project } = await makeProject();
    expect(() => resolveTarget(project, "so/dois")).toThrow("alvo inválido");
    expect(() => resolveTarget(project, "a/b/c")).toThrow("não está em revup.manifest.json");
  });

  test("init cria arquivos, status lista alvos, next usa handlers padrão", async () => {
    const { dir } = await makeProject();
    expect((await cmdInit(dir)).text).toContain("nada a criar");
    expect((await cmdStatus(dir)).text).toContain("vendas/pedidos/cad");
    const r = await cmdNext(dir, "vendas/pedidos/cad");
    expect(r.ok).toBe(false);
    expect(r.text).toContain("ainda não implementada");
  });

  test("manifest com id inválido é rejeitado", async () => {
    const { dir } = await makeProject();
    await writeFile(join(dir, "revup.manifest.json"), JSON.stringify({ programs: [{ id: "x", entry: "a.php" }] }));
    await expect(loadProject(dir)).rejects.toThrow("domain/module/program");
  });
});
