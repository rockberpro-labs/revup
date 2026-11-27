#!/usr/bin/env bun
import { RevupError } from "./errors.ts";
import { cmdInit, cmdNext, cmdStatus, cmdValidate, type CmdResult } from "./core/commands.ts";

const USAGE = `uso: revup [--project <dir>] <comando>

  init                     cria revup.config.json e revup.manifest.json de exemplo
  status [domain/module/program]
  next <domain/module/program>      executa/valida a etapa corrente e avança
  validate <domain/module/program>  valida a etapa corrente sem avançar`;

export async function run(argv: string[]): Promise<CmdResult> {
  let project = process.cwd();
  const args = [...argv];
  const pi = args.indexOf("--project");
  if (pi >= 0) {
    project = args[pi + 1] ?? "";
    if (!project) throw new RevupError("--project exige um diretório");
    args.splice(pi, 2);
  }
  const [cmd, arg] = args;
  switch (cmd) {
    case "init":
      return cmdInit(project);
    case "status":
      return cmdStatus(project, arg);
    case "next":
      if (!arg) throw new RevupError("next exige <domain/module/program>");
      return cmdNext(project, arg);
    case "validate":
      if (!arg) throw new RevupError("validate exige <domain/module/program>");
      return cmdValidate(project, arg);
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
      console.error(`erro: ${e.message}`);
      process.exit(2);
    }
    throw e;
  }
}
