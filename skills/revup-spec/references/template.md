# Template — 03-spec

```markdown
# Spec — <domain/module/program>

## Goal
Registers the items of an order and redirects to the list.

## Inputs
- GET `id`: identifies the order [F-aaaaaaaa]
- POST `qtd`: item quantity [F-bbbbbbbb]

## Database effects
- SELECT orders/customers by id [F-cccccccc]
- INSERT into items (order, qty) [F-dddddddd]

## Session effects
- Writes `ultimo_pedido` [F-eeeeeeee]
- Reads `user` [F-ffffffff]

## Rules
- The item is inserted without validating the quantity [F-dddddddd, F-bbbbbbbb]

## Outputs/Redirects
- Redirects to `lista.php?ok={id}` [F-99999999]

## Open items
- Q-01: dynamic module include
```
