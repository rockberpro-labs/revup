import { describe, expect, test } from "bun:test";
import { readFile, readdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/mcp.ts";

const ROOT = resolve(import.meta.dir, "..");
const json = async (p: string) => JSON.parse(await readFile(join(ROOT, p), "utf8"));

describe("conformidade Agent Plugins 1.0.0", () => {
  const ajv = new Ajv2020({ strict: false });

  test("plugin.json valida contra o schema oficial", async () => {
    const validate = ajv.compile(await json("test/schemas/plugin.schema.json"));
    const manifest = await json("plugin.json");
    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    expect(manifest.name).toMatch(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/);
  });

  test("mcp.json valida e usa comando/args conforme a spec", async () => {
    const validate = ajv.compile(await json("test/schemas/mcp.schema.json"));
    const mcp = await json("mcp.json");
    expect(validate(mcp), JSON.stringify(validate.errors)).toBe(true);
    const s = mcp.mcpServers.revup;
    expect(s.command).not.toContain("${"); // command nunca é expandido
    expect(s.args[0]).toStartWith("${PLUGIN_ROOT}/");
  });

  test("cada skill tem SKILL.md com name = diretório e description", async () => {
    const dirs = (await readdir(join(ROOT, "skills"), { withFileTypes: true })).filter((d) => d.isDirectory());
    expect(dirs.map((d) => d.name).sort()).toEqual(["revup", "revup-audit", "revup-extract", "revup-spec"]);
    for (const d of dirs) {
      const md = await readFile(join(ROOT, "skills", d.name, "SKILL.md"), "utf8");
      const fm = /^---\n([\s\S]*?)\n---/.exec(md)?.[1] ?? "";
      expect(fm, d.name).toContain(`name: ${d.name}`);
      const desc = /^description:\s*(.+)$/m.exec(fm)?.[1] ?? "";
      expect(desc.length, d.name).toBeGreaterThan(20);
      expect(desc.length, d.name).toBeLessThanOrEqual(1024);
      expect(d.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

async function project(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "revup-mcp-"));
  await writeFile(join(dir, "revup.config.json"), JSON.stringify({ sourceRoot: join(ROOT, "test/fixtures/erp"), outDir: "./out", includePaths: ["inc"] }));
  await writeFile(join(dir, "revup.manifest.json"), JSON.stringify({ programs: [{ id: "vendas/pedidos/cad", entry: "vendas/pedido.php" }] }));
  return dir;
}
const text = (r: any) => (r.content as { text: string }[])[0]!.text;

async function exercise(client: Client) {
  const dir = await project();
  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  expect(tools).toEqual(["revup_next", "revup_prompt", "revup_status", "revup_validate"]);

  const status = await client.callTool({ name: "revup_status", arguments: { projectDir: dir } });
  expect(status.isError).toBe(false);
  expect(text(status)).toContain("vendas/pedidos/cad");

  const next = await client.callTool({ name: "revup_next", arguments: { projectDir: dir, target: "vendas/pedidos/cad" } });
  expect(text(next)).toBe("[01-scan concluído] -> Próximo passo: 02-extract");

  const prompt = await client.callTool({ name: "revup_prompt", arguments: { projectDir: dir, step: "02-extract", target: "vendas/pedidos/cad" } });
  expect(text(prompt)).toContain("## Template");

  const bad = await client.callTool({ name: "revup_next", arguments: { projectDir: dir, target: "a/b/c" } });
  expect(bad.isError).toBe(true);
  expect(text(bad)).toContain("não está em revup.manifest.json");

  const fail = await client.callTool({ name: "revup_validate", arguments: { projectDir: dir, target: "vendas/pedidos/cad" } });
  expect(fail.isError).toBe(true);
  expect(text(fail)).toContain("observations.md ausente");
}

describe("servidor MCP", () => {
  test("em memória", async () => {
    const [a, b] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    await server.connect(a);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(b);
    await exercise(client);
    await client.close();
  });

  test("processo real via comando e args do mcp.json (stdio)", async () => {
    const s = (await json("mcp.json")).mcpServers.revup;
    const transport = new StdioClientTransport({
      command: s.command,
      args: s.args.map((a: string) => a.replaceAll("${PLUGIN_ROOT}", ROOT)),
      cwd: ROOT,
    });
    const client = new Client({ name: "test", version: "0" });
    await client.connect(transport);
    await exercise(client);
    await client.close();
  });
});
