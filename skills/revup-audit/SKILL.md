---
name: revup-audit
description: Etapa 04-audit do revup. A CLI calcula a cobertura de fatos e gera audit.md; o agente só escreve uma proposta padrão para cada pergunta em aberto.
---

# revup · 04-audit

A cobertura e o veredito (`READY`/`BLOCKED`) são calculados pela CLI, não por você.

1. Rode `revup_next <alvo>`. Ele gera `audit.md` e imprime `READY` ou `BLOCKED` com a lista exata do que falta.
2. Para cada `Q-xx` sem proposta, edite `audit.md` e troque `<PENDENTE>` por **uma** proposta padrão objetiva (uma linha, a opção mais provável dado o código), no formato de `references/template.md`. O usuário só precisa aprovar ou ajustar.
3. Para cada "fato não coberto", volte ao `spec.md`, cite o ID no bullet correto e rode de novo.
4. Rode `revup_next <alvo>` até `[04-audit concluído] -> Status: READY`.

## Regras

- Não altere `Cobertura`, `Status` nem as linhas `Evidência`/`Ambiguidade`; a CLI as regera.
- Propostas ≤ 240 caracteres, sem perguntar de volta: sempre proponha um padrão.
