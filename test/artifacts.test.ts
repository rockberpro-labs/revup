import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { extractCitations, parseBullets, parseSections, proseLines } from "../src/artifacts/markdown.ts";
import { cmdNext, cmdPrompt, cmdValidate } from "../src/core/commands.ts";
import { loadState } from "../src/state/store.ts";
import { requiredFacts } from "../src/audit/coverage.ts";
import { FactsFileSchema, type Fact } from "../src/scan/facts.ts";

const FIXTURES = resolve(import.meta.dir, "fixtures/erp");
const ID = "vendas/pedidos/cad";

let dir: string;
let tdir: string;
let facts: Fact[];
let unresolved: string[];

const cite = (fs: Fact[]) => `[${fs.map((f) => f.id).join(", ")}]`;
const w = (name: string, body: string) => writeFile(join(tdir, name), body);
const r = (name: string) => readFile(join(tdir, name), "utf8");
const of = (...kinds: Fact["kind"][]) => facts.filter((f) => kinds.includes(f.kind));

function observations(over: Partial<Record<"regras" | "fluxo", string>> = {}) {
  return `# Observações\n\n## Regras observadas\n${over.regras ?? `- Consulta pedidos e clientes por id ${cite(of("sql").slice(0, 1))}`}\n\n## Fluxo\n${over.fluxo ?? `- 1. Lê id e consulta ${cite(of("input").slice(0, 1))}`}\n`;
}

function questions(skip?: string) {
  const qs = unresolved.filter((id) => id !== skip).map(
    (id, i) => `## Q-0${i + 1} Lacuna ${i + 1}\n- Evidência: [${id}]\n- Ambiguidade: valor dinâmico desconhecido.\n`,
  );
  return `# Perguntas\n\n${qs.join("\n")}`;
}

function spec(over: { omit?: string; extra?: string; pend?: string } = {}) {
  const pick = (...k: Fact["kind"][]) => cite(of(...k).filter((f) => f.id !== over.omit));
  const qrefs = unresolved.map((_, i) => `- Q-0${i + 1}: lacuna`).join("\n");
  return [
    "# Spec",
    "## Objetivo",
    "Cadastra itens de pedido.",
    "## Entradas",
    `- Parâmetros de GET/POST ${pick("input")}`,
    "## Efeitos no banco",
    `- Consultas e escritas ${pick("sql")}`,
    "## Efeitos em sessão",
    `- Usuário e último pedido ${pick("session")}`,
    "## Regras",
    `- Itens são inseridos sem validação ${cite(of("sql").slice(1, 2))}`,
    "## Saídas/Redirecionamentos",
    `- Redireciona para a lista ${pick("redirect")}`,
    "## Pendências",
    over.pend ?? qrefs,
    over.extra ?? "",
  ].join("\n") + "\n";
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "revup-art-"));
  await writeFile(join(dir, "revup.config.json"), JSON.stringify({ sourceRoot: FIXTURES, outDir: "./out", includePaths: ["inc"] }));
  await writeFile(join(dir, "revup.manifest.json"), JSON.stringify({ programs: [{ id: ID, entry: "vendas/pedido.php" }] }));
  tdir = join(dir, "out", ID);
  await cmdNext(dir, ID); // 01-scan
  const f = FactsFileSchema.parse(JSON.parse(await r("facts.json")));
  facts = f.facts;
  unresolved = f.unresolved;
});

const next = () => cmdNext(dir, ID);

describe("markdown", () => {
  test("seções, bullets, citações e prosa", () => {
    const md = "# T\n## A\n- um [F-0123abcd]\n1. dois\nprosa solta\n## B\n- Nenhuma.\n";
    const s = parseSections(md);
    expect(s.map((x) => x.heading)).toEqual(["A", "B"]);
    expect(parseBullets(s[0]!.lines)).toEqual([
      { text: "um [F-0123abcd]", cites: ["F-0123abcd"], none: false },
      { text: "dois", cites: [], none: false },
    ]);
    expect(parseBullets(s[1]!.lines)[0]!.none).toBe(true);
    expect(proseLines(s[0]!.lines)).toEqual(["prosa solta"]);
    expect(extractCitations("[F-0123abcd, F-ffffffff] F-123")).toEqual(["F-0123abcd", "F-ffffffff"]);
  });
});

describe("02-extract", () => {
  test("avança com observations e perguntas válidas", async () => {
    await w("observations.md", observations());
    await w("open-questions.md", questions());
    expect(await next()).toEqual({ ok: true, text: "[02-extract concluído] -> Próximo passo: 03-spec" });
  });

  test("falta de arquivos", async () => {
    const res = await next();
    expect(res.ok).toBe(false);
    expect(res.text).toContain("observations.md ausente");
    expect(res.text).toContain("open-questions.md ausente");
  });

  test.each([
    ["bullet sem citação", { regras: "- sem evidência" }, "bullet sem citação"],
    ["citação inexistente", { regras: "- x [F-deadbeef]" }, "citação a fato inexistente F-deadbeef"],
    ["prosa fora de bullet", { fluxo: "texto corrido\n- ok [F-00000000]" }, "prosa fora de bullet"],
    ["bullet longo demais", { fluxo: `- ${"a".repeat(260)} ${"[F-00000000]"}` }, "acima de 240"],
  ])("rejeita %s", async (_n, over, msg) => {
    await w("observations.md", observations(over));
    await w("open-questions.md", questions());
    const res = await next();
    expect(res.ok).toBe(false);
    expect(res.text).toContain(msg);
  });

  test("rejeita seção faltando e seção fora do template", async () => {
    await w("observations.md", "# x\n## Regras observadas\n- Nenhuma.\n## Extra\n- y\n");
    await w("open-questions.md", questions());
    const res = await next();
    expect(res.text).toContain('seção "## Fluxo" ausente');
    expect(res.text).toContain('"## Extra" não faz parte do template');
  });

  test("todo fato unresolved precisa de pergunta", async () => {
    await w("observations.md", observations());
    await w("open-questions.md", questions(unresolved[0]));
    const res = await next();
    expect(res.ok).toBe(false);
    expect(res.text).toContain(`fato ${unresolved[0]} (unresolved) sem pergunta`);
  });

  test("pergunta sem evidência ou sem ambiguidade", async () => {
    await w("observations.md", observations());
    await w("open-questions.md", `${questions()}\n## Q-09 Vazia\n- Ambiguidade: \n`);
    const res = await next();
    expect(res.text).toContain("pergunta sem evidência");
    expect(res.text).toContain("Ambiguidade vazia");
  });
});

describe("03-spec e 04-audit", () => {
  beforeEach(async () => {
    await w("observations.md", observations());
    await w("open-questions.md", questions());
    await next(); // 02
  });

  test("spec inválida: seção faltando, Q inexistente, grande demais", async () => {
    await w("spec.md", spec({ pend: "- Q-77: fantasma" }).replace("## Regras", "## Regrinhas"));
    const res = await next();
    expect(res.text).toContain('seção "## Regras" ausente');
    expect(res.text).toContain('"## Regrinhas" não faz parte do template');
    expect(res.text).toContain("Q-77 não existe em open-questions.md");

    await w("spec.md", spec({ extra: Array(210).fill("- Nenhum.").join("\n") }));
    expect((await next()).text).toContain("acima de 200 linhas");
  });

  test("fluxo completo até READY; BLOCKED lista cobertura e propostas", async () => {
    const omitted = of("input")[0]!.id;
    await w("spec.md", spec({ omit: omitted }));
    expect((await next()).text).toBe("[03-spec concluído] -> Próximo passo: 04-audit");

    // 1ª: fato não coberto + propostas pendentes
    const blocked = await next();
    expect(blocked.ok).toBe(false);
    expect(blocked.text).toContain("[04-audit] -> Status: BLOCKED");
    expect(blocked.text).toContain(`fato ${omitted} não coberto`);
    expect(blocked.text).toContain("Q-01 sem \"Proposta padrão\"");
    expect((await loadState(tdir)).step).toBe("04-audit");

    // corrige a spec, mas ainda faltam propostas
    await w("spec.md", spec());
    const still = await next();
    expect(still.text).not.toContain("não coberto");
    expect(still.text).toContain("Q-01 sem");

    // agente preenche as propostas; a CLI preserva ao regerar
    let audit = await r("audit.md");
    audit = audit.replaceAll("<PENDENTE>", "Assumir lista fixa.");
    await w("audit.md", audit);
    const done = await next();
    expect(done).toEqual({ ok: true, text: "[04-audit concluído] -> Status: READY" });
    expect((await r("audit.md")).trimEnd().endsWith("READY")).toBe(true);
    expect((await loadState(tdir)).step).toBe("DONE");
    expect((await next()).text).toBe("[DONE] nada a fazer");
  });

  test("validate no 04 não escreve audit.md", async () => {
    await w("spec.md", spec());
    await next(); // 03 → 04
    const v = await cmdValidate(dir, ID);
    expect(v.ok).toBe(false);
    await expect(readFile(join(tdir, "audit.md"), "utf8")).rejects.toThrow();
  });

  test("cobertura exige sql/input/session/redirect e lacunas, não calls", () => {
    const req = requiredFacts(facts);
    expect(req.some((f) => f.kind === "call" || f.kind === "function_def")).toBe(false);
    expect(req.filter((f) => f.kind === "include").map((f) => f.line)).toEqual([7]);
  });
});

describe("revup prompt", () => {
  test("inclui caminhos absolutos, skill e template", async () => {
    const p = (await cmdPrompt(dir, "02-extract", ID)).text;
    expect(p).toContain(`# Etapa 02-extract — ${ID}`);
    expect(p).toContain(join(tdir, "facts.json"));
    expect(p).toContain(join(FIXTURES, "vendas/pedido.php"));
    expect(p).toContain(join(tdir, "open-questions.md"));
    expect(p).toContain("## Template");
    expect(p).not.toContain("name: revup-extract"); // frontmatter removido
    const a = (await cmdPrompt(dir, "04-audit", ID)).text;
    expect(a).toContain(join(tdir, "spec.md"));
  });

  test("01-scan e etapa inválida", async () => {
    await expect(cmdPrompt(dir, "01-scan", ID)).rejects.toThrow("determinística");
    await expect(cmdPrompt(dir, "09-x", ID)).rejects.toThrow("etapa inválida");
  });
});
