---
name: revup
description: Orquestra o revup, que transforma código PHP legado em specs organizadas (domain/module/program). Use quando o usuário pedir para escavar, mapear ou gerar spec de um programa legado, ou citar revup.
---

# revup — orquestrador

Cada programa (`domain/module/program`) passa por 4 etapas, sempre nesta ordem:
`01-scan` → `02-extract` → `03-spec` → `04-audit` → `DONE`.

Ferramentas: tools MCP `revup_status`, `revup_next`, `revup_prompt`, `revup_validate`
(todas recebem `projectDir`, a pasta com `revup.config.json`, e `target` quando se aplica).
Sem MCP, a CLI equivale (`revup --project <dir> status|next|prompt|validate`), mas só existe no PATH se o repo do plugin tiver sido ligado com `bun link`.

## Passos

1. Chame `revup_status` e identifique a etapa corrente do alvo. `STALE` = o PHP mudou desde o scan; rode `revup_next` para reescanear.
2. Se a etapa corrente for `01-scan`, chame `revup_next` (não usa LLM).
3. Nas etapas `02-extract`, `03-spec` e `04-audit`, chame `revup_prompt` (`projectDir`, `step`, `target`) e siga a instrução devolvida. Ela contém os caminhos absolutos e o template.
4. Termine **sempre** com `revup_next`. Se houver erros, corrija exatamente o que foi listado e rode de novo. Não avance manualmente.
5. Repita a linha final da CLI ao usuário, por exemplo `[02-extract concluído] -> Próximo passo: 03-spec`.

## Regras

- Nada de prosa longa: siga o formato do template, bullets curtos, sempre citando IDs `[F-xxxxxxxx]` do `facts.json`.
- Nunca invente fatos nem edite `facts.json` / `state.json`.
- Um alvo por vez. Não gere código novo; o objetivo é especificar o comportamento observado.
