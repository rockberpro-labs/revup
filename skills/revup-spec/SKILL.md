---
name: revup-spec
description: revup step 03-spec. Writes spec.md from facts.json, observations.md and open-questions.md, using a rigid template where every rule cites evidence.
---

# revup · 03-spec

1. Call the `revup_prompt` tool (`projectDir`, `step` = `03-spec`, `target`) to get the absolute paths.
2. Read `facts.json`, `observations.md` and `open-questions.md`.
3. Write `spec.md` exactly in the format of `references/template.md`.

## Rules

- Use only the 7 template sections, in the given order. Empty section: `- None.`
- Each bullet is at most 240 characters and cites an existing `[F-xxxxxxxx]`. The whole file is at most 200 lines.
- `Goal`: 1 to 3 lines, no citation.
- Cover **every** fact of kind `sql`, `input`, `session` and `redirect`: each ID must be cited in some bullet (several IDs per bullet are accepted).
- `Open items` lists each question as `Q-xx` (only ones that exist in `open-questions.md`).
- No opinions and no new-architecture suggestions: specify the observed behavior.

## Finish

Call `revup_next` (`projectDir`, `target`). If it lists errors, fix them and run it again. Report the result.
