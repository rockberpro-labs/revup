import { describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cmdNext, cmdValidate } from "../src/core/commands.ts";
import { FactsFileSchema, assignIds, needsReview, type Fact } from "../src/scan/facts.ts";
import { phpScanner } from "../src/scan/php/index.ts";
import { analyzeSql } from "../src/scan/sql.ts";
import { getScanner } from "../src/scan/scanner.ts";

const FIXTURES = resolve(import.meta.dir, "fixtures/erp");
const ctx = (sourceRoot = FIXTURES) => ({ sourceRoot, includePaths: [], encoding: "auto" as const });

async function scan(entry: string, root = FIXTURES): Promise<{ facts: Fact[]; files: string[] }> {
  const r = await phpScanner.scan(entry, ctx(root));
  return { facts: assignIds(r.facts), files: r.files.map((f) => f.path) };
}
const of = (facts: Fact[], kind: Fact["kind"]) => facts.filter((f) => f.kind === kind);

describe("sql", () => {
  test("operação e tabelas", () => {
    expect(analyzeSql("SELECT a FROM t1 x, t2 y JOIN t3 ON 1 WHERE 1")).toEqual({
      operation: "SELECT",
      tables: ["t1", "t2", "t3"],
    });
    expect(analyzeSql("INSERT INTO `itens` (a) VALUES (1)")?.tables).toEqual(["itens"]);
    expect(analyzeSql("UPDATE db.contas SET a=1")?.tables).toEqual(["db.contas"]);
    expect(analyzeSql("DELETE FROM {$t} WHERE 1")?.tables).toEqual(["{$t}"]);
  });
  test("ignora prosa", () => {
    expect(analyzeSql("Select an option from the list")).toBeNull();
    expect(analyzeSql("Update the record")).toBeNull();
  });
});

describe("extrator php", () => {
  test("includes: resolve, recursa, trata ciclo, dinâmico e condicional", async () => {
    const { facts, files } = await scan("vendas/pedido.php");
    expect(files).toEqual(["vendas/pedido.php", "inc/db.php", "inc/util.php", "vendas/extra.php"]);
    const inc = of(facts, "include").filter((f) => f.file === "vendas/pedido.php");
    expect(inc.map((f) => [f.name, f.target, f.resolved])).toEqual([
      ["include", "inc/db.php", true],
      ["require_once", "inc/util.php", true],
      ["include", "vendas/extra.php", true],
      ["include", "{$modulo}.php", false],
    ]);
    expect(inc[3]!.note).toBe("include dinâmico");
    expect(of(facts, "include").find((f) => f.file === "inc/util.php")!.note).toBe("ciclo");
  });

  test("sql concatenado, interpolado e com tabela dinâmica", async () => {
    const { facts } = await scan("vendas/pedido.php");
    const sql = of(facts, "sql");
    expect(sql.map((f) => [f.operation, f.tables, f.line, f.resolved])).toEqual([
      ["SELECT", ["pedidos", "clientes"], 11, false],
      ["INSERT", ["itens"], 13, false],
      ["DELETE", ["{$tabela}"], 15, false],
    ]);
    expect(sql[0]!.text).toContain("WHERE p.id={$id}");
  });

  test("superglobais: chave, modo, sessão e uso sem chave", async () => {
    const { facts } = await scan("vendas/pedido.php");
    const pedido = (k: Fact["kind"]) => of(facts, k).filter((f) => f.file === "vendas/pedido.php");
    expect(pedido("input").map((f) => [f.source, f.key, f.mode])).toEqual([
      ["$_GET", "extra", "read"],
      ["$_GET", "id", "read"],
      ["$_POST", "qtd", "read"],
      ["$_POST", undefined, "read"],
    ]);
    expect(pedido("session").map((f) => [f.key, f.mode, f.line])).toEqual([
      ["ultimo_pedido", "write", 16],
      ["user", "read", 17],
      ["user", "read", 20],
    ]);
    expect(of(facts, "session").find((f) => f.file === "vendas/extra.php")!.mode).toBe("write");
  });

  test("redirect, funções e HTML misto com short tags", async () => {
    const { facts } = await scan("vendas/pedido.php");
    const [redirect] = of(facts, "redirect");
    expect(redirect).toMatchObject({ target: "lista.php?ok={$id}", resolved: false, line: 24 });
    expect(of(facts, "function_def").map((f) => f.name)).toContain("total_pedido");
    expect(of(facts, "call").map((f) => f.name)).toEqual(
      expect.arrayContaining(["session_start", "mysql_query", "header", "date"]),
    );
  });

  test("latin1 é decodificado sem corromper o SQL", async () => {
    const { facts } = await scan("legacy/latin1.php");
    expect(of(facts, "sql")[0]!.text).toContain("José");
    expect(of(facts, "session")[0]).toMatchObject({ key: "msg", mode: "write", line: 3 });
  });

  test("erro de sintaxe: parse_error + fallback heurístico", async () => {
    const { facts } = await scan("legacy/broken.php");
    expect(of(facts, "parse_error")).toHaveLength(1);
    expect(facts.every((f) => f.kind === "parse_error" || f.confidence === "heuristic")).toBe(true);
    expect(of(facts, "sql")[0]).toMatchObject({ operation: "UPDATE", tables: ["contas"] });
    expect(of(facts, "redirect")[0]).toMatchObject({ target: "ok.php", resolved: true });
    expect(of(facts, "input")[0]).toMatchObject({ key: "x", mode: "read" });
  });

  test("entry inexistente", async () => {
    await expect(scan("nao/existe.php")).rejects.toThrow("entry não encontrado");
  });

  test("ids são únicos, estáveis entre scans e imunes a linhas inseridas acima", async () => {
    const a = (await scan("vendas/pedido.php")).facts;
    const b = (await scan("vendas/pedido.php")).facts;
    expect(a.map((f) => f.id)).toEqual(b.map((f) => f.id));
    expect(new Set(a.map((f) => f.id)).size).toBe(a.length);

    const tmp = await mkdtemp(join(tmpdir(), "revup-fx-"));
    await cp(FIXTURES, tmp, { recursive: true });
    const p = join(tmp, "vendas/pedido.php");
    await writeFile(p, "\n\n\n" + (await readFile(p, "utf8")));
    const c = (await scan("vendas/pedido.php", tmp)).facts.filter((f) => f.file === "vendas/pedido.php");
    const orig = a.filter((f) => f.file === "vendas/pedido.php");
    expect(c.map((f) => f.id)).toEqual(orig.map((f) => f.id));
    expect(c[0]!.line).toBe(orig[0]!.line + 3);
  });
});

describe("seam de linguagem", () => {
  test("linguagem não registrada", () => {
    expect(() => getScanner("cobol")).toThrow('linguagem "cobol" não suportada; disponíveis: php');
    expect(getScanner("php").language).toBe("php");
  });
});

describe("01-scan via revup next", () => {
  async function project() {
    const dir = await mkdtemp(join(tmpdir(), "revup-e2e-"));
    await writeFile(
      join(dir, "revup.config.json"),
      JSON.stringify({ sourceRoot: FIXTURES, outDir: "./out", includePaths: ["inc"] }),
    );
    await writeFile(
      join(dir, "revup.manifest.json"),
      JSON.stringify({ programs: [{ id: "vendas/pedidos/cad", entry: "vendas/pedido.php" }] }),
    );
    return dir;
  }

  test("gera facts.json válido e anuncia o próximo passo", async () => {
    const dir = await project();
    const r = await cmdNext(dir, "vendas/pedidos/cad");
    expect(r).toEqual({ ok: true, text: "[01-scan concluído] -> Próximo passo: 02-extract" });
    const facts = FactsFileSchema.parse(JSON.parse(await readFile(join(dir, "out/vendas/pedidos/cad/facts.json"), "utf8")));
    expect(facts.language).toBe("php");
    expect(facts.unresolved.length).toBeGreaterThan(0);
    expect(facts.facts.filter(needsReview).map((f) => f.id).sort()).toEqual([...facts.unresolved].sort());
    // SQL só com valor interpolado não é lacuna; include dinâmico e tabela dinâmica são
    const byId = new Map(facts.facts.map((f) => [f.id, f]));
    const kinds = facts.unresolved.map((id) => `${byId.get(id)!.kind}:${byId.get(id)!.line}`).sort();
    expect(kinds).toEqual(["include:7", "sql:15"]);
    expect((await cmdValidate(dir, "vendas/pedidos/cad")).text).toContain("[02-extract]");
  });

  test("entry ausente falha sem avançar", async () => {
    const dir = await project();
    await writeFile(
      join(dir, "revup.manifest.json"),
      JSON.stringify({ programs: [{ id: "a/b/c", entry: "nope.php" }] }),
    );
    const r = await cmdNext(dir, "a/b/c");
    expect(r.ok).toBe(false);
    expect(r.text).toContain("entry não encontrado");
  });
});
