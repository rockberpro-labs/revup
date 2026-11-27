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
  /** 04-audit only */
  verdict?: "READY" | "BLOCKED";
  /** 01-scan only: hashes of the source files read */
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

export async function currentState(t: Target): Promise<{ state: State; stale: string[] }> {
  const state = await loadState(t.dir);
  const stale = state.completed.length ? await staleFiles(t.project.sourceRoot, state.sourceHashes) : [];
  return { state, stale };
}

function prerequisiteErrors(t: Target, step: Current): string[] {
  return missingPrerequisites(step, (f) => existsSync(join(t.dir, f)));
}

/** Runs the current step; only advances if it passes. */
export async function advance(t: Target, handlers: Handlers): Promise<Outcome> {
  let { state, stale } = await currentState(t);
  let prefix = "";
  if (stale.length) {
    prefix = `source changed (${stale.join(", ")}): restarting from 01-scan\n`;
    state = initialState();
  }
  if (state.step === "DONE") {
    return { advanced: false, message: "[DONE] nothing to do", errors: [], state };
  }
  const step = state.step;
  const missing = prerequisiteErrors(t, step);
  if (missing.length) {
    return { advanced: false, message: `${prefix}[${step}] blocked`, errors: missing, state };
  }
  const res = await handlers[step](t);
  if (!res.ok) {
    return { advanced: false, message: `${prefix}[${step}] failed`, errors: res.errors, state };
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

/** Validates the current step without advancing or writing state. `validators` override handlers only for the check (no side effects, e.g. no rescan). */
export async function check(t: Target, handlers: Handlers, validators: Partial<Handlers> = {}): Promise<Outcome> {
  const { state, stale } = await currentState(t);
  if (state.step === "DONE") return { advanced: false, message: "[DONE]", errors: [], state };
  const errors = [
    ...stale.map((f) => `source changed: ${f}`),
    ...prerequisiteErrors(t, state.step),
  ];
  if (!errors.length) errors.push(...(await (validators[state.step] ?? handlers[state.step])(t)).errors);
  return {
    advanced: false,
    message: errors.length ? `[${state.step}] invalid` : `[${state.step}] ok`,
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

/**
 * Module-level `next`: runs the automatic step (01-scan, or a rescan when STALE) for each target.
 * Targets waiting on an agent-written step are listed, not advanced.
 */
export async function advanceScans(targets: Target[], handlers: Handlers): Promise<{ ok: boolean; text: string }> {
  const lines: string[] = [];
  let ok = true;
  for (const t of targets) {
    const { state, stale } = await currentState(t);
    if (state.step === "01-scan" || stale.length) {
      const o = await advance(t, handlers);
      if (!o.advanced) ok = false;
      lines.push(`${t.id.padEnd(40)} ${o.message.replaceAll("\n", " ")}`, ...o.errors.map((e) => `  - ${e}`));
    } else if (state.step === "DONE") {
      lines.push(`${t.id.padEnd(40)} [DONE]`);
    } else {
      lines.push(`${t.id.padEnd(40)} [${state.step}] agent step: run \`next ${t.id}\` after writing its artifacts`);
    }
  }
  return { ok, text: lines.join("\n") };
}
