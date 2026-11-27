# Template — 04-audit (audit.md)

A CLI gera o arquivo; você só preenche as linhas `Proposta padrão`.

```markdown
# Auditoria — <domain/module/program>

## Cobertura
- Fatos exigidos: 12
- Cobertos: 12
- Não cobertos: 0

## Perguntas
### Q-01 Include dinâmico de módulo
- Evidência: [F-eeeeeeee]
- Ambiguidade: `$modulo` define qual arquivo é incluído.
- Proposta padrão: Tratar como lista fixa {a, b}; confirmar com o dono do módulo.

## Status
READY
```
