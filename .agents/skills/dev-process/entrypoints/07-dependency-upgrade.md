# Entrypoint 07: Dependency Upgrade

**Trigger**: Dependabot PR, manual upgrade, or upgrade required to unblock another change.

**Default risk tier**: Medium (raise to Critical for security-driven upgrades — switch to [03-security-cve](03-security-cve.md)).

**Required artifacts**: [test plan](../artifacts/test-plan.md) focused on regression coverage.

## Path notes

The risk in an upgrade is **transitively changed behavior** — your code didn't change, but a dependency did, and that dependency's change ripples through your call sites. The test plan must hunt for that.

### Phase 1: Frame

- Read the changelog from current → target version. Yes, all of it. Note breaking changes, deprecations, and behavior changes (not just API changes).
- For multi-major upgrades (v3 → v5): consider intermediate stops (v3 → v4, then v4 → v5). Each step has its own changelog and is independently revertable.
- For Dependabot PRs: the PR exists; treat the rest of this document as your driving plan.

### Phase 2: Design

- For minor / patch upgrades with no changelog drama: no RFC. Test plan is the design.
- For major upgrades with API changes: RFC with the migration plan.
- For framework upgrades (React, Apollo, Tamagui, Nx): RFC mandatory regardless of version delta.
- Test plan: list every code path that uses the changed APIs. Each is a regression case.

### Phase 3: Implement

- Smallest diff to make the upgrade work. Defer cosmetic changes.
- Update generated code (`make codegen`) and lockfiles in the same commit as the version bump.
- For framework upgrades that require code changes at every call site: separate commits per area, each independently passing.

### Phase 4: Verify

- Full `make pc`. Mandatory — affected-only is not enough since transitive changes don't show up in affected detection.
- Run the full E2E suite locally if the upgraded library is in the runtime path.
- For UI library upgrades: visual regression check via Storybook + Chromatic if available.
- For DB driver upgrades: full integration test suite.

### Phase 5: Document

- Note the upgrade in `CHANGELOG.md` if one exists.
- If the upgrade required a migration pattern (new way to use the library): write a short reference doc.
- Update any docs that referenced the old API.

### Phase 6: Handoff

- Standard PR flow.
- PR description includes the **changelog summary** and the **regression cases verified**.

## Anti-patterns

- ❌ "Just bump the version, CI will catch problems." CI only catches problems your tests cover. Read the changelog.
- ❌ Bundling multiple upgrades in one PR. Each upgrade is independently revertable when separated.
- ❌ Skipping the integration test run because "unit tests pass." Many upgrade-related bugs only manifest in real I/O.
- ❌ Adding a new feature that depends on the new version _in the upgrade PR_. Two PRs.

## Related skills

- [standards](../../standards/SKILL.md) — codegen policy for generated artifacts
- [testing](../../testing/SKILL.md)
- [03-security-cve](03-security-cve.md) — for security-driven upgrades
