---
name: revup-audit
description: revup step 04-audit. The CLI computes fact coverage and generates audit.md; the agent only writes a default proposal for each open question.
---

# revup · 04-audit

Coverage and the verdict (`READY`/`BLOCKED`) are computed by the CLI, not by you.

1. Call `revup_next` (`projectDir`, `target`). It generates `audit.md` and prints `READY` or `BLOCKED` with the exact list of what is missing.
2. For each `Q-xx` without a proposal, edit `audit.md` and replace `<PENDING>` with **one** objective default proposal (one line, the most likely option given the code), in the format of `references/template.md`. The user only has to approve or adjust it.
3. For each "not covered" fact, go back to `spec.md`, cite the ID in the right bullet, and run again.
4. Call `revup_next` until you get `[04-audit done] -> Status: READY`.

## Rules

- Do not change `Coverage`, `Status`, or the `Evidence`/`Ambiguity` lines; the CLI regenerates them.
- Proposals are at most 240 characters and never ask back: always propose a default.
