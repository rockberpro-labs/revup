---
name: revup-extract
description: revup step 02-extract. Reads facts.json and the PHP code, then writes observations.md and open-questions.md with observed rules and only real ambiguities.
---

# revup · 02-extract

1. Call the `revup_prompt` tool (`projectDir`, `step` = `02-extract`, `target`) to get the absolute paths.
2. Read `facts.json` and the source files it lists (`files` field).
3. Write `observations.md` and `open-questions.md` exactly in the format of `references/template.md`.

## Rules

- Each bullet is at most 240 characters and cites at least one `[F-xxxxxxxx]` that exists in `facts.json`.
- Describe what the code **does** (conditions, validations, calculations, effects), not what it should do.
- Every ID listed in `unresolved` in `facts.json` must appear as the `Evidence` of a `Q-xx` question.
- Record only real ambiguity: a value interpolated into SQL (`WHERE id=$id`) is not ambiguity; a dynamic include, a dynamic table name, and a parse error are.
- No prose outside bullets. Empty section: `- None.`

## Finish

Call `revup_next` (`projectDir`, `target`). If it lists errors, fix them and run it again. Report the result.
