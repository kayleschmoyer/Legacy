# Entrypoint 13: Revert

**Trigger**: a merged change must be rolled back. Either it broke production, has unintended consequences, or a stakeholder pulled the request after merge.

**Default risk tier**: Critical (any revert affecting production); Medium (reverting an unmerged or non-production change).

**Required artifacts**: [postmortem](../artifacts/postmortem.md) (if production was affected), [test plan](../artifacts/test-plan.md) confirming the revert restores prior behavior.

## Path notes

A revert is the opposite of a normal change: you are _removing_ code that was previously verified. The risks are different and often subtler.

### Phase 1: Frame

- State the reason for revert clearly. "It broke X." Specifically.
- Identify whether this is:
  - **Code revert** (`git revert <sha>`) — reverses the diff cleanly.
  - **Behavior revert** (a new commit that restores prior behavior, but doesn't undo the diff) — used when the original change is partially good or has been built upon.
- For production-affecting reverts: also Frame the **incident** (see [01-incident-hotfix](01-incident-hotfix.md) for the parallel protocol).

### Phase 2: Design

- For code revert: minimal. The diff is already known.
- For behavior revert: design the smallest restoration. Don't try to "improve" while reverting — that's a future ticket.
- **Side-effect audit**: did the original change include schema migrations, data backfills, or external API calls? Reverting code does NOT revert schema or data. Plan separately.
  - If schema changed: forward-fix or new migration to undo.
  - If data was migrated: a separate data-restore plan.
  - If external state changed: usually unrecoverable; document.

### Phase 3: Implement

- `git revert <sha>` for code revert. If the revert has conflicts (subsequent work depended on the change), pause and reassess — a behavior revert may be safer.
- For partial reverts: hand-craft the smallest commit that restores prior behavior. Reference the original SHA in the commit message.

### Phase 4: Verify

- Local test: confirm the bug or unwanted behavior is gone after the revert.
- Run the regression test that the original change introduced — it should now fail (you are removing the feature it tested). Decide: delete the test, or mark it skipped pending re-implementation.
- Confirm no data corruption from the partial application of the original change.

### Phase 5: Document

- For production-affecting reverts: write the [postmortem](../artifacts/postmortem.md). Treat this as an incident.
- Update any docs that referenced the now-reverted feature.
- File a follow-up ticket if the revert is intended to be temporary (re-do later with fixes).

### Phase 6: Handoff

- Reverts merge with the same urgency as hotfixes — fast review, immediate merge.
- Notify any stakeholders who were tracking the original change.
- Confirm production restoration before closing the ticket.

## Anti-patterns

- ❌ Revert + new feature in one PR. Always separate.
- ❌ Reverting code without considering schema / data side-effects.
- ❌ Skipping the postmortem on a production-affecting revert because "we already know what went wrong." The point is the systemic learning, not the immediate cause.
- ❌ Deleting the failing regression test silently when reverting. Mark it skipped with a ticket reference, or delete with a commit message explaining why.
- ❌ "Revert and improve" in the same commit. Two commits at minimum.

## Related skills

- [postmortem artifact](../artifacts/postmortem.md)
- [01-incident-hotfix](01-incident-hotfix.md) — for production-affecting reverts
- [repo-tooling SKILL.md](../../repo-tooling/SKILL.md) — for schema-affecting reverts
