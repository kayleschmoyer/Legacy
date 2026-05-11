# Entrypoint 10: Inherited PR

**Trigger**: any of:

- Picking up someone else's in-flight PR (handoff between agents or human ↔ agent).
- Resuming your own work after a >24h gap or context loss.
- Rebasing on top of a major upstream change that requires re-reading the PR's intent.

**Default risk tier**: Medium (inherits the original ticket's tier; may be raised if the PR is in worse shape than expected).

**Required artifacts**: [continuation plan](../artifacts/continuation-plan.md).

## Path notes

The risk in inheriting work is **silently misunderstanding the original author's intent**. The continuation plan exists to surface that risk before adding new commits.

### Phase 1: Frame (extended — context recovery)

This entrypoint has a deeper Frame phase than others.

1. **Read the PR description** in full. Do not skim.
2. **Read every commit message** in chronological order. Commits tell the story; the diff alone does not.
3. **Read every review thread** — open and resolved. Resolved threads often encode constraints the original author internalized.
4. **Read the linked Jira ticket** in full. Note any acceptance criteria not yet addressed.
5. **Check the latest CI run**. What's green, what's red, what hasn't run.
6. **Reproduce locally**: pull the branch, build it, run tests. Confirm what passes and what fails _before_ changing anything. Do not skip this — agents that resume work without local repro routinely "fix" things that were already fixed and break things that were already working.

### Phase 2: Design (extended — gap analysis)

Produce a **continuation plan** (see [continuation-plan artifact](../artifacts/continuation-plan.md)) and post it as a PR comment **before any new commit**. The continuation plan answers:

- What's done?
- What's left?
- Which review threads are unaddressed and what's the planned response?
- Are there risks the original author was navigating?
- What is your specific plan for finishing?

This forces context recovery to be explicit and gives the original author a chance to flag misunderstandings.

### Phase 3: Implement

- New commits add to the existing branch — do not force-push to rewrite the original author's commits without consent.
- Preserve the original author's `Co-Authored-By` trailers if any.
- If the PR's design is wrong (you discover the original approach won't work): pause, post a PR comment explaining why, and check with the original author before changing approach.

### Phase 4: Verify

- Standard verification per the original entrypoint's tier.
- Confirm the original test plan is still satisfied.
- If you added scope, document it in the continuation plan and add to the test plan.

### Phase 5: Document

- Standard.
- Update the PR description to reflect the final state if it diverged from the original plan.

### Phase 6: Handoff

- Standard bot-PR contract.
- After merge: ensure the original author and any prior reviewers are credited (Co-Authored-By, PR description).

## Anti-patterns

- ❌ Resuming silently. Original author and reviewers learn from the diff that someone else now drives.
- ❌ Force-pushing over inherited commits without consent.
- ❌ Skipping local reproduction. "The PR description said it works" is not the same as observing it works.
- ❌ Re-doing work that's already done because you didn't read the commits.
- ❌ Changing the design without flagging the change to the original author.
- ❌ Skipping the continuation plan because "I'm just finishing one small thing."

## Related skills

- [continuation-plan artifact](../artifacts/continuation-plan.md)
- [drive-pr](../../drive-pr/SKILL.md) — operational driver-agent flow
- [fix-pr](../../fix-pr/SKILL.md) — fixing all outstanding issues on a PR
- [pr-lifecycle](../../pr-lifecycle/SKILL.md)
