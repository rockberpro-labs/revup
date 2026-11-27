# Template — 02-extract

## observations.md

```markdown
# Observations — <domain/module/program>

## Observed rules
- Only accepts an existing order; otherwise redirects to the list [F-aaaaaaaa]
- Quantity comes from POST and is stored in items without validation [F-bbbbbbbb, F-cccccccc]

## Flow
- 1. Reads id from GET and queries orders/customers [F-aaaaaaaa]
- 2. Inserts the item and stores the last order in the session [F-bbbbbbbb, F-dddddddd]
```

## open-questions.md

```markdown
# Open questions — <domain/module/program>

## Q-01 Dynamic module include
- Evidence: [F-eeeeeeee]
- Ambiguity: `$modulo` selects which file is included; possible values are unknown.
```

No questions: keep only the title and write `None.` below it (only if `unresolved` is empty).
