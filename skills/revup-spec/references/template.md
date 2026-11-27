# Template — 03-spec

```markdown
# Spec — <domain/module/program>

## Objetivo
Cadastra itens de um pedido e redireciona para a lista.

## Entradas
- GET `id`: identifica o pedido [F-aaaaaaaa]
- POST `qtd`: quantidade do item [F-bbbbbbbb]

## Efeitos no banco
- SELECT pedidos/clientes por id [F-cccccccc]
- INSERT em itens (pedido, qtd) [F-dddddddd]

## Efeitos em sessão
- Grava `ultimo_pedido` [F-eeeeeeee]
- Lê `user` [F-ffffffff]

## Regras
- Item é inserido sem validar a quantidade [F-dddddddd, F-bbbbbbbb]

## Saídas/Redirecionamentos
- Redireciona para `lista.php?ok={id}` [F-99999999]

## Pendências
- Q-01: include dinâmico de módulo
```
