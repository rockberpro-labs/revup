#!/usr/bin/env bun
import { RevupError } from "./errors.ts";
import { cmdDiscover, cmdInit, cmdNext, cmdPrompt, cmdStatus, cmdValidate, type CmdResult } from "./core/commands.ts";

const USAGE = `usage: revup [--project <dir>] <command>

  init                     create sample revup.config.json and revup.manifest.json
  discover <domain/module> <dir> [--write]  propose manifest entries for the files under <dir> (relative to sourceRoot)
  status [domain/module/program]
  next <domain/module/program>      run/validate the current step and advance
  validate <domain/module/program>  validate the current step without advancing
  prompt <step> <domain/module/program>  instructions for step 02-extract|03-spec|04-audit`;

export async function run(argv: string[]): Promise<CmdResult> {
  let project = process.cwd();
  const args = [...argv];
  const pi = args.indexOf("--project");
  if (pi >= 0) {
    project = args[pi + 1] ?? "";
    if (!project) throw new RevupError("--project requires a directory");
    args.splice(pi, 2);
  }
  const wi = args.indexOf("--write");
  const write = wi >= 0;
  if (write) args.splice(wi, 1);
  const [cmd, arg] = args;
  switch (cmd) {
    case "init":
      return cmdInit(project);
    case "discover": {
      const dir = args[2];
      if (!arg || !dir) throw new RevupError("discover requires <domain/module> <dir>");
      return cmdDiscover(project, arg, dir, write);
    }
    case "status":
      return cmdStatus(project, arg);
    case "next":
      if (!arg) throw new RevupError("next requires <domain/module/program>");
      return cmdNext(project, arg);
    case "validate":
      if (!arg) throw new RevupError("validate requires <domain/module/program>");
      return cmdValidate(project, arg);
    case "prompt": {
      const id = args[2];
      if (!arg || !id) throw new RevupError("prompt requires <step> <domain/module/program>");
      return cmdPrompt(project, arg, id);
    }
    default:
      return { ok: false, text: USAGE };
  }
}

if (import.meta.main) {
  try {
    const r = await run(process.argv.slice(2));
    console.log(r.text);
    process.exit(r.ok ? 0 : 1);
  } catch (e) {
    if (e instanceof RevupError) {
      console.error(`error: ${e.message}`);
      process.exit(2);
    }
    throw e;
  }
}
