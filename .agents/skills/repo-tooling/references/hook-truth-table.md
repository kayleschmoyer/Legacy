# Hook truth table

One home for what every Claude Code hook in this repo actually does — verified against the scripts themselves, not their prose descriptions (two Bash guards were previously misdocumented). Registration lives in `.claude/settings.json` under `hooks`; the scripts live in `.claude/hooks/` and `.agents/hooks/`.

Semantics: **BLOCKS** = exit 2, the tool call (or stop) is refused and the message is fed back to the agent. **WARNS** = exit 0, stdout is injected into agent context but the call proceeds.

## PreToolUse hooks

| Hook                                     | Matcher                                            | Effect     | Fires when                                                                                                                                                                                                                                                              | Bypass                                                                                                                                                                     |
| ---------------------------------------- | -------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.agents/hooks/enforce-background.mjs`   | `^Bash$`                                           | **BLOCKS** | First line (quoted-string contents stripped first, so `grep 'make pc-format'`-style mentions don't count) matches `pnpm exec nx affected\|run-many\|run-affected`, bare `nx affected\|run-many`, or `make pc-<chunk>` — and `run_in_background` is not `true` (LS-8681) | Set `run_in_background: true` (the sanctioned path for pc chunks in degraded CC-web), or add `# bg-ok` to the first line when inline is genuinely safe                     |
| `.agents/hooks/block-tmp-polling.mjs`    | `^Read$`                                           | **BLOCKS** | `file_path` matches `/tmp/claude*` or `\Temp\claude*` — **except** allowlisted `tasks/<id>.output` files and the session scratchpad dir (`…/scratchpad/…`), which pass through (LS-8377/LS-8389)                                                                        | None for still-blocked paths — wait for the task-completion push notification, or `TaskGet({ taskId })` for status                                                         |
| `.claude/hooks/guard-main-repo.sh`       | `^(Edit\|Write)$`                                  | **BLOCKS** | `file_path` is under `D:/code/legacy-sports` (Windows-local main repo) while ≥1 worktree exists. Allowed anyway: `.claude/**`, `tools/mcp/**`, `*.code-workspace`                                                                                                       | Edit the file in the worktree path instead. (Hardcoded main-repo path — inert on Linux/cloud checkouts)                                                                    |
| `.claude/hooks/guard-bash-mcp-first.sh`  | `^Bash$`                                           | WARNS      | First word is `ls`/`find`/`cat`/`head`/`tail`/`grep`/`rg` (cat allow-list: heredoc, pipeline source, stdin passthrough, output redirect), or `grep`/`rg` after `&&`/`;`/`\|\|`. Piped `\| grep` is exempt                                                               | `# mcp-ok: <reason>` — suppresses the warning and marks the line BYPASS in `.claude/bash-audit.log`. There is **no** `ALLOW_BASH_FALLBACK` env var (older docs were wrong) |
| `.claude/hooks/guard-make-pc.sh`         | `^Bash$` and `^mcp__legacy-sports-make__make_run$` | **BLOCKS** | Bare `make pc` (incl. `make -C <dir> pc`) in a Bash command, or `make_run({ target: "pc" })`. Message prescribes the 7-chunk sequence: `nx_run_pc_chunk` when the nx server is loaded; background Bash `make pc-<chunk>` in degraded CC-web                             | `# pc-ok` in the Bash command (local, non-timeout-prone sessions)                                                                                                          |
| `.claude/hooks/inject-skill-reminder.js` | `^(Edit\|Write)$`                                  | WARNS      | Editing trigger-critical paths (e.g. `terraform/**/*.tf`); once per session per category                                                                                                                                                                                | n/a — advisory                                                                                                                                                             |
| `.claude/hooks/remind-compact.sh`        | `""` (all tools)                                   | WARNS      | Every 35th tool call: emits `[COMPACT REMINDER]` — run `/compact` immediately, then resume                                                                                                                                                                              | n/a — advisory (counter in `$TMPDIR/claude-compact-counter`, reset each SessionStart)                                                                                      |

## Stop hooks (block ending the turn)

| Hook                                     | Effect     | Fires when                                                                                                                                                                             | Escape                                                                                                   |
| ---------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `.claude/hooks/check-incomplete-work.sh` | **BLOCKS** | Ephemeral-worktree session (path contains `/.claude/worktrees/`) has uncommitted changes, unpushed commits, or a still-draft PR (LS-4258)                                              | Resolve the work. Auto-bypasses after 3 consecutive blocks (counter with 1-hour staleness reset)         |
| `.claude/hooks/check-open-pr.sh`         | **BLOCKS** | Current `claude/*` branch has an open, ready, unmerged PR with no legitimate-blocker label (`needs-human-security-review`, `needs-human-arbitration`, `review-bot-override`) (LS-4907) | Drive the PR to merge. Auto-bypasses after 3 blocks; deliberate pause: `touch .claude/.pr-watch-opt-out` |

## SessionStart / SessionEnd hooks (never block)

| Hook                                         | Event        | Does                                                                                                                                                            |
| -------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/hooks/setup-worktree-symlink.sh`    | SessionStart | Links `node_modules` (+ `.env`, `.env.local`, `certs/`) via `scripts/modules-pool/link.mjs`; then chains `check-mcp-servers.sh` sequentially (LS-4505 race fix) |
| `.claude/hooks/check-github-auth.sh`         | SessionStart | Warns if GitHub is unauthenticated (Linux cloud sessions only)                                                                                                  |
| `.claude/hooks/check-workspace-auth.sh`      | SessionStart | Warns per missing service credential (GitHub, Jira, …)                                                                                                          |
| `.claude/hooks/reset-tool-count.sh`          | SessionStart | Zeroes the compact-reminder counter                                                                                                                             |
| `.claude/hooks/cleanup-worktree-junction.sh` | SessionEnd   | Removes a `node_modules` NTFS junction from an ephemeral worktree (junctions ARE followed by recursive deletes — dangerous)                                     |
| `.claude/hooks/cleanup-worktree-symlink.sh`  | SessionEnd   | Removes the `node_modules` symlink from an ephemeral worktree (belt-and-suspenders; symlinks are not followed by deletes)                                       |

## Present but not registered in `.claude/settings.json`

- `.claude/hooks/check-mcp-servers.sh` — invoked only from the end of `setup-worktree-symlink.sh` (never standalone); warns when `node_modules/.bin/tsx` is missing, which silently kills every stdio MCP server.
- `.claude/hooks/cleanup-orphaned-symlinks.sh` — the registered twins live under `.github/copilot/hooks/` and are wired via `.github/hooks/worktree-setup.json` (Copilot coding-agent sessions).
- `*.ps1` twins (`guard-main-repo.ps1`, `guard-bash-mcp-first.ps1`, `setup-worktree-symlink.ps1`, `cleanup-worktree-symlink.ps1`) — Windows PowerShell variants; `.claude/settings.json` registers the `.sh` forms (run via Git Bash on Windows).

## Git hooks (`.github/hooks/`, not Claude hooks)

Installed into `.git/hooks/` by `make setup-hooks` (which `make install` runs). A fresh cloud checkout that never ran `make install` has **no** git hooks — only `*.sample` files.

`pre-push` runs four checks: (1) reject tracked `package-lock.json`/`yarn.lock`; (2) reject 7-char conflict markers in tracked non-md files; (3) `terraform validate` when `terraform/` changed; (4) `nx format:write` — if formatting changed files and the tree was clean, it auto-amends the last commit and **aborts the push** (re-run `git push`); if the tree was dirty, it blocks the push. Bypass: `SKIP_PREPUSH_LINT=1 git push` (formatting only) or `git push --no-verify` (all checks, emergency only).

`pre-push` has **no** git-lfs dependency as of this ticket (LS-7795) — removed end-to-end in LS-8204 (2026-06-20); re-verified against the live 159-line hook and guarded against regression by `.github/checks/pre-push-no-hard-lfs-guard.sh`. Do not reintroduce an unconditional `command -v <optional-binary> || exit <nonzero>` guard based on stale assumptions about LFS.

## Provenance and maintenance

Created 2026-07-02 from the skills audit (build-and-env area), which found both Bash guards misdescribed (guard-bash-mcp-first documented as blocking with an `ALLOW_BASH_FALLBACK` bypass — it always exits 0 and has no such variable). Re-verify by reading the scripts, never their descriptions:

- Registration: `Read .claude/settings.json` (hooks section)
- Block vs warn: `grep -c "exit 2" .claude/hooks/*.sh .agents/hooks/*.mjs`
- enforce-background patterns: `grep -n "LONG_RUNNING" .agents/hooks/enforce-background.mjs`
- guard-make-pc message: `Read .claude/hooks/guard-make-pc.sh`
- pre-push checks: `Read .github/hooks/pre-push` (header comment)
