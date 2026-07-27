# jira-sync

Transition engine for `.github/workflows/jira-branch-sync.yml` (phase 1 of
the declared-ticket-linkage RFC, `docs/rfcs/draft-declared-ticket-linkage.md`,
LS-7893/LS-7894) and `.github/workflows/jira-status-audit.yml` (phase 4,
LS-7897). The workflows are thin event adapters; all decisions live here,
unit-tested:

- **`src/marker.js`** — parses the `<!-- jira-link -->` PR-body marker
  (`primary` / `related`); decoy `LS-####` keys in prose are never matched.
- **`src/state-machine.js`** — the allowed-moves table
  (`To Do → In Progress → In Review → Done`) and the monotonic guard. The
  only permitted downgrades are `In Review → In Progress` on
  `closed`-unmerged or `converted_to_draft`. Callers read the ticket's
  current status from Jira immediately before consulting the guard.
- **`src/plan.js`** — maps a GitHub event to `{ keys, target }`:
  PR events use the marker's `primary` (falling back to PR-title keys when
  no marker exists); push events use branch-name keys only and are gated on
  the branch having **no open PR**. Commit-message key sweeping is gone — it
  swept foreign keys from main's commits after rebases (run 27291997543).
- **`src/audit.js`** — maps a PR snapshot to `{ key, expected }` for the
  status audit: merged → Done, open draft → In Progress, open ready →
  In Review. Key selection is marker-first, then PR-title, then branch-name
  (the audit's historical key source). Repairs stay forward-only: the audit
  consults the guard with a non-`pull_request` event, so no downgrade is
  ever permitted; refused drift is labeled instead. `decideAuditAction`
  owns the per-PR verdict (in-sync / repair / propose / refuse) and the
  jira-mismatch label add/remove decision, so the workflow bash only
  executes returned actions.
- **`src/cli.js`** — `plan` / `guard` / `audit` / `audit-action`
  subcommands emitting JSON for the workflows to parse with jq.

## PowerShell parity (LS-8583)

`scripts/sync-jira-status.ps1` and `scripts/lib/jira-rollup.ps1` run the same
Jira sync as a periodic, non-GHA nightly script and mirror this package's
rules in PowerShell (marker-first key selection, the LS-4683 epic-rollup
tiers, and the forward-only leaf-ticket policy jira-status-audit.yml applies
in its own periodic context). There is no shared runtime between the two —
add a matching PowerShell test case in `scripts/__tests__/jira-rollup.test.ps1`
for every spec case here that changes a mirrored contract.

## Why plain CommonJS with zero dependencies

The sync workflow runs on every push to `claude/**` / `LS-*` branches with a
5-minute timeout and **no `pnpm install`** — it executes this package with the
runner's bare `node` after a sparse checkout of `main`. Keep it free of
runtime dependencies and TypeScript build steps. Type safety comes from JSDoc
annotations checked by `tsc --checkJs` (the `typecheck` nx target); tests run
under jest (`pnpm exec nx test jira-sync`) and are part of `make pc`.
