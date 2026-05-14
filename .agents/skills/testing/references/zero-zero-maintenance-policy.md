# 0/0 Nightly Playwright Maintenance Policy

This policy governs the maintenance of the **0 failures / 0 flakies** state once it is achieved on nightly Playwright runs. It is part of the [LS-4401](https://bkrupa.atlassian.net/browse/LS-4401) stability initiative.

## Activation Gate

**This policy is NOT active until 3 consecutive nightly runs hit 0/0**, at which point the parent epic LS-4401 closes. Before that milestone, the existing per-run triage approach continues.

## Rules

### Rule 1: Any new failure is P0

If the nightly run goes from 0/0 → any failure:

1. A **P0 ticket is opened within 24 hours**.
2. The failure is either **fixed within the next business day**, or **the introducing PR is reverted**.

If no PR can be cleanly identified as the cause, the most recent merge to `main` that touches the affected area is the default revert candidate.

### Rule 2: Any new flake is also P0

A test that flakes once is a candidate to flake repeatedly. Flakes count the same as failures for policy purposes.

### Rule 3: Infrastructure interruptions count

If a run is interrupted by a cleanup cron, a runner timeout, an external service outage, etc., that counts as a failure of the suite as observed. Either the infrastructure is fixed, or the test gets a graceful skip/retry that handles the case deterministically.

**Exception**: if every test in the run is recorded as `skipped` due to a clearly-attributable global infrastructure failure (e.g., the runner couldn't connect to the test environment at all), that run is treated as "no data" rather than "failure" and does not break the streak.

### Rule 4: New tests are pre-validated

Any PR that adds new E2E tests must show **5 consecutive local passes** of the new tests before merge. This protects against newly-added flakies showing up on the first nightly run.

See [e2e-determinism.md](e2e-determinism.md) for the 12 levers that prevent flake in the first place.

## Tracking and Reporting

After every nightly run while this policy is in effect:

| Run result   | Action                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **0/0**      | Comment on LS-4401 with running streak, e.g. "4/N consecutive clean runs since first achievement"                                      |
| **Non-zero** | File a per-run epic as usual, then open a P0 ticket against the introducing PR's author (or most likely candidate). Link from LS-4401. |

## Relaxing the Policy

Never automatically. If the team wants to relax this policy (e.g., because the test suite scope changes significantly), explicitly close LS-4401 as "no longer in pursuit of 0/0" and document why.
