# Nightly Execution Profile — Why Local Single-Spec Runs Mislead

> Loaded from [fix-integration-tests SKILL](../SKILL.md).

## Nightly Execution Profile — Why Local Single-Spec Runs Mislead

Integration tests **do not run on PRs**. They run only:

- **Nightly** via `.github/workflows/run-playwright-tests.yml` — an automated post-deploy `workflow_run`, debounced to ~one full-suite run per day (the former `0 3 * * *` cron was removed; see the workflow's `gate` job)
- **Manual `workflow_dispatch`** from the Actions tab

A local `--grep` reproduction differs materially from the nightly profile. Even a fully green local single-spec run cannot prove that a fix holds under nightly conditions.

| Property              | Local `--grep` (agent default) | Nightly                                                                                 |
| --------------------- | ------------------------------ | --------------------------------------------------------------------------------------- |
| Specs                 | 1                              | Every `*.integration.spec.ts` (see `apps/web-e2e/src/integration/tests/`)               |
| Shards                | 1                              | `INTEGRATION_SHARD_CEILING` (currently 3 — LS-7867; do not raise without re-validation) |
| Workers/shard         | 1 (`workers: 1`)               | 1 (workflow forces `--workers=1` — LS-2824)                                             |
| Effective parallelism | 1 Playwright proc              | 3 procs hammering the same live backend                                                 |
| Retries               | 0 (config `retries: 0`)        | 0 (workflow adds no `--retries` for integration; flake fails the run)                   |
| Backend               | `api.legacy-fantasy.com`       | Same                                                                                    |
| Test users            | 14-seat tiered pool            | **Same pool, all 3 shards at once — default seats overlap**                             |
| `globalTeardown`      | Runs                           | **League sweep skipped in sharded runs** (LS-4318)                                      |

### Three failure modes the local profile cannot exercise

1. **Cumulative backend load** ([LS-4353](https://bkrupa.atlassian.net/browse/LS-4353)). By the 6th–7th spec in a shard, Lambda / SQS / RDS are under contention and Apollo round-trips slow 5–10×. Deadlines tuned to an isolated 30s draft blow past 200s under load. Symptom: the local single-spec run is green at 30s, nightly times out at 180s on the same phase.
2. **Shared-user state contention** ([LS-4350](https://bkrupa.atlassian.net/browse/LS-4350)). Test users come from the **14-seat tiered pool** (6 premium / 6 free / 2 admin, `loginAs(tier, seat)` in `apps/web-e2e/src/utils/test-user-auth.ts` — LS-8055; the legacy `E2E_COMMISSIONER`/`E2E_MANAGER_*` accounts are folded in as seats). Contention persists because specs default to the same low-numbered seats (`loginAs()` defaults to `('premium', 1)`, and the `api`/`api2` fixtures map to fixed premium seats), so all shards still mutate `leagueMembers`, `userLeagues`, and JWT state for overlapping identities concurrently. A per-spec user pool is still OPEN (LS-4357). Symptom: phase 2 (manager joins league) succeeds, phase 10 (manager re-enters the same league) sees `ForbiddenError` / `League not found` because the `leagueMembers` row isn't queryable yet from the other shard's read path. Tier selection rules: [testing/SKILL.md Tiered Test-User Model](../../testing/SKILL.md#tiered-test-user-model-premium-default-free-for-gates).
3. **Cross-shard write→read lag** ([LS-4318](https://bkrupa.atlassian.net/browse/LS-4318)). Sharded runs skip `globalTeardown`'s league sweep (the fastest shard was deleting leagues still in use by slower shards; the next run's `globalSetup` sweeps instead), so leagues from earlier specs and other shards sit in the DB throughout the run. Read paths see more rows than local runs ever observe; pagination, ordering, and filter assertions tuned to a single-spec database fail under nightly's accumulated state.

### Implications for this skill

**Phase 1 (reproduce) and Phase 4a (verify) use single-spec runs but cannot prove the fix holds under nightly conditions.** Phase 4b mandates a nightly-shaped verification before push. A green `--grep` is necessary but not sufficient — it confirms the targeted fix, not the absence of cross-spec contention. Skipping Phase 4b is the mechanism by which the repo has accumulated "Nth regression guard" tickets (a fix lands, nightly fails again on a different phase with the same class of bug).

See [`e2e-determinism.md` antipatterns from past regressions](../../testing/references/e2e-determinism.md#antipatterns-from-past-regressions--class-of-bug-catalog) for the class-of-bug catalog and the patterns that survive nightly.

---
