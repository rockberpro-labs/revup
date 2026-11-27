---
name: revup
description: Orchestrates revup, which turns legacy PHP code into organized specs (domain/module/program). Use when the user asks to dig into, map, or write a spec for a legacy program, or mentions revup.
---

# revup — orchestrator

Each program (`domain/module/program`) goes through 4 steps, always in this order:
`01-scan` → `02-extract` → `03-spec` → `04-audit` → `DONE`.

Tools: MCP tools `revup_status`, `revup_next`, `revup_prompt`, `revup_validate`
(all take `projectDir`, the folder containing `revup.config.json`, plus `target` where applicable).
Without MCP, the CLI is equivalent (`revup --project <dir> status|next|prompt|validate`), but it is only on the PATH if the plugin repo was linked with `bun link`.

## Steps

1. Call `revup_status` and find the target's current step. `STALE` means the PHP changed since the scan; call `revup_next` to rescan.
2. If the current step is `01-scan`, call `revup_next` (no LLM involved).
3. For `02-extract`, `03-spec` and `04-audit`, call `revup_prompt` (`projectDir`, `step`, `target`) and follow the instructions it returns. They contain the absolute paths and the template.
4. **Always** finish with `revup_next`. If it lists errors, fix exactly what it lists and run it again. Never advance manually.
5. Repeat the CLI's final line to the user, for example `[02-extract done] -> Next step: 03-spec`.

## Rules

- No long prose: follow the template, keep bullets short, and always cite `[F-xxxxxxxx]` IDs from `facts.json`.
- Never invent facts and never edit `facts.json` or `state.json`.
- One target at a time. Do not write new code; the goal is to specify the observed behavior.
