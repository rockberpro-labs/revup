# AGENTS.md

Guidance for AI coding agents working on revup. Keep this file short and current.

## What this is

revup digs facts out of legacy PHP code and guides agents to write organized specs
(`domain/module/program`) that kick-start a rewrite. A deterministic Bun/TS engine does the
reading, state and validation; skills and an MCP server are the thin agent layer. It is
packaged as an Agent Plugin (agent-plugins.org 1.0.0) and runs locally on the developer's machine.
Design contract: `BUILD_PLAN.md`. User-facing docs: `README.md`.

## Commands

- `bun install` · `bun test` · `bun run typecheck` (both must be green before any commit)
- CLI: `bun src/cli.ts --project <dir> status|next|prompt|validate|init|discover`
- MCP server: `bun src/mcp.ts` (stdio)
- There is no `php` binary on the dev machine: never shell out to PHP; parsing is `php-parser` (pure JS).

## Layout

- `src/core/commands.ts`: the single command layer; `cli.ts` and `mcp.ts` are thin adapters over it.
- `src/state/`: pure state machine (`machine.ts`) and `state.json` IO + stale detection (`store.ts`).
- `src/core/discover.ts`: proposes manifest entries (files nobody includes) for a directory; read-only, `cmdDiscover` writes only with `--write`.
- `src/core/next.ts`: `advance` (run + advance), `advanceScans` (module-level `next`: only 01-scan) and `check` (validate only, no side effects). `handlers.ts` is the step registry.
- `src/scan/`: `scanner.ts` (language registry), `facts.ts` (schema, stable IDs, `needsReview`), `sql.ts` (language-neutral). `php/` is the only language-specific code.
- `src/artifacts/`, `src/audit/`: markdown parsing, Zod schemas, validators, coverage and `audit.md` generation.
- `skills/*/SKILL.md` + `references/template.md`: instructions and templates. `revup prompt` serves these same files (single source).
- `test/fixtures/erp/`: synthetic legacy PHP. Names there are intentionally Portuguese (they mimic the ERP).

## Conventions and gotchas

- **Language:** everything in the tool is en-US (messages, errors, comments, skills, templates, docs). Only fixture data stays Portuguese.
- **Artifact headings are a validated format.** Renaming a heading means updating `schemas.ts`, `validate.ts`, `coverage.ts`, the skill templates, the skill text and the tests together.
- **Tests assert on exact message strings.** Changing a message means updating the tests.
- **`resolved` ≠ `unresolved`.** `resolved:false` only means "has a dynamic part" (e.g. `WHERE id=$id`). `facts.json.unresolved` lists facts that need a real question (`needsReview`: dynamic include, dynamic table or key, parse error).
- **Fact IDs must stay stable:** `sha1(kind|file|snippet|occurrence)`, never the line number. Do not add line numbers or other volatile data to the hash.
- **`facts.json` must be deterministic** (no timestamps) so re-scans diff cleanly.
- **`validate` must have no side effects.** Validators passed to `check` must not rescan or write.
- `test/fixtures/erp/legacy/latin1.php` is real ISO-8859-1. Do not rewrite it with tools that re-encode to UTF-8.
- Coverage requires `sql`, `input`, `session`, `redirect` facts plus `needsReview` gaps; `call`, `function_def` and resolved `include` are context only.
- A new language = a new `Scanner` registered in `scanner.ts`. No plugin registry until a second language really exists.
- Do not hand-edit `facts.json`, `state.json` or `audit.md` Coverage/Status in generated output.

## Git and commits

- Conventional Commits (`feat(scope):`, `fix:`, `refactor:`, `docs:`, `chore:`), subject in English, imperative mood.
- One logical change per commit, with `bun test` and `bun run typecheck` green first.
- Work on a branch, not `main`. Do not push, open PRs, or rewrite history unless asked.

## Known limits (phase 4 will calibrate)

- Include resolution order (includer dir → `includePaths` → `sourceRoot`) differs from PHP's CWD/`include_path` rules.
- The parser targets the latest PHP grammar; PHP 5 code using later-reserved words as identifiers falls back to regex (facts marked `heuristic`).
- Nothing has run against a real ERP program or a real Agent Plugins client yet.
