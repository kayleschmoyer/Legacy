# Entrypoint 03: Security / CVE Response

**Trigger**: a CVE alert from Dependabot, GitHub security advisory, internal security report, or external responsible-disclosure.

**Default risk tier**: Critical

**Required artifacts**: repro (if exploitability is in question), [postmortem](../artifacts/postmortem.md) (if exploited or production was affected), [test plan](../artifacts/test-plan.md) covering the vulnerability case.

## Path notes

Two sub-paths depending on whether the vulnerability is **theoretical** (CVE in a dependency we use, but no evidence of exploitation) or **active** (evidence of exploitation in our systems).

### Active exploitation → treat as Entrypoint 01 (incident-hotfix)

If there is any evidence the vulnerability has been exploited against us, switch to the [incident-hotfix](01-incident-hotfix.md) protocol. Postmortem mandatory.

### Theoretical CVE → continue here

#### Phase 1: Frame

- Triage severity using the CVE's CVSS score AND our context (do we use the affected code path? is it user-facing? is it in a dev-only dependency?).
- A CVE on a dev-only dependency may be Medium or even Low; a CVE on a runtime dependency in user-facing code is Critical regardless of CVSS.
- File a ticket with the CVE ID in the title and a link to the advisory.

#### Phase 2: Design

- For dependency upgrades that fix the CVE: usually no RFC needed, but check the changelog for breaking changes — if there are any, an RFC is needed.
- For mitigations other than upgrade (input validation, capability removal, feature disable): RFC required.
- Test plan must include a case that exercises the vulnerable code path.

#### Phase 3: Implement

- Smallest fix that closes the vulnerability. If the fix involves removing a feature, file a follow-up ticket to restore it safely.

#### Phase 4: Verify

- Run the vulnerability test plan. Confirm the previously-vulnerable case is now safe.
- Run full security scan locally if available; otherwise trust CI's security-scanning job.
- For dependency upgrades: run the regression test plan (see [07-dependency-upgrade](07-dependency-upgrade.md)).

#### Phase 5: Document

- Update the security log (location TBD — may be a private channel rather than docs).
- If exploited: postmortem mandatory. See [postmortem artifact](../artifacts/postmortem.md).
- If not exploited but a near-miss (vulnerable code shipped but not exercised): consider voluntary postmortem.

#### Phase 6: Handoff

- For Critical CVEs: prioritize merge above other work. Other PRs can wait.
- The `needs-human-security-review` label may be applied by the bot — see [pr-lifecycle](../../pr-lifecycle/SKILL.md) for the override path.

## Anti-patterns

- ❌ "It's a dev dependency, ignore." Dev dependencies run in CI with secrets. Triage is required.
- ❌ Bundling the CVE fix with unrelated work. Separate PR, fast review path.
- ❌ Public discussion of an unfixed vulnerability. Use private channels until the fix ships.
- ❌ Skipping the test plan because "the upgrade obviously fixes it." The test asserts the fix works in _our_ code, not in the library author's tests.

## Related skills

- [postmortem artifact](../artifacts/postmortem.md)
- [pr-lifecycle](../../pr-lifecycle/SKILL.md) — `needs-human-security-review` label and `security-review-override`
- [secrets-handling](../../secrets-handling/SKILL.md)
- [07-dependency-upgrade](07-dependency-upgrade.md) — for the upgrade mechanics
