# Template — 04-audit (audit.md)

The CLI generates the file; you only fill in the `Default proposal` lines.

```markdown
# Audit — <domain/module/program>

## Coverage
- Required facts: 12
- Covered: 12
- Not covered: 0

## Questions
### Q-01 Dynamic module include
- Evidence: [F-eeeeeeee]
- Ambiguity: `$modulo` selects which file is included.
- Default proposal: Treat as a fixed list {a, b}; confirm with the module owner.

## Status
READY
```
