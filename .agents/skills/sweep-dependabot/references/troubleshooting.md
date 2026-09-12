# Dependabot Sweep — Guardrails and Troubleshooting

> Loaded from [sweep-dependabot SKILL](../SKILL.md).

## Guardrails

- **One PR = one decision = one action this pass.** Don't try to fix lint and rebase the same PR in the same pass; the chip handles one thing at a time.
- **Skip drafts and `agent-in-progress` always.**
- **Precondition for any change to a Dependabot branch: a dispatched chip with its own worktree** — the orchestrator never edits PR content directly.
- **`@dependabot rebase` is the only rebase mechanism** for Dependabot conflicts. Never `worktree_rebase` a Dependabot branch from the orchestrator.
- **Don't loop, poll, or wait.** One pass per invocation. Use `/loop 30m /sweep-dependabot` if periodic re-runs are desired.
- **Stale closes are recoverable** — Dependabot recreates the PR against the current dep version. Closing a stale PR is never destructive.

## Troubleshooting

| Problem                                                           | Fix                                                                                                                                                   |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gh pr comment` fails with "permission denied"                    | `gh` is authenticated as a user without write to the repo. Check `gh auth status`.                                                                    |
| `bot:ready-for-review` applied but Reviewer (W1) doesn't run      | Confirm the PR isn't a draft. Re-apply the label (remove → add) to emit a fresh `labeled` event.                                                      |
| PR was closed as stale but Dependabot didn't recreate             | Dependabot only recreates if the dependency is still configured in `dependabot.yml` and a newer version exists. Verify both before manual re-opening. |
| Chip dispatched but no progress after 30 min                      | Check the chip's session in the UI. If it failed to start, remove `agent-in-progress` so the next sweep can re-dispatch.                              |
| Major runtime-dep bump flagged `requires-human-review` repeatedly | Label is idempotent — apply once, skip subsequent passes. Don't comment on every sweep.                                                               |
