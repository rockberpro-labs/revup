# Template — 02-extract

## observations.md

```markdown
# Observações — <domain/module/program>

## Regras observadas
- Só aceita pedido existente; senão redireciona para a lista [F-aaaaaaaa]
- Quantidade vem de POST e é gravada em itens sem validação [F-bbbbbbbb, F-cccccccc]

## Fluxo
- 1. Lê id de GET e consulta pedidos/clientes [F-aaaaaaaa]
- 2. Insere item e grava último pedido na sessão [F-bbbbbbbb, F-dddddddd]
```

## open-questions.md

```markdown
# Perguntas em aberto — <domain/module/program>

## Q-01 Include dinâmico de módulo
- Evidência: [F-eeeeeeee]
- Ambiguidade: `$modulo` define qual arquivo é incluído; valores possíveis desconhecidos.
```

Sem perguntas: mantenha só o título e escreva `Nenhuma.` abaixo dele (apenas se `unresolved` estiver vazio).
