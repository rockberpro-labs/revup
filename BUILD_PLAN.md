# revup — build plan and design contract

Goal: dig facts out of legacy PHP code and produce organized specs (`domain/module/program`) that kick-start a rewrite.
Principle: a **deterministic engine** (Bun/TS: reading, fact extraction, state, validation) kept separate from a thin **agent layer** (short, rigid instructions for the interpretive steps).

## State machine (per program)

`01-scan` → `02-extract` → `03-spec` → `04-audit` → `DONE`

| Step | Who | Artifact | Gate to advance |
|---|---|---|---|
| `01-scan` | CLI | `facts.json` | scan succeeds, `facts.json` validates |
| `02-extract` | agent | `observations.md`, `open-questions.md` | headings, citations and every `unresolved` fact has a question |
| `03-spec` | agent | `spec.md` | headings, citations, size limits, `Q-xx` references exist |
| `04-audit` | CLI (+ agent proposals) | `audit.md` | every required fact cited, every question has a default proposal → `READY` |

`next` only advances when the current step's artifact validates, and always prints
`[01-scan done] -> Next step: 02-extract` (or `DONE` / `BLOCKED` with the exact list of what is missing).
`state.json` stores source hashes; if the PHP changes, the target is `STALE` and restarts from `01-scan`.

## Facts

- Neutral kinds: `include`, `sql`, `input`, `session`, `call`, `redirect`, `function_def`, `parse_error`; language detail lives in `source`/`name`.
- Stable IDs: `F-` + 8 hex of `sha1(kind|file|snippet|occurrence)` (no line number), so citations survive edits above.
- `resolved` = no dynamic parts; `unresolved` (in `facts.json`) = facts that need a question (dynamic include, dynamic table or key, parse error).
- Parser: `php-parser` (pure JS). On a parse error the file falls back to regex and its facts are marked `heuristic`.

## Rigid artifacts

Fixed `##` headings, bullets of at most 240 characters, each citing existing `[F-xxxxxxxx]` IDs, and `- None.` for empty sections.
Templates live next to the skills: `skills/revup-*/references/template.md`; `revup prompt` serves the same files (single source).

## Packaging

The repo is an Agent Plugin (agent-plugins.org 1.0.0): `plugin.json`, `mcp.json` (stdio server `bun ${PLUGIN_ROOT}/src/mcp.ts`)
and `skills/`. The CLI and the MCP server share `src/core/commands.ts`. Runs locally on the developer's machine (`bun install`).

## Phases

1. State machine + CLI skeleton (config, manifest, `status`/`next`/`validate`).
2. PHP static extractor (`01-scan`) with synthetic fixtures.
3. Rigid templates, validators, coverage audit, skills and prompts.
4. **Calibration on one real program** (pending): run all four steps on a single simple ERP program, tune extractor noise, then scale to the first module.

## Known limits (to revisit in phase 4)

- Include resolution order (includer dir → `includePaths` → `sourceRoot`) differs from PHP's CWD/`include_path` rules.
- The parser targets the latest PHP grammar; PHP 5 code using later-reserved words as identifiers falls back to regex.
- Fixtures are synthetic; nothing was tried against a real ERP yet or in a real Agent Plugins client.
