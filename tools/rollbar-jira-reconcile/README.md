# rollbar-jira-reconcile

Decision engine for `.github/workflows/rollbar-jira-reconcile.yml` (LS-8345,
the "Resolve-on-done" contract in
[`docs/ci-cd/rollbar-jira-sync-contract.md`](../../docs/ci-cd/rollbar-jira-sync-contract.md)).
The workflow is a thin adapter; the only decision — whether an active
Rollbar item's linked Jira ticket justifies resolving it — lives here,
unit-tested:

- **`src/decide.js`** — `decideReconcileAction({ jiraStatus, dryRun })` →
  `resolve` when the linked ticket is Done/Closed and writes are enabled,
  `propose` for the same case during dry-run, `skip` otherwise. The workflow
  only ever lists Rollbar items with `status=active`, so a resolved item is
  never fed back in here — the "never reopen" invariant (AC5) holds
  structurally rather than by branching in this module.
- **`src/cli.js`** — `decide` subcommand emitting JSON for the workflow to
  parse with `jq`.

## Why plain CommonJS with zero dependencies

The reconcile workflow runs with **no `pnpm install`** — it executes this
package with the runner's bare `node` after a sparse checkout of `main`,
mirroring `tools/jira-sync`. Keep it free of runtime dependencies and
TypeScript build steps. Type safety comes from JSDoc annotations checked by
`tsc --checkJs` (the `typecheck` nx target); tests run under jest
(`pnpm exec nx test rollbar-jira-reconcile`) and are part of `make pc`.
