# revup

Extracts facts from legacy PHP code and guides agents to write organized specs
(`domain/module/program`) that kick-start a rewrite.

A deterministic engine (Bun/TS) plus short skills and an MCP server, packaged as an
[Agent Plugin](https://agent-plugins.org/) (spec 1.0.0), so it works in any compatible client.
Requires `bun` on the PATH. Build plan: `BUILD_PLAN.md`.

## Local install (developer machine)

```sh
git clone <repo> && cd revup
bun install        # local dependencies; no build or bundle step
bun link           # optional: puts `revup` on the PATH (CLI)
```

For the agent, point the client at this folder as a plugin (`plugin.json` + `mcp.json`);
the MCP server starts with `bun ${PLUGIN_ROOT}/src/mcp.ts`. Everything runs locally: the scan
reads the legacy code straight from disk and nothing is sent out (only the agent you use reads the artifacts).

## Flow per program

| Step | Who | Artifact |
|---|---|---|
| `01-scan` | CLI (no LLM) | `facts.json` |
| `02-extract` | agent | `observations.md`, `open-questions.md` |
| `03-spec` | agent | `spec.md` |
| `04-audit` | CLI + agent (proposals only) | `audit.md` → `READY` / `BLOCKED` |

Output goes to `<outDir>/<domain>/<module>/<program>/`. Every `next` prints
`[01-scan done] -> Next step: 02-extract` (or the exact errors).

## Usage

```sh
revup --project <dir> init                   # creates revup.config.json and revup.manifest.json
revup --project <dir> status [d/m/p]
revup --project <dir> next d/m/p             # runs/validates the current step and advances
revup --project <dir> prompt 02-extract d/m/p
revup --project <dir> validate d/m/p
```

`revup.config.json`: `{ "language": "php", "sourceRoot": "../erp", "outDir": "./revup-out", "includePaths": ["inc"], "encoding": "auto" }`
`revup.manifest.json`: `{ "programs": [{ "id": "sales/orders/register", "entry": "orders/reg_order.php" }] }`

In the agent: the `revup` skill (orchestrator) plus MCP tools `revup_status|next|prompt|validate`.

## Development

`bun test` · `bun run typecheck`. Only the scanner (`src/scan/php/`) is language-specific.
