# jira-sync

Transition engine for `.github/workflows/jira-branch-sync.yml` — phase 1 of
the declared-ticket-linkage RFC (`docs/rfcs/draft-declared-ticket-linkage.md`,
LS-7893/LS-7894). The workflow is a thin event adapter; all decisions live
here, unit-tested:

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
- **`src/cli.js`** — `plan` / `guard` subcommands emitting JSON for the
  workflow to parse with jq.

## Why plain CommonJS with zero dependencies

The sync workflow runs on every push to `claude/**` / `LS-*` branches with a
5-minute timeout and **no `pnpm install`** — it executes this package with the
runner's bare `node` after a sparse checkout of `main`. Keep it free of
runtime dependencies and TypeScript build steps. Type safety comes from JSDoc
annotations checked by `tsc --checkJs` (the `typecheck` nx target); tests run
under jest (`pnpm exec nx test jira-sync`) and are part of `make pc`.
