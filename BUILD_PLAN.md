# revup — plano de implementação (Fases 1–3)

## Contexto
Ferramenta para escavar código PHP legado (ERP) e gerar specs organizadas (`domain > module > program`) que servem de ponto de partida para a reescrita. Princípio central: **motor determinístico** (CLI Bun/TS: leitura, extração de fatos, estado, validação) separado da **camada do agente** (prompts curtos e rígidos para as etapas interpretativas). Repo vazio; Bun disponível; **não há binário `php`** → parser precisa ser JS puro. Fixtures sintéticas por ora; empacotado como Agent Plugin (agnóstico de harness). **Foco em PHP**, mas só o scanner é específico de linguagem — o resto (estado, manifest, templates, validação, audit, MCP, skills) opera sobre `facts.json` neutro. Fase 4 (calibração em programa real) fica para depois, com o ERP do usuário.

## Decisões fixas
- Bun + TypeScript, `bun test`, Zod; dependências mínimas (`php-parser` da glayzzle, `zod`). Sem framework de CLI (parse de argv manual).
- Comando `revup` (`bin` no package.json). Mensagens da CLI em pt-BR.
- A ferramenta roda **contra um repo legado externo**, configurado por `revup.config.json`:
  ```json
  { "language": "php", "sourceRoot": "../erp", "outDir": "./revup-out", "includePaths": ["inc", "lib"], "encoding": "auto" }
  ```
- **Seam de linguagem**: interface `Scanner { language; scan(entry, config): ScanResult }` em `src/scan/scanner.ts`; registro simples `{ php: phpScanner }` escolhido por `config.language`. A máquina de estados só fala com a interface. Sem registry de plugins/descoberta/camada AST genérica (YAGNI até existir uma 2ª linguagem).
- `revup.manifest.json`: `{ "programs": [{ "id": "vendas/pedidos/cadastro", "entry": "pedidos/cad_ped.php" }] }`.
- Saída por alvo: `<outDir>/<domain>/<module>/<program>/{state.json, facts.json, observations.md, open-questions.md, spec.md, audit.md}`.

## Empacotamento — Agent Plugins (agent-plugins.org, spec 1.0.0)
O repo **é** o plugin: `plugin.json` na raiz. A spec v1 só cobre **skills** (`skills/<nome>/SKILL.md`) e **servidores MCP** (`mcp.json`); comandos/agents/hooks não são portáveis → não usamos (nada de `.claude/commands`).
- `plugin.json`:
  ```json
  { "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    "name": "revup", "version": "0.1.0",
    "description": "Escava código PHP legado e gera specs organizadas para reescrita.",
    "license": "MIT", "keywords": ["legacy","php","spec","reverse-engineering"] }
  ```
- `mcp.json` — o motor determinístico exposto como servidor MCP stdio (interface principal do agente, funciona em qualquer cliente compatível):
  ```json
  { "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    "mcpServers": { "revup": { "type": "stdio", "command": "bun",
      "args": ["${PLUGIN_ROOT}/src/mcp.ts"] } } }
  ```
  Tools: `revup_status`, `revup_next`, `revup_prompt`, `revup_validate` — mesmas funções da CLI (um core, dois adaptadores: `src/cli.ts` para humanos, `src/mcp.ts` via `@modelcontextprotocol/sdk`). O projeto alvo é passado como argumento (`projectDir`, onde fica `revup.config.json`), pois o cwd do servidor é a raiz do plugin.
- Skills (instruções curtas, agnósticas):
  - `skills/revup/SKILL.md` — orquestrador: chama `revup_status`, depois `revup_prompt` da etapa atual e segue; termina sempre com `revup_next`.
  - `skills/revup-extract/`, `skills/revup-spec/`, `skills/revup-audit/` — cada uma com `SKILL.md` + `references/template.md` (os templates rígidos). `revup_prompt` lê esses mesmos arquivos, então há uma única fonte.
- Depende de `bun` no PATH (documentado no README). Binário compilado (`bun build --compile` → `./bin/revup`) fica como evolução futura.
- Teste de conformidade: validar `plugin.json` e `mcp.json` contra os JSON Schemas oficiais (cópia local em `test/schemas/`, sem fetch em runtime) + checar frontmatter `name`/`description` de cada SKILL.md.

## Estrutura
```
plugin.json  mcp.json
skills/revup/SKILL.md
skills/revup-{extract,spec,audit}/{SKILL.md, references/template.md}
src/
  core/                  # funções puras usadas por cli.ts e mcp.ts
  mcp.ts                 # servidor MCP stdio
  cli.ts                 # entrypoint: status | next | scan | prompt | validate | audit | init
  config.ts              # carrega/valida config + manifest (Zod)
  state/machine.ts       # etapas, pré-condições, transições, mensagem de próximo passo
  state/store.ts         # leitura/escrita de state.json (hash do fonte, etapa, stale)
  scan/scanner.ts        # interface Scanner + registro por linguagem
  scan/facts.ts          # schema Zod de facts.json (kinds neutros) + IDs estáveis
  scan/reader.ts         # leitura com detecção UTF-8 vs latin1/cp1252, preservando linhas
  scan/sql.ts            # análise de SQL (operação, tabelas) — neutra, reaproveitável
  scan/php/index.ts      # phpScanner
  scan/php/includes.ts   # resolução recursiva de include/require com detecção de ciclo
  scan/php/extract-ast.ts    # extração via php-parser
  scan/php/extract-regex.ts  # fallback heurístico quando o parse falha
  artifacts/markdown.ts  # parse de headings fixos → objeto
  artifacts/schemas.ts   # Zod para observations/open-questions/spec/audit
  artifacts/citations.ts # extrai [F-xxxx] e valida contra facts.json
  audit/coverage.ts      # cobertura determinística fatos × spec, READY/BLOCKED
test/fixtures/php/...    # fixtures sintéticas
test/schemas/            # plugin.schema.json, mcp.schema.json (cópias locais)
BUILD_PLAN.md            # contrato de fases (do texto original), para referência
```

## Fase 1 — Esqueleto + máquina de estados
- Etapas: `01-scan → 02-extract → 03-spec → 04-audit → DONE`.
- `state.json`: `{ step, completed: [...], sourceHashes: {arquivo: sha256}, updatedAt }`. Se algum hash muda, `status` marca **STALE** e força refazer a partir de `01-scan`.
- Pré-condições: cada etapa exige o artefato da anterior **válido** (passa no validador). `next` só avança quando o artefato da etapa corrente valida.
- Comandos:
  - `revup init` — cria config/manifest de exemplo.
  - `revup status [alvo]` — tabela de alvos com etapa/STALE.
  - `revup next <d/m/p>` — executa a etapa determinística se houver (scan, coverage) ou valida o artefato produzido pelo agente e avança; sempre imprime `[01-scan concluído] -> Próximo passo: 02-extract` (ou `DONE`/`BLOCKED`).
  - `revup prompt <etapa> <d/m/p>` — imprime a instrução da etapa com caminhos absolutos dos arquivos a ler/escrever + template.
  - `revup validate <d/m/p>` — valida artefatos existentes e lista erros.
- Testes: transições válidas/ inválidas (recusa 03 sem facts.json válido), mensagem de próximo passo, detecção de STALE, parse de alvo inválido.

## Fase 2 — Extrator estático (`01-scan`)
- **Smoke test primeiro**: confirmar que `php-parser` roda em Bun e aceita HTML inline, sintaxe PHP 5, short tags (`<?`, `<?=`). Configurar `parser: { php7: false/true, suppressErrors: true, extractDoc: true }`, `ast: { withPositions: true }`.
- Leitura: tenta decodificar como UTF-8 (fatal); se falhar, `latin1`/`windows-1252` via `TextDecoder`. Linhas preservadas.
- `facts.json` tem `language: "php"` no topo. Fatos usam **kinds neutros** com detalhe da linguagem em `source` (ex.: `{kind:"input", source:"$_POST", key:"id", mode:"read"}`). Cada fato: `id, kind, source?, file, line, snippet, confidence: "ast"|"heuristic", resolved: bool`.
- Fatos extraídos:
  - `include`: alvo resolvido (relativo ao arquivo, depois `includePaths`, depois `sourceRoot`), recursivo com detecção de ciclo; dinâmicos (`include $mod . ".php"`) → `resolved:false`.
  - `sql`: strings/concatenações/encapsed contendo `SELECT|INSERT|UPDATE|DELETE`; extrai operação + tabelas (`FROM/JOIN/INTO/UPDATE`); partes variáveis viram `{var}` e `resolved:false`.
  - `input`: `source` ∈ `$_GET/$_POST/$_REQUEST/$_FILES/$_SERVER/$_COOKIE`, com chave e modo `read|write`.
  - `session`: `$_SESSION` com chave e modo `read|write`.
  - `call`: chamadas de função (nome; dinâmicas marcadas). Funções `mysql_*/mysqli_*/pg_*` registradas.
  - `redirect`: `header("Location: ...")`.
  - `function_def`: funções declaradas nos arquivos varridos.
  - `parse_error`: arquivo que caiu no fallback.
- **IDs estáveis**: `F-` + 8 hex de `sha1(kind|arquivoRelativo|normalizedSnippet|ocorrência)` — sem número de linha no hash, para sobreviver a edições acima. Linha fica como campo.
- Fallback: se o parse de um arquivo falha, usa `php/extract-regex.ts` e marca `confidence:"heuristic"` + fato `parse_error`.
- Teste do seam: config com `language` não registrada → erro claro (`linguagem "x" não suportada; disponíveis: php`).
- `facts.json` inclui `unresolved[]` (atalho para o 02 transformar em perguntas) e `files[]` com hashes.
- Fixtures (test/fixtures/php): SQL concatenado, include condicional e dinâmico, ciclo de include, `$_SESSION` leitura/escrita, HTML misturado + short tags, `header("Location:")`, arquivo latin1 com acentos, arquivo com erro de sintaxe (fallback). Testes comparam fatos esperados (tipo/tabela/chave/linha) e estabilidade de IDs entre re-scans.

## Fase 3 — Templates, validadores e prompts (02–04)
- Markdown validado por **headings fixos**: `markdown.ts` quebra por `## `, Zod valida seções obrigatórias e itens; `citations.ts` exige que cada item cite ≥1 `[F-xxxxxxxx]` existente em facts.json.
- Artefatos:
  - `observations.md` (02): `## Regras observadas`, `## Fluxo`, cada bullet com citação.
  - `open-questions.md` (02): `## Q-01 ...` com `Evidência: [F-..]`, `Ambiguidade:`, sem perguntas sem evidência.
  - `spec.md` (03): `## Objetivo` (≤3 linhas), `## Entradas`, `## Efeitos no banco`, `## Efeitos em sessão`, `## Regras`, `## Saídas/Redirecionamentos`, `## Pendências` (links Q-xx). Limites de tamanho checados (linhas por seção, total).
  - `audit.md` (04): CLI gera a parte determinística (fatos não citados na spec, perguntas sem proposta) → READY/BLOCKED; o LLM só preenche `Proposta padrão:` para cada Q-xx.
- `skills/revup-*/SKILL.md`: instruções numeradas, curtas: quais arquivos ler, template a preencher, proibição de prosa longa, obrigatoriedade de citar IDs, terminar chamando `revup_next` (ou `revup next <alvo>` na CLI).
- `src/mcp.ts` + `plugin.json` + `mcp.json` + teste de conformidade do pacote.
- Testes: validadores rejeitam seção faltando, citação inexistente, spec acima do limite; aceitam templates preenchidos de exemplo; coverage calcula READY/BLOCKED corretamente.

## Verificação
1. `bun test` verde (extrator, máquina de estados, validadores, coverage).
2. E2E num alvo de fixture (`test/fixtures/erp` + config de exemplo): `revup next x/y/z` → facts.json gerado e mensagem `-> Próximo passo: 02-extract`; colocar observations/open-questions de exemplo → `revup next` avança; spec de exemplo → 04; `revup next` imprime `READY` ou `BLOCKED` com lista exata.
3. Subir o servidor MCP (`bun src/mcp.ts`) e listar/chamar `revup_status` via cliente MCP de teste (SDK) no `bun test`; plugin.json/mcp.json validam contra os schemas oficiais.
4. Alterar um arquivo-fonte da fixture → `revup status` mostra STALE.

## Git
- Repo já inicializado, `main` sem commits. Criar branch `feat/revup-v0` (`git checkout -b feat/revup-v0`) antes de qualquer arquivo.
- Uma fase por vez; `bun test` verde antes de cada commit. Commits (Conventional Commits, rodapé `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`):
  1. `chore: scaffold bun/ts project, plugin manifest and BUILD_PLAN` — package.json, tsconfig, .gitignore, plugin.json, BUILD_PLAN.md, README.
  2. `feat(state): config, manifest and step state machine` — Fase 1 + testes.
  3. `feat(scan): php static extractor for 01-scan` — Fase 2 + fixtures + testes.
  4. `feat(artifacts): rigid templates, markdown validators and coverage audit` — Fase 3 (validação/audit).
  5. `feat(plugin): mcp server and skills for steps 02-04` — mcp.ts, mcp.json, skills, teste de conformidade.
- Sem push nem PR (só se pedido).
