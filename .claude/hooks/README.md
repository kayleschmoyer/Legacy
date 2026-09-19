# Claude Code Hooks

Hook inventory for this repo. All hooks are registered in [`.claude/settings.json`](../settings.json) and follow two conventions:

- **Fail open** — a hook that crashes or can't parse its stdin exits 0 silently; hooks never take a session down.
- **Loop safety** — every blocking hook has a max-block counter (auto-bypass with a loud warning) so an agent can never be trapped in an infinite block loop.

Node hooks (`*.mjs`) share helpers in [`lib/hook-utils.mjs`](lib/hook-utils.mjs). Per-session runtime state lives under `<os-tmpdir>/claude-hooks/<session_id>/`; persistent audit trails live in `.claude/audit/` (gitignored).

## Inventory

| Hook                                                           | Event                                              | Behavior                                                                                                      |
| -------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `setup-worktree-symlink.sh`                                    | SessionStart                                       | Link node_modules pool into ephemeral worktrees                                                               |
| `check-github-auth.sh`                                         | SessionStart                                       | Surface expired GitHub auth early                                                                             |
| `check-workspace-auth.sh`                                      | SessionStart                                       | Surface expired workspace auth early                                                                          |
| `reset-tool-count.sh`                                          | SessionStart                                       | Zero the compact-reminder counter                                                                             |
| `session-model-audit.mjs`                                      | SessionStart + Stop                                | **Session model audit** — record which model served the session; warn on unexpected model family              |
| `read-compact-handoff.mjs`                                     | SessionStart (`compact`)                           | Inject the pre-compact handoff snapshot back into context                                                     |
| `guard-main-repo.sh`                                           | PreToolUse (Edit/Write)                            | Block edits while HEAD is on `main`                                                                           |
| `inject-skill-reminder.js`                                     | PreToolUse (Edit/Write)                            | Remind about scope-matching skills                                                                            |
| `guard-bash-mcp-first.sh`                                      | PreToolUse (Bash)                                  | Warn when a Bash command has an MCP replacement                                                               |
| `guard-make-pc.sh`                                             | PreToolUse (Bash, make_run)                        | Block monolithic `make pc` in cloud sessions                                                                  |
| `guard-gh-pr-marker.mjs`                                       | PreToolUse (Bash)                                  | Block `gh pr create`/`gh pr edit` bodies with no valid jira-link marker (LS-10110); use `scripts/open-pr.mjs` |
| `enforce-background.mjs` (.agents/hooks)                       | PreToolUse (Bash)                                  | Block long-running nx/make without `run_in_background`                                                        |
| `block-tmp-polling.mjs` (.agents/hooks)                        | PreToolUse (Read)                                  | Block polling of running task output files                                                                    |
| `guard-risky-tools.mjs`                                        | PreToolUse (Bash/Edit/Write/NotebookEdit/db_query) | **Pre-tool risk guard** — tiered block/warn for destructive and policy-violating calls                        |
| `remind-compact.sh`                                            | PreToolUse (all)                                   | `/compact` reminder every 35 tool calls                                                                       |
| `budget-governor.mjs`                                          | PreToolUse (all)                                   | **Budget governor** — soft/hard per-session tool-call budget                                                  |
| `log-tool-evidence.mjs`                                        | PostToolUse (all)                                  | **Evidence logger** — per-session JSONL ledger of every tool call                                             |
| `check-incomplete-work.sh`                                     | Stop                                               | Block stop on uncommitted/unpushed work or draft PRs                                                          |
| `delivery-gate.mjs`                                            | Stop                                               | **Delivery gate** — block stop when code changed but no validation ran                                        |
| `check-open-pr.sh`                                             | Stop                                               | Block stop while a drivable PR is open and unmerged                                                           |
| `write-compact-handoff.mjs`                                    | PreCompact                                         | **Handoff writer** — snapshot git + evidence state before compaction                                          |
| `cleanup-worktree-junction.sh` / `cleanup-worktree-symlink.sh` | SessionEnd                                         | Tear down worktree links                                                                                      |

## The evidence pipeline

`log-tool-evidence.mjs` (PostToolUse) appends `{ ts, tool, arg, ok }` for every tool call to `<session-dir>/evidence.jsonl`. Two hooks consume it:

- **`delivery-gate.mjs`** — at Stop, if the ledger shows successful `Edit`/`Write`/`NotebookEdit` calls on product source (anything that isn't docs, `scratch/`, `.claude/`, `.agents/`, editor config, or markdown) and **no** successful validation entry (`nx_run_pc_chunk`, `nx_run_affected`, `make_run` with a test/lint/typecheck/build/pc-\* target, an equivalent Bash command, or `ci_wait_run`), the stop is blocked and the agent is told to run validation and report real results. Max 2 blocks, then bypasses with an "UNVERIFIED" flag for human review.
- **`write-compact-handoff.mjs`** — at PreCompact, the ledger tail (last 25 calls) goes into the handoff so the post-compact context knows what actually ran, not what the summary says ran.

## Risk guard tiers

| Tier         | Response                                                     | Examples                                                                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CATASTROPHIC | Block, **no bypass**                                         | `rm -rf` on `/`, `~`, `.` or `.git`; `git push --force` (bare); any push to `main`; secret material (AWS/GitHub/Slack/Anthropic/Stripe keys, private key blocks) in tool args                                                        |
| GUARDED      | Block, bypass with `# risk-ok: <reason>` (SQL: `-- risk-ok`) | `git worktree remove`, `nx reset`, npm/yarn usage, `pnpm install` through worktree symlinks, `git clean -dx`, `git reset --hard`, `git checkout <ref> -- .`, `git restore --source=<ref> .`, `git stash drop`, SQL `DROP`/`TRUNCATE` |
| WARN         | Allow with caution message                                   | other recursive `rm`, `DELETE` without `WHERE`, `chmod -R 777`                                                                                                                                                                       |

Command patterns are matched with heredoc bodies and quoted strings stripped, so commit messages that _mention_ dangerous commands don't trip the guard. The secret scan runs on raw text.

## Configuration knobs (env vars)

| Var                    | Default                       | Meaning                                                                                                             |
| ---------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `LS_EXPECTED_MODELS`   | `opus\|sonnet\|fable\|mythos` | Pipe-separated model-id substrings (never compiled to a regex); warn at SessionStart when none match. `*` disables. |
| `LS_BUDGET_SOFT_CALLS` | `250`                         | Tool calls before `[BUDGET]` advisories start                                                                       |
| `LS_BUDGET_HARD_CALLS` | `500`                         | Tool calls before non-checkpoint tools are blocked (`0` disables blocking)                                          |
| `LS_BUDGET_WARN_EVERY` | `50`                          | Advisory cadence past the soft budget                                                                               |

## Testing a hook manually

Hooks read JSON from stdin and communicate via stdout + exit code (0 = allow, 2 = block):

```bash
echo '{"session_id":"t1","tool_name":"Bash","tool_input":{"command":"git push --force origin main"}}' \
  | node .claude/hooks/guard-risky-tools.mjs; echo "exit=$?"
```

## Audit trails (`.claude/audit/`, gitignored)

- `session-models.jsonl` — one record per SessionStart/Stop with the detected model
- `risk-guard.jsonl` — every risk-guard hit, including bypassed ones
- `budget-governor.jsonl` — budget warnings, blocks, and disarms
