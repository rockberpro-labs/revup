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
  test("step order and messages", () => {
    expect(nextStep("01-scan")).toBe("02-extract");
    expect(nextStep("04-audit")).toBe("DONE");
    expect(completionMessage("01-scan", "02-extract")).toBe("[01-scan done] -> Next step: 02-extract");
    expect(completionMessage("04-audit", "DONE")).toBe("[04-audit done] -> Status: READY");
  });
  test("prerequisites", () => {
    expect(missingPrerequisites("01-scan", () => false)).toEqual([]);
    expect(missingPrerequisites("03-spec", (f) => f === "observations.md")).toEqual([
      "facts.json is missing (produced by 01-scan)",
      "open-questions.md is missing (produced by 02-extract)",
    ]);
  });
});

describe("advance", () => {
  test("walks the 4 steps to DONE", async () => {
    const { target } = await makeProject();
    const h = fakeHandlers();
    const msgs: string[] = [];
    for (let i = 0; i < 4; i++) msgs.push((await advance(target, h)).message);
    expect(msgs).toEqual([
      "[01-scan done] -> Next step: 02-extract",
      "[02-extract done] -> Next step: 03-spec",
      "[03-spec done] -> Next step: 04-audit",
      "[04-audit done] -> Status: READY",
    ]);
    expect((await loadState(target.dir)).step).toBe("DONE");
    expect((await advance(target, h)).message).toBe("[DONE] nothing to do");
  });

  test("does not advance when the handler fails", async () => {
    const { target } = await makeProject();
    const r = await advance(target, fakeHandlers({ "01-scan": () => ({ ok: false, errors: ["boom"] }) }));
    expect(r.advanced).toBe(false);
    expect(r.errors).toEqual(["boom"]);
    expect((await loadState(target.dir)).step).toBe("01-scan");
  });

  test("refuses 03-spec without facts.json", async () => {
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
    expect(r.errors.join()).toContain("facts.json is missing");
    expect((await loadState(target.dir)).step).toBe("03-spec");
  });

  test("04-audit BLOCKED does not advance", async () => {
    const { target } = await makeProject();
    const h = fakeHandlers({ "04-audit": () => ({ ok: true, errors: ["F-1 not cited"], verdict: "BLOCKED" }) });
    for (let i = 0; i < 3; i++) await advance(target, h);
    const r = await advance(target, h);
    expect(r.message).toBe("[04-audit] -> Status: BLOCKED");
    expect(r.errors).toEqual(["F-1 not cited"]);
    expect((await loadState(target.dir)).step).toBe("04-audit");
  });

  test("changed source => STALE and 01-scan restart", async () => {
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
    expect((await check(target, h)).errors).toContain("source changed: a.php");
    const r = await advance(target, h);
    expect(r.message).toContain("restarting from 01-scan");
    expect(r.message).toContain("[01-scan done]");
  });
});

describe("targets and commands", () => {
  test("invalid target or not in the manifest", async () => {
    const { project } = await makeProject();
    expect(() => resolveTarget(project, "so/dois")).toThrow("invalid target");
    expect(() => resolveTarget(project, "a/b/c")).toThrow("is not in revup.manifest.json");
  });

  test("init creates files, status lists targets, next uses the default handlers", async () => {
    const { dir } = await makeProject();
    expect((await cmdInit(dir)).text).toContain("nothing to create");
    expect((await cmdStatus(dir)).text).toContain("vendas/pedidos/cad");
    const first = await cmdNext(dir, "vendas/pedidos/cad");
    expect(first).toEqual({ ok: true, text: "[01-scan done] -> Next step: 02-extract" });
    const r = await cmdNext(dir, "vendas/pedidos/cad");
    expect(r.ok).toBe(false);
    expect(r.text).toContain("observations.md is missing");
  });

  test("a manifest with an invalid id is rejected", async () => {
    const { dir } = await makeProject();
    await writeFile(join(dir, "revup.manifest.json"), JSON.stringify({ programs: [{ id: "x", entry: "a.php" }] }));
    await expect(loadProject(dir)).rejects.toThrow("domain/module/program");
  });
});
