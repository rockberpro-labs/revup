#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { cmdNext, cmdPrompt, cmdStatus, cmdValidate, type CmdResult } from "./core/commands.ts";
import { RevupError } from "./errors.ts";

const projectDir = z.string().describe("Pasta do projeto revup (onde está revup.config.json)");
const target = z.string().describe("Alvo no formato domain/module/program");

async function respond(fn: () => Promise<CmdResult>) {
  try {
    const r = await fn();
    return { content: [{ type: "text" as const, text: r.text }], isError: !r.ok };
  } catch (e) {
    if (e instanceof RevupError) return { content: [{ type: "text" as const, text: `erro: ${e.message}` }], isError: true };
    throw e;
  }
}

/** Mesmo core da CLI (src/core/commands.ts), exposto como tools MCP. */
export function createServer(): McpServer {
  const server = new McpServer({ name: "revup", version: "0.1.0" });

  server.registerTool(
    "revup_status",
    { description: "Lista alvos e a etapa corrente (STALE se o PHP mudou desde o scan).", inputSchema: { projectDir, target: target.optional() } },
    ({ projectDir, target }) => respond(() => cmdStatus(projectDir, target)),
  );
  server.registerTool(
    "revup_next",
    {
      description: "Executa/valida a etapa corrente do alvo e avança. Imprime '[etapa concluído] -> Próximo passo: ...' ou os erros exatos.",
      inputSchema: { projectDir, target },
    },
    ({ projectDir, target }) => respond(() => cmdNext(projectDir, target)),
  );
  server.registerTool(
    "revup_prompt",
    {
      description: "Instrução da etapa (02-extract, 03-spec, 04-audit) com caminhos absolutos e template rígido.",
      inputSchema: { projectDir, step: z.enum(["02-extract", "03-spec", "04-audit"]), target },
    },
    ({ projectDir, step, target }) => respond(() => cmdPrompt(projectDir, step, target)),
  );
  server.registerTool(
    "revup_validate",
    { description: "Valida a etapa corrente do alvo sem avançar nem gravar estado.", inputSchema: { projectDir, target } },
    ({ projectDir, target }) => respond(() => cmdValidate(projectDir, target)),
  );
  return server;
}

if (import.meta.main) {
  await createServer().connect(new StdioServerTransport());
}
