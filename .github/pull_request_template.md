## Bot review flow

This repo uses a protocol-enforcing bot reviewer. After review:

- Reply to every open thread with `FIX: <commit-sha>` or `JUSTIFY: <rationale>`
- Push your fix commits
- Apply the `bot:ready-for-review` label to fire the next review cycle
- Don't push without applying the label — pushes alone do not trigger a re-review
- If a Cycle 3 mandate is genuinely impossible: `CANNOT-COMPLY: <issue-id> <reason>` (escalates to a human)

See [AGENTS.md](../AGENTS.md) for the full author-agent contract.

---

## Summary

<!-- What does this PR do? -->

## Test plan

<!-- How was this tested? -->
