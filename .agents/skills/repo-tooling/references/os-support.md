# OS Support Matrix

> Loaded from [repo-tooling SKILL](../SKILL.md).

## OS support matrix

The Makefile is aggressively OS-forked (`ifeq ($(DETECTED_OS),Windows)`). Before recommending a target in a cloud/Linux session, check this table; "stub" means the target prints a message and does nothing.

| Target                                                                                                        | Windows        | Linux/cloud                                                                                                             |
| ------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `pc`, `pc-*`, `lint*`, `typecheck`, `test*`, `build*`, `format*`, `codegen`, `quick-check`                    | ✅             | ✅                                                                                                                      |
| `install`, `install-force`, `install-node`                                                                    | ✅ (pool link) | ✅ (`pnpm install --frozen-lockfile`)                                                                                   |
| `clean-cache` / `reset`, `modules-gc`, `setup-hooks`, `e2e-auth`, `diagrams`, `lint-skills`                   | ✅             | ✅                                                                                                                      |
| `sync-env`, `deploy-lambdas`, `squash-branch`, `rebase-tree*`, `cleanup-merged-branches`, `resolve-conflicts` | ✅ (.ps1)      | ✅ (.sh)                                                                                                                |
| `worktree`, `wt-setup`                                                                                        | ✅             | ⛔ stub — cloud sessions get an isolated checkout; no worktree needed                                                   |
| `kill-stale`                                                                                                  | ✅             | ⛔ stub (native-addon file locks are a Windows problem; on Linux kill node processes directly or use `browser_cleanup`) |
| `db-dump`, `db-restore`, `db-dump-dev`, `db-restore-dev`                                                      | ✅             | ⛔ stub                                                                                                                 |
| `sync-jira`, `sync-worktrees`, `sync-worktrees-add/remove`, `pr` (twig), `branch-tree`                        | ✅             | ⛔ stub / requires twig (Windows-local tool)                                                                            |
| `db-tunnel`                                                                                                   | ⛔ stub        | ✅ (bash-only)                                                                                                          |

Note: `pnpm run sync-env` (the package.json script) is PowerShell-only; `make sync-env` picks the right script per OS. `deploy-infrastructure` no longer exists (removed in LS-2425) — use `make terraform-apply` / `make runner-apply` (see [terraform](../../terraform/SKILL.md)).
