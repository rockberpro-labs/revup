import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Project } from "../config.ts";
import {
  blockedMessage,
  completionMessage,
  missingPrerequisites,
  nextStep,
  type Current,
  type Step,
} from "../state/machine.ts";
import { initialState, loadState, saveState, staleFiles, type State } from "../state/store.ts";
import type { Target } from "./target.ts";

export interface StepResult {
  ok: boolean;
  errors: string[];
  /** só 04-audit */
  verdict?: "READY" | "BLOCKED";
  /** só 01-scan: hashes dos fontes lidos */
  sourceHashes?: Record<string, string>;
}
export type Handler = (t: Target) => Promise<StepResult> | StepResult;
export type Handlers = Record<Step, Handler>;

export interface Outcome {
  advanced: boolean;
  message: string;
  errors: string[];
  state: State;
}

async function currentState(t: Target): Promise<{ state: State; stale: string[] }> {
  const state = await loadState(t.dir);
  const stale = state.completed.length ? await staleFiles(t.project.sourceRoot, state.sourceHashes) : [];
  return { state, stale };
}

function prerequisiteErrors(t: Target, step: Current): string[] {
  return missingPrerequisites(step, (f) => existsSync(join(t.dir, f)));
}

/** Roda a etapa corrente; só avança se ela passar. */
export async function advance(t: Target, handlers: Handlers): Promise<Outcome> {
  let { state, stale } = await currentState(t);
  let prefix = "";
  if (stale.length) {
    prefix = `fonte alterado (${stale.join(", ")}): reiniciando a partir de 01-scan\n`;
    state = initialState();
  }
  if (state.step === "DONE") {
    return { advanced: false, message: "[DONE] nada a fazer", errors: [], state };
  }
  const step = state.step;
  const missing = prerequisiteErrors(t, step);
  if (missing.length) {
    return { advanced: false, message: `${prefix}[${step}] bloqueado`, errors: missing, state };
  }
  const res = await handlers[step](t);
  if (!res.ok) {
    return { advanced: false, message: `${prefix}[${step}] falhou`, errors: res.errors, state };
  }
  if (step === "04-audit" && res.verdict === "BLOCKED") {
    return { advanced: false, message: prefix + blockedMessage(), errors: res.errors, state };
  }
  if (step === "01-scan") state.sourceHashes = res.sourceHashes ?? {};
  if (!state.completed.includes(step)) state.completed.push(step);
  state.step = nextStep(step);
  await saveState(t.dir, state);
  return { advanced: true, message: prefix + completionMessage(step, state.step), errors: [], state };
}

/** Valida a etapa corrente sem avançar nem gravar estado. */
/** `validators` sobrescrevem handlers só na checagem (sem efeitos colaterais, ex.: sem reescanear). */
export async function check(t: Target, handlers: Handlers, validators: Partial<Handlers> = {}): Promise<Outcome> {
  const { state, stale } = await currentState(t);
  if (state.step === "DONE") return { advanced: false, message: "[DONE]", errors: [], state };
  const errors = [
    ...stale.map((f) => `fonte alterado: ${f}`),
    ...prerequisiteErrors(t, state.step),
  ];
  if (!errors.length) errors.push(...(await (validators[state.step] ?? handlers[state.step])(t)).errors);
  return {
    advanced: false,
    message: errors.length ? `[${state.step}] inválido` : `[${state.step}] ok`,
    errors,
    state,
  };
}

export interface StatusRow {
  id: string;
  step: Current;
  stale: string[];
}

export async function statusRows(project: Project, resolve: (id: string) => Target): Promise<StatusRow[]> {
  const rows: StatusRow[] = [];
  for (const p of project.manifest.programs) {
    const { state, stale } = await currentState(resolve(p.id));
    rows.push({ id: p.id, step: state.step, stale });
  }
  return rows;
}
