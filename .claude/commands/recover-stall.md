---
description: 'Use to wake a cloud agent that stalled during validation or CPU-bound work — checkpoint its work into a CI-validated PR without re-running the command that stalled it, then resume.'
argument-hint: '[LS-#### ticket key]'
agents: 'claude'
---

**WAKE UP — you stalled during validation or CPU-bound work. Read this carefully before doing anything.**

You went unresponsive while running a long/blocking command (likely `make pc`, a build, a test run, or similar). Do **not** re-run that command — it is what stalled you, and re-running it will stall you again.

Do the following, in order:

1. **Take stock, fast.** Run `git status` and `git diff --stat` to see what's already on disk. Do **not** run any build, typecheck, lint, test, or `make pc`/`pc-*` step right now. If a PR already exists for this branch, call `github_pr_why_blocked` immediately — don't conclude "nothing to recover" from git/CI state alone. A clean working tree and green-looking CI summary can coexist with `MERGE_CONFLICT`/`mergeable:CONFLICTING`; that reason demands a rebase (see step 7), not a no-op.

2. **Commit whatever exists.** Stage your work and commit inline (never open `$EDITOR`):
   - Use `worktree_commit({ message: "..." })` if available, else `git commit -m "$(cat <<'EOF' … EOF)"`.
   - Include the `LS-####` ticket key (from `$ARGUMENTS` if provided, else from your own context) in the message so Jira links it.

3. **Push and open a PR immediately** — even if the work is incomplete and even though validation hasn't run locally:
   - `github_create_pr` (draft is fine for the create call).
   - In the PR body, add a clearly visible note: `⚠️ Local validation skipped — agent recovered from a stall; relying on CI to validate. pc-* still pending locally.` plus a short checklist of what's left.

4. **Mark it ready so CI runs.** Call `github_mark_pr_ready` and apply `bot:ready-for-review`. This kicks off the CI pipeline — let CI do the heavy validation that stalled you locally. Do **not** apply `merge-when-ready` or enable auto-merge yet, and do not apply any maintainer override label.

5. **Then resume implementation** from where you left off. Continue the actual task — write the remaining code/tests to satisfy the ticket's acceptance criteria. Commit and push incrementally (small commits) so any future stall loses at most one small chunk, and re-apply `bot:ready-for-review` after each fix-push.

6. **Watch CI instead of running heavy validation locally.** CI status and review events arrive as push notifications — do **not** poll with `sleep` loops. When CI reports failures, fix them and push. If you must run something locally, run the seven `pc-*` chunks one at a time via `make_run` (never the monolithic `make pc`), and skip any chunk that looks like it will hang — note it in the PR body instead of blocking.

7. **Drive to merge** once CI is green, the bot review is addressed (`FIX: <sha>` replies), and threads are resolved. If `github_pr_why_blocked` reported `MERGE_CONFLICT`, rebase onto main first (`/rebase` skill) and resolve any conflicts before waiting on CI — a conflicting branch will never go green. The task is complete only when `github_view_pr` shows `state: "MERGED"`.

**Guardrails:** never commit to `main`; stay in your worktree/branch; prefer MCP tools over raw shell; never apply maintainer/override labels; never run `aws sso login` or any auth command — if you hit an auth error, stop and surface it.
