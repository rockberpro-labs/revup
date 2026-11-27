#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { cmdDiscover, cmdNext, cmdPrompt, cmdStatus, cmdValidate, type CmdResult } from "./core/commands.ts";
import { RevupError } from "./errors.ts";

const projectDir = z.string().describe("Revup project folder (where revup.config.json lives)");
const target = z.string().describe("Target as domain/module/program");
const selection = z.string().describe("Target as domain/module/program, or domain/module for every program in a module");

async function respond(fn: () => Promise<CmdResult>) {
  try {
    const r = await fn();
    return { content: [{ type: "text" as const, text: r.text }], isError: !r.ok };
  } catch (e) {
    if (e instanceof RevupError) return { content: [{ type: "text" as const, text: `error: ${e.message}` }], isError: true };
    throw e;
  }
}

/** Same core as the CLI (src/core/commands.ts), exposed as MCP tools. */
export function createServer(): McpServer {
  const server = new McpServer({ name: "revup", version: "0.1.0" });

  server.registerTool(
    "revup_discover",
    {
      description:
        "Finds the entry points (files no other file includes) under a source directory and proposes manifest entries for a module. Preview by default; write=true appends them to revup.manifest.json.",
      inputSchema: {
        projectDir,
        module: z.string().describe("Module as domain/module"),
        dir: z.string().describe("Directory to search, relative to sourceRoot"),
        write: z.boolean().optional().describe("Append the proposed entries to the manifest"),
      },
    },
    ({ projectDir, module, dir, write }) => respond(() => cmdDiscover(projectDir, module, dir, write ?? false)),
  );
  server.registerTool(
    "revup_status",
    { description: "Lists targets and their current step (STALE if the PHP changed since the scan).", inputSchema: { projectDir, target: selection.optional() } },
    ({ projectDir, target }) => respond(() => cmdStatus(projectDir, target)),
  );
  server.registerTool(
    "revup_next",
    {
      description: "Runs/validates the target's current step and advances. Prints '[step done] -> Next step: ...' or the exact errors. With domain/module it only runs 01-scan for each program and lists the others.",
      inputSchema: { projectDir, target: selection },
    },
    ({ projectDir, target }) => respond(() => cmdNext(projectDir, target)),
  );
  server.registerTool(
    "revup_prompt",
    {
      description: "Instructions for a step (02-extract, 03-spec, 04-audit) with absolute paths and the rigid template.",
      inputSchema: { projectDir, step: z.enum(["02-extract", "03-spec", "04-audit"]), target },
    },
    ({ projectDir, step, target }) => respond(() => cmdPrompt(projectDir, step, target)),
  );
  server.registerTool(
    "revup_validate",
    { description: "Validates the target's current step without advancing or writing state.", inputSchema: { projectDir, target } },
    ({ projectDir, target }) => respond(() => cmdValidate(projectDir, target)),
  );
  return server;
}

if (import.meta.main) {
  await createServer().connect(new StdioServerTransport());
}
