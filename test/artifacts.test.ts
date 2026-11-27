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

function observations(over: Partial<Record<"rules" | "flow", string>> = {}) {
  return `# Observations\n\n## Observed rules\n${over.rules ?? `- Queries orders and customers by id ${cite(of("sql").slice(0, 1))}`}\n\n## Flow\n${over.flow ?? `- 1. Reads id and queries ${cite(of("input").slice(0, 1))}`}\n`;
}

function questions(skip?: string) {
  const qs = unresolved.filter((id) => id !== skip).map(
    (id, i) => `## Q-0${i + 1} Gap ${i + 1}\n- Evidence: [${id}]\n- Ambiguity: unknown dynamic value.\n`,
  );
  return `# Open questions\n\n${qs.join("\n")}`;
}

function spec(over: { omit?: string; extra?: string; pend?: string } = {}) {
  const pick = (...k: Fact["kind"][]) => cite(of(...k).filter((f) => f.id !== over.omit));
  const qrefs = unresolved.map((_, i) => `- Q-0${i + 1}: gap`).join("\n");
  return [
    "# Spec",
    "## Goal",
    "Registers order items.",
    "## Inputs",
    `- GET/POST parameters ${pick("input")}`,
    "## Database effects",
    `- Reads and writes ${pick("sql")}`,
    "## Session effects",
    `- User and last order ${pick("session")}`,
    "## Rules",
    `- Items are inserted without validation ${cite(of("sql").slice(1, 2))}`,
    "## Outputs/Redirects",
    `- Redirects to the list ${pick("redirect")}`,
    "## Open items",
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
  test("sections, bullets, citations and prose", () => {
    const md = "# T\n## A\n- one [F-0123abcd]\n1. two\nloose prose\n## B\n- None.\n";
    const s = parseSections(md);
    expect(s.map((x) => x.heading)).toEqual(["A", "B"]);
    expect(parseBullets(s[0]!.lines)).toEqual([
      { text: "one [F-0123abcd]", cites: ["F-0123abcd"], none: false },
      { text: "two", cites: [], none: false },
    ]);
    expect(parseBullets(s[1]!.lines)[0]!.none).toBe(true);
    expect(proseLines(s[0]!.lines)).toEqual(["loose prose"]);
    expect(extractCitations("[F-0123abcd, F-ffffffff] F-123")).toEqual(["F-0123abcd", "F-ffffffff"]);
  });
});

describe("02-extract", () => {
  test("advances with valid observations and questions", async () => {
    await w("observations.md", observations());
    await w("open-questions.md", questions());
    expect(await next()).toEqual({ ok: true, text: "[02-extract done] -> Next step: 03-spec" });
  });

  test("missing files", async () => {
    const res = await next();
    expect(res.ok).toBe(false);
    expect(res.text).toContain("observations.md is missing");
    expect(res.text).toContain("open-questions.md is missing");
  });

  test.each([
    ["bullet without a citation", { rules: "- no evidence" }, "bullet without a citation"],
    ["nonexistent citation", { rules: "- x [F-deadbeef]" }, "citation of a nonexistent fact F-deadbeef"],
    ["prose outside a bullet", { flow: "run-on text\n- ok [F-00000000]" }, "prose outside a bullet"],
    ["bullet too long", { flow: `- ${"a".repeat(260)} ${"[F-00000000]"}` }, "over 240"],
  ])("rejects %s", async (_n, over, msg) => {
    await w("observations.md", observations(over));
    await w("open-questions.md", questions());
    const res = await next();
    expect(res.ok).toBe(false);
    expect(res.text).toContain(msg);
  });

  test("rejects a missing section and a section outside the template", async () => {
    await w("observations.md", "# x\n## Observed rules\n- None.\n## Extra\n- y\n");
    await w("open-questions.md", questions());
    const res = await next();
    expect(res.text).toContain('section "## Flow" is missing');
    expect(res.text).toContain('"## Extra" is not part of the template');
  });

  test("every unresolved fact needs a question", async () => {
    await w("observations.md", observations());
    await w("open-questions.md", questions(unresolved[0]));
    const res = await next();
    expect(res.ok).toBe(false);
    expect(res.text).toContain(`fact ${unresolved[0]} (unresolved) has no question`);
  });

  test("question without evidence or without ambiguity", async () => {
    await w("observations.md", observations());
    await w("open-questions.md", `${questions()}\n## Q-09 Empty\n- Ambiguity: \n`);
    const res = await next();
    expect(res.text).toContain("question without evidence");
    expect(res.text).toContain("empty Ambiguity");
  });
});

describe("03-spec e 04-audit", () => {
  beforeEach(async () => {
    await w("observations.md", observations());
    await w("open-questions.md", questions());
    await next(); // 02
  });

  test("invalid spec: missing section, nonexistent Q, too large", async () => {
    await w("spec.md", spec({ pend: "- Q-77: ghost" }).replace("## Rules", "## Rulez"));
    const res = await next();
    expect(res.text).toContain('section "## Rules" is missing');
    expect(res.text).toContain('"## Rulez" is not part of the template');
    expect(res.text).toContain("Q-77 does not exist in open-questions.md");

    await w("spec.md", spec({ extra: Array(210).fill("- Nenhum.").join("\n") }));
    expect((await next()).text).toContain("over 200 lines");
  });

  test("full flow to READY; BLOCKED lists coverage and proposals", async () => {
    const omitted = of("input")[0]!.id;
    await w("spec.md", spec({ omit: omitted }));
    expect((await next()).text).toBe("[03-spec done] -> Next step: 04-audit");

    // 1st run: uncovered fact + pending proposals
    const blocked = await next();
    expect(blocked.ok).toBe(false);
    expect(blocked.text).toContain("[04-audit] -> Status: BLOCKED");
    expect(blocked.text).toContain(`fact ${omitted} not covered`);
    expect(blocked.text).toContain("Q-01 has no \"Default proposal\"");
    expect((await loadState(tdir)).step).toBe("04-audit");

    // fix the spec, but proposals are still missing
    await w("spec.md", spec());
    const still = await next();
    expect(still.text).not.toContain("not covered");
    expect(still.text).toContain("Q-01 has no");

    // the agent fills in the proposals; the CLI preserves them on regeneration
    let audit = await r("audit.md");
    audit = audit.replaceAll("<PENDING>", "Assume a fixed list.");
    await w("audit.md", audit);
    const done = await next();
    expect(done).toEqual({ ok: true, text: "[04-audit done] -> Status: READY" });
    expect((await r("audit.md")).trimEnd().endsWith("READY")).toBe(true);
    expect((await loadState(tdir)).step).toBe("DONE");
    expect((await next()).text).toBe("[DONE] nothing to do");
  });

  test("validate on 04 does not write audit.md", async () => {
    await w("spec.md", spec());
    await next(); // 03 → 04
    const v = await cmdValidate(dir, ID);
    expect(v.ok).toBe(false);
    await expect(readFile(join(tdir, "audit.md"), "utf8")).rejects.toThrow();
  });

  test("coverage requires sql/input/session/redirect and gaps, not calls", () => {
    const req = requiredFacts(facts);
    expect(req.some((f) => f.kind === "call" || f.kind === "function_def")).toBe(false);
    expect(req.filter((f) => f.kind === "include").map((f) => f.line)).toEqual([7]);
  });
});

describe("revup prompt", () => {
  test("includes absolute paths, the skill and the template", async () => {
    const p = (await cmdPrompt(dir, "02-extract", ID)).text;
    expect(p).toContain(`# Etapa 02-extract — ${ID}`);
    expect(p).toContain(join(tdir, "facts.json"));
    expect(p).toContain(join(FIXTURES, "vendas/pedido.php"));
    expect(p).toContain(join(tdir, "open-questions.md"));
    expect(p).toContain("## Template");
    expect(p).not.toContain("name: revup-extract"); // frontmatter stripped
    const a = (await cmdPrompt(dir, "04-audit", ID)).text;
    expect(a).toContain(join(tdir, "spec.md"));
  });

  test("01-scan and an invalid step", async () => {
    await expect(cmdPrompt(dir, "01-scan", ID)).rejects.toThrow("deterministic");
    await expect(cmdPrompt(dir, "09-x", ID)).rejects.toThrow("invalid step");
  });
});
