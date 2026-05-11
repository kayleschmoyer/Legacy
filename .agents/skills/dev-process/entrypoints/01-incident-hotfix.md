# Entrypoint 01: Incident / Hotfix

**Trigger**: production is currently broken or degraded. Users are seeing errors, data is at risk, or a P0 ticket has just been filed.

**Default risk tier**: Critical

**Required artifacts**: abbreviated repro report, postmortem (within 24h of close), test plan covering the regression case.

## Path notes

This is the only entrypoint where speed and rigor trade against each other. The protocol minimizes the trade.

### Phase 1: Frame (compressed)

- Assign an **incident commander** before anything else. One person owns the response.
- Open an incident channel / thread. All decisions logged with timestamps for the postmortem.
- Establish severity: SEV1 (full outage / data loss) / SEV2 (major degradation) / SEV3 (minor degradation).
- Capture the abbreviated repro inline in the channel (one user, one path). Full repro waits for the postmortem.

### Phase 2: Design (compressed)

- **No RFC.** The fastest correct fix is the goal. Document the fix rationale inline in the PR.
- If the fix introduces an architectural change (new pattern, new dependency), an **ADR is required after the incident closes** — it can be a follow-up PR.

### Phase 3: Implement (focused)

- Smallest possible change to mitigate. Resist the urge to "fix while I'm in there."
- Hotfix branches off `main` directly. No stacking.
- Commit messages reference the incident: `hotfix(area): mitigate <symptom> (LS-####)`.

### Phase 4: Verify (mandatory but compressed)

- Verify the fix locally before merge. `make pc` is mandatory; full E2E is optional if the change is surgical.
- **Add a regression test in the same PR.** A hotfix without a regression test is half-done.
- For mitigations that are not full fixes (feature flag off, traffic redirect): this is acceptable, but a follow-up ticket for the real fix must exist before the hotfix merges.

### Phase 5: Document

- Postmortem **drafted within 24h of incident close**. See [postmortem artifact](../artifacts/postmortem.md).
- Postmortem **published within 1 week**.
- Action items filed as Jira tickets in the same PR as the postmortem. No tickets = no learning.

### Phase 6: Handoff

- Skip the standard draft-PR-then-mark-ready dance. Open ready, request review, merge as soon as approved + CI green.
- For SEV1 with no available human reviewer: use the `review-bot-override` label after bot review confirms the fix (see [bot review override](../../pr-lifecycle/SKILL.md)).
- After merge: monitor production for at least 30 minutes. The fix is not done until recovery is confirmed.

## Anti-patterns

- ❌ Multiple people deploying simultaneously. One incident commander, one decision-maker on deploys.
- ❌ "We'll add the regression test later." It will not happen. Same PR.
- ❌ Skipping the postmortem because "the fix was obvious." The point of the postmortem is the _system_ failure that allowed the bug to ship, not the bug itself.
- ❌ Listing "be more careful" as an action item. Action items must be concrete system changes (new test, new alert, new guard).
- ❌ Using a hotfix as cover for unrelated changes ("I noticed this nearby thing while I was in there"). File a separate ticket.

## Related skills

- [postmortem artifact](../artifacts/postmortem.md)
- [pr-lifecycle](../../pr-lifecycle/SKILL.md) — bot review override label for emergency merges
- [debugging](../../debugging/SKILL.md)
- [cloudwatch-archaeology](../../cloudwatch-archaeology/SKILL.md) — for distributed-system incident root-causing
