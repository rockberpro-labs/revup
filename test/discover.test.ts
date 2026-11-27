import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cmdDiscover } from "../src/core/commands.ts";
import { makeProject } from "./helpers.ts";

const FIXTURES = resolve(import.meta.dir, "fixtures/erp");

async function fixtureProject(programs: { id: string; entry: string }[] = []) {
  const dir = await mkdtemp(join(tmpdir(), "revup-disc-"));
  await writeFile(join(dir, "revup.config.json"), JSON.stringify({ sourceRoot: FIXTURES, outDir: "./out", includePaths: ["inc"] }));
  await writeFile(join(dir, "revup.manifest.json"), JSON.stringify({ programs }));
  return dir;
}
const manifest = async (dir: string) => JSON.parse(await readFile(join(dir, "revup.manifest.json"), "utf8"));

describe("discover", () => {
  test("proposes the entry point and reports the included file", async () => {
    const dir = await fixtureProject();
    const r = await cmdDiscover(dir, "vendas/pedidos", "vendas");
    expect(r.ok).toBe(true);
    expect(r.text).toContain("proposed for vendas/pedidos (dir: vendas):");
    expect(r.text).toContain("+ vendas/pedidos/pedido  vendas/pedido.php");
    expect(r.text).toContain("vendas/extra.php  included by vendas/pedido.php");
    expect(r.text).toContain("run again with --write to add 1 program(s) to revup.manifest.json");
    expect((await manifest(dir)).programs).toEqual([]);
  });

  test("--write appends to the manifest and a second run reports it as known", async () => {
    const dir = await fixtureProject([{ id: "x/y/z", entry: "inc/db.php" }]);
    await cmdDiscover(dir, "vendas/pedidos", "vendas", true);
    expect((await manifest(dir)).programs).toEqual([
      { id: "x/y/z", entry: "inc/db.php" },
      { id: "vendas/pedidos/pedido", entry: "vendas/pedido.php" },
    ]);
    const again = await cmdDiscover(dir, "vendas/pedidos", "vendas");
    expect(again.text).toContain("no new entry points for vendas/pedidos (dir: vendas)");
    expect(again.text).toContain("already in manifest as vendas/pedidos/pedido");
  });

  test("--write drops the init placeholder", async () => {
    const dir = await fixtureProject([{ id: "domain/module/program", entry: "path/to/file.php" }]);
    await cmdDiscover(dir, "vendas/pedidos", "vendas", true);
    expect((await manifest(dir)).programs.map((p: { id: string }) => p.id)).toEqual(["vendas/pedidos/pedido"]);
  });

  test("duplicate basenames get the subdirectory; id collisions get a suffix", async () => {
    const { dir } = await makeProject({ "m/a/list.php": "<?php echo 1;", "m/b/list.php": "<?php echo 2;", "m/other.php": "<?php echo 3;" });
    await writeFile(join(dir, "revup.manifest.json"), JSON.stringify({ programs: [{ id: "d/m/other", entry: "elsewhere.php" }] }));
    const r = await cmdDiscover(dir, "d/m", "m");
    expect(r.text).toContain("+ d/m/a-list");
    expect(r.text).toContain("+ d/m/b-list");
    expect(r.text).toContain("+ d/m/other-2");
  });

  test("errors: invalid module, missing directory, no files", async () => {
    const { dir } = await makeProject({ "empty/readme.txt": "x" });
    await expect(cmdDiscover(dir, "one", "empty")).rejects.toThrow('invalid module: "one" (expected domain/module)');
    await expect(cmdDiscover(dir, "d/m", "nope")).rejects.toThrow("directory not found: nope");
    await expect(cmdDiscover(dir, "d/m", "empty")).rejects.toThrow("no .php files under empty");
    await expect(cmdDiscover(dir, "d/m", "..")).rejects.toThrow("directory is outside sourceRoot: ..");
  });
});
