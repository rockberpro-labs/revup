---
name: revup-spec
description: Etapa 03-spec do revup. Escreve spec.md a partir de facts.json, observations.md e open-questions.md, num template rígido onde cada regra cita evidências.
---

# revup · 03-spec

1. Chame `revup_prompt 03-spec <alvo>` para obter os caminhos absolutos.
2. Leia `facts.json`, `observations.md` e `open-questions.md`.
3. Escreva `spec.md` exatamente no formato de `references/template.md`.

## Regras

- Use só as 7 seções do template, na ordem dada. Seção sem conteúdo: `- Nenhum.`
- Cada bullet ≤ 240 caracteres e cita `[F-xxxxxxxx]` existente. O arquivo todo tem no máximo 200 linhas.
- `Objetivo`: 1 a 3 linhas, sem citação.
- Cubra **todos** os fatos de kind `sql`, `input`, `session` e `redirect`: cada ID precisa ser citado em algum bullet (vários IDs por bullet são aceitos).
- `Pendências` lista cada pergunta como `Q-xx` (apenas as que existem em `open-questions.md`).
- Sem opinião nem sugestões de arquitetura nova: especifique o comportamento observado.

## Fim

Rode `revup_next <alvo>`. Se listar erros, corrija e rode de novo. Anuncie o resultado.
