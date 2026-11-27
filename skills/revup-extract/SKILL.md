---
name: revup-extract
description: Etapa 02-extract do revup. Lê facts.json e o código PHP e escreve observations.md e open-questions.md com regras observadas e apenas ambiguidades reais.
---

# revup · 02-extract

1. Chame `revup_prompt 02-extract <alvo>` para obter os caminhos absolutos.
2. Leia `facts.json` e os arquivos-fonte listados (campo `files`).
3. Escreva `observations.md` e `open-questions.md` exatamente no formato de `references/template.md`.

## Regras

- Cada bullet tem no máximo 240 caracteres e cita ao menos um `[F-xxxxxxxx]` que exista em `facts.json`.
- Descreva o que o código **faz** (condições, validações, cálculos, efeitos), não o que deveria fazer.
- Todo ID listado em `unresolved` no `facts.json` precisa aparecer como `Evidência` de uma pergunta `Q-xx`.
- Só registre ambiguidade real: um valor interpolado em SQL (`WHERE id=$id`) não é ambiguidade; include dinâmico, tabela dinâmica e erro de parse são.
- Sem prosa fora de bullets. Seção sem conteúdo: `- Nenhuma.`

## Fim

Rode `revup_next <alvo>`. Se listar erros, corrija e rode de novo. Anuncie o resultado.
