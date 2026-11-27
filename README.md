# revup

Extrai fatos de código PHP legado e conduz agentes a gerar specs organizadas
(`domain/module/program`) para iniciar a reescrita.

Motor determinístico (Bun/TS) + skills curtas + servidor MCP, empacotado como
[Agent Plugin](https://agent-plugins.org/) (spec 1.0.0): funciona em qualquer cliente compatível.
Requer `bun` no PATH. Plano de construção: `BUILD_PLAN.md`.

## Instalação local (máquina do dev)

```sh
git clone <repo> && cd revup
bun install        # dependências locais; não há build nem bundle
bun link           # opcional: coloca `revup` no PATH (CLI)
```

Para o agente, aponte o cliente para esta pasta como plugin (`plugin.json` + `mcp.json`);
o servidor MCP sobe com `bun ${PLUGIN_ROOT}/src/mcp.ts`. Tudo roda local: o scan lê o
legado direto do disco e nada é enviado para fora (só o agente que você usar lê os artefatos).

## Fluxo por programa

| Etapa | Quem | Artefato |
|---|---|---|
| `01-scan` | CLI (sem LLM) | `facts.json` |
| `02-extract` | agente | `observations.md`, `open-questions.md` |
| `03-spec` | agente | `spec.md` |
| `04-audit` | CLI + agente (só propostas) | `audit.md` → `READY` / `BLOCKED` |

Saída em `<outDir>/<domain>/<module>/<program>/`. Cada `next` imprime
`[01-scan concluído] -> Próximo passo: 02-extract` (ou os erros exatos).

## Uso

```sh
revup --project <dir> init                   # cria revup.config.json e revup.manifest.json
revup --project <dir> status [d/m/p]
revup --project <dir> next d/m/p             # roda/valida a etapa corrente e avança
revup --project <dir> prompt 02-extract d/m/p
revup --project <dir> validate d/m/p
```

`revup.config.json`: `{ "language": "php", "sourceRoot": "../erp", "outDir": "./revup-out", "includePaths": ["inc"], "encoding": "auto" }`
`revup.manifest.json`: `{ "programs": [{ "id": "vendas/pedidos/cadastro", "entry": "pedidos/cad_ped.php" }] }`

No agente: skill `revup` (orquestrador) + tools MCP `revup_status|next|prompt|validate`.

## Desenvolvimento

`bun test` · `bun run typecheck`. Só o scanner (`src/scan/php/`) é específico de linguagem.
