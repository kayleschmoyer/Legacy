# MCP Batch-Tool Inventory (LS-8032)

> Foundation audit for epic **LS-8031** — "Add batch variants for MCP operations commonly called in loops".
> This inventory enumerates every tool across the 10 in-repo MCP servers (`tools/mcp/*`) and classifies each as
> **already-batched**, **needs-batch** (single-only but routinely looped), or **single-use** (fine as-is). It grounds and
> gates the per-server batch tickets **LS-8033** (convention) and **LS-8034–LS-8038** (implementation).

## How to read this

Each tool is classified into one of three buckets:

| Bucket             | Meaning                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| ✅ **batched**     | Already accepts an array / has a plural counterpart. Do not duplicate.                                                    |
| 🔴 **needs-batch** | Single-item today, but agents routinely call it N-in-a-row in sweeps/loops. Candidate for a `*_batch` / `bulk_*` variant. |
| ⚪ **single-use**  | Genuinely one-shot per workflow (reads, status checks, one-per-session setup). Leave as-is.                               |

**Loop frequency** estimates how often the tool is called repeatedly within one session, grounded by cross-referencing the
sweep/fan-out skills under `.agents/skills/` (`pr-lifecycle` references: sweep / sweep-prs / unblock, plus `sweep-dependabot`, `work-bugs`,
`work-mcp-gaps`, `slice`, `jira-rollover`) plus the ticket-to-merge spine.

**Priority** (for the per-server tickets): **P0** high-frequency + multi-target sweeps are the norm · **P1** looped in
specific skills · **P2** occasional batching benefit.

## Shared convention (per LS-8033 — confirm there)

- **Naming**: add a `*_batch` (or `bulk_*`) tool that accepts an array (`keys: [...]`, `items: [...]`, `targets: [...]`);
  **keep the single-item tool** for one-off use.
- **Partial-failure result shape**: return `{ total, succeeded: [...], failed: [{ index|key, error }] }` — the same shape
  `jira_bulk_create_tickets` already returns. Never fail the whole call because one item errored.
- **Max batch size**: cap at a sane bound (Jira bulk caps at 50).

---

## Prioritized "needs-batch" summary (the actionable list)

| Server   | Tool (single)                                                                    | Proposed batch tool                                                 | Loop frequency                                                       | Priority | Per-server ticket |
| -------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- | -------- | ----------------- |
| jira     | `jira_transition`                                                                | `jira_transition_batch` (array of `{ key, status }`)                | High — every sweep moves N tickets (slice, rollover, bucket fan-out) | **P0**   | LS-8034           |
| jira     | `jira_edit_ticket`                                                               | `jira_edit_batch` (array of `{ key, fields }`, incl. sprint/parent) | High — bulk relabel/re-sprint/re-parent                              | **P0**   | LS-8034           |
| jira     | `jira_set_parent`                                                                | fold into `jira_edit_batch` (parent is a field)                     | Med — slicing an epic re-parents N children                          | **P1**   | LS-8034           |
| jira     | `jira_link_issues`                                                               | `jira_link_batch` (array of `{ from, to, type }`)                   | Med — slice/define links N blockers at once                          | **P1**   | LS-8034           |
| jira     | `jira_list_children`                                                             | `jira_list_children` accept `keys: [...]` (multi-parent)            | Med — auditing several epics in one pass                             | **P1**   | LS-8034           |
| jira     | `jira_view`                                                                      | `jira_view_batch` (array of keys)                                   | Med — triage reads N tickets per sweep                               | **P2**   | LS-8034           |
| jira     | `jira_add_comment`                                                               | `jira_comment_batch` (array of `{ key, body }`)                     | Low–Med — status-stamping N tickets                                  | **P2**   | LS-8034           |
| github   | `github_merge_pr`                                                                | `github_merge_batch` (array of PR numbers)                          | High — sweep-prs / sweep-dependabot merge N PRs                      | **P0**   | LS-8035           |
| github   | `github_rebase_pr` (removed LS-9294; batch variant `github_bulk_rebase` shipped) | `github_rebase_batch` (array of PR numbers)                         | High — pr-lifecycle sweep rebases the whole board                    | **P0**   | LS-8035           |
| github   | `github_edit_pr`                                                                 | `github_edit_batch` (array of `{ number, ...edits }`)               | Med — relabel/retitle across a sweep                                 | **P1**   | LS-8035           |
| github   | `github_comment_pr`                                                              | `github_comment_batch` (array of `{ number, body }`)                | Med — post status notes across PRs                                   | **P1**   | LS-8035           |
| github   | `github_reply_to_review` / `_thread`                                             | `github_reply_to_review_batch` (array of `{ threadId, body }`)      | High — bot-review cycle replies to N threads                         | **P0**   | LS-8035           |
| github   | `github_manage_labels` (single PR)                                               | accept `numbers: [...]` for cross-PR label ops                      | Med — sweep labelling                                                | **P1**   | LS-8035           |
| github   | `github_request_review`                                                          | `github_request_review_batch` (array of PR numbers)                 | Low–Med — request bot review on N PRs                                | **P2**   | LS-8035           |
| github   | `github_retrigger_check`                                                         | `github_retrigger_batch` (array of `{ number, check }`)             | Med — re-kick CI across stuck PRs                                    | **P1**   | LS-8035           |
| ci       | `ci_rerun` (folded into `ci_rerun`'s `runIds` param — LS-9714)                   | ✅ done — `runIds` (1-50) on `ci_rerun`                             | High — re-kick N failed runs in a sweep                              | **P0**   | LS-8036 ✅ done   |
| ci       | `ci_view_run` (folded into `ci_view_run`'s `runIds` param — LS-9714)             | ✅ done — `runIds` (1-50) on `ci_view_run`                          | Med — inspect N runs per triage                                      | **P1**   | LS-8036 ✅ done   |
| aws      | `aws_lambda_status`                                                              | `aws_lambda_status_batch` (array of fn names)                       | Med — post-deploy verify N lambdas                                   | **P1**   | LS-8037           |
| aws      | `aws_logs_tail`                                                                  | `aws_logs_tail_batch` (array of log groups)                         | Med — debug across N lambdas                                         | **P1**   | LS-8037           |
| worktree | `worktree_commit`                                                                | `worktree_commit_batch` (array of `{ worktree, message }`)          | Med — multi-worktree dispatch                                        | **P1**   | LS-8038 ✅ done   |
| worktree | `worktree_push`                                                                  | `worktree_push_batch` (array of worktrees)                          | Med — push several worktrees after a sweep                           | **P1**   | LS-8038 ✅ done   |
| worktree | `worktree_status`                                                                | `worktree_status_batch` (array of worktrees)                        | Med — board-wide status check                                        | **P2**   | LS-8038 ✅ done   |

> **make / nx / browser / db / dev-process** servers have **no high-priority gaps** — their tools are one-per-session setup,
> long-running single jobs, or already-batched (`make_run` runs one composite target; `nx_run_affected` already fans out
> across affected projects). See per-server sections for rationale.

---

## Already-batched tools (do NOT duplicate)

| Server   | Batched tool                             | Shape                                                                        |
| -------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| jira     | `jira_bulk_create_tickets`               | array of ticket specs → `{ total, succeeded, failed }` (the reference shape) |
| github   | `github_pr_batch_status`                 | array of PR numbers → per-PR status                                          |
| github   | `github_resolve_threads`                 | array of thread IDs                                                          |
| github   | `github_resolve_action_shas`             | array of actions (vs single `github_resolve_action_sha`)                     |
| github   | `github_pr_dashboard` / `github_pr_scan` | already operate over the whole board                                         |
| make     | `terraform_state_mv_batch`               | array of `{ from, to }` moves                                                |
| worktree | `worktree_remove_batch`                  | array of worktrees                                                           |
| worktree | `worktree_run_all`                       | run one command across all worktrees                                         |
| nx       | `nx_run_affected` / `nx_affected`        | fan out across affected projects                                             |

---

## Per-server detail

### jira-server (19 tools) → LS-8034

| Tool                                            | Class          | Notes                                                                       |
| ----------------------------------------------- | -------------- | --------------------------------------------------------------------------- |
| `jira_transition`                               | 🔴 needs-batch | **P0.** Sweeps move N tickets to In Progress/Done.                          |
| `jira_edit_ticket`                              | 🔴 needs-batch | **P0.** Bulk field edits (labels, sprint, parent).                          |
| `jira_set_parent`                               | 🔴 needs-batch | P1 — fold into `jira_edit_batch`.                                           |
| `jira_link_issues`                              | 🔴 needs-batch | P1 — link N blockers in slice/define.                                       |
| `jira_list_children`                            | ✅ batched     | Multi-parent via jira_bulk_list_children; `includeBlockers: true` inline.   |
| `jira_view`                                     | 🔴 needs-batch | P2 — triage reads many tickets.                                             |
| `jira_add_comment`                              | 🔴 needs-batch | P2 — status-stamp N tickets.                                                |
| `jira_bulk_create_tickets`                      | ✅ batched     | Reference implementation.                                                   |
| `jira_create_ticket`                            | ⚪ single-use  | Single creation retained for one-offs.                                      |
| `jira_search`                                   | ✅ batched     | Returns a list already (JQL); `includeBlockers: true` adds blocker state.   |
| `jira_view` (`include: ['transitions']`)        | ⚪ single-use  | Lookup — use jira_view with include instead of former jira_get_transitions. |
| `jira_view` (`include: ['comments']`)           | ⚪ single-use  | Read — use jira_view with include instead of former jira_get_comments.      |
| `jira_check_blockers`                           | ✅ batched     | `keys` accepts 1-50 in one JQL call (LS-9509).                              |
| `jira_delete_ticket`                            | ⚪ single-use  | Rare; could batch later if needed.                                          |
| `jira_get_bucket_epic` / `jira_set_bucket_epic` | ⚪ single-use  | Config.                                                                     |
| `jira_rollover_sync`                            | ⚪ single-use  | Already a bulk operation internally.                                        |
| `jira_auth_status`                              | ⚪ single-use  | Pre-flight.                                                                 |

### github-server (~49 tools) → LS-8035

| Tool                                                                                                                                                                                                                                                                                  | Class          | Notes                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------ |
| `github_merge_pr`                                                                                                                                                                                                                                                                     | 🔴 needs-batch | **P0.** Merge N PRs in a sweep.            |
| `github_rebase_pr` (removed LS-9294; batch variant `github_bulk_rebase` shipped)                                                                                                                                                                                                      | 🔴 needs-batch | **P0.** Rebase the whole open-PR board.    |
| `github_reply_to_review` / `_thread`                                                                                                                                                                                                                                                  | 🔴 needs-batch | **P0.** Reply to N bot-review threads.     |
| `github_edit_pr`                                                                                                                                                                                                                                                                      | 🔴 needs-batch | P1 — bulk relabel/retitle.                 |
| `github_comment_pr`                                                                                                                                                                                                                                                                   | 🔴 needs-batch | P1 — status notes across PRs.              |
| `github_manage_labels`                                                                                                                                                                                                                                                                | 🔴 needs-batch | P1 — cross-PR label ops.                   |
| `github_retrigger_check`                                                                                                                                                                                                                                                              | 🔴 needs-batch | P1 — re-kick CI across stuck PRs.          |
| `github_request_review`                                                                                                                                                                                                                                                               | 🔴 needs-batch | P2.                                        |
| `github_pr_batch_status`                                                                                                                                                                                                                                                              | ✅ batched     |                                            |
| `github_resolve_threads`                                                                                                                                                                                                                                                              | ✅ batched     | array of thread IDs                        |
| `github_resolve_action_shas`                                                                                                                                                                                                                                                          | ✅ batched     | vs single `_sha`                           |
| `github_pr_dashboard` / `github_pr_scan` / `github_list_prs`                                                                                                                                                                                                                          | ✅ batched     | board-wide reads                           |
| `github_mark_pr_ready`, `github_close_pr`, `github_pr_enable_auto_merge`                                                                                                                                                                                                              | ⚪ single-use  | Could batch (P2) but rarely looped > 2–3×. |
| `github_open_pr`                                                                                                                                                                                                                                                                      | ⚪ single-use  | One PR per ticket/worktree.                |
| `github_view_pr`, `github_pr_diff`, `github_pr_commits`, `github_pr_why_blocked`, `github_get_check_runs`, `github_list_*`                                                                                                                                                            | ⚪ single-use  | Reads (batch board-reads already exist).   |
| `github_create_label`, `github_list_labels`, `github_ensure_sweep_labels`, `github_sweep_stale_claims`                                                                                                                                                                                | ⚪ single-use  | Label/maintenance utilities.               |
| `github_secret_*`, `github_secrets_check`, `github_set_commit_status`, `github_list_commit_statuses`, `github_get_branch_protection`, `github_get_repo_info`, `github_get_file_content`, `github_list_runners`, `github_webhook_*`, `github_auth_status`, `github_resolve_action_sha` | ⚪ single-use  | Config/read/auth.                          |

### ci-server (19 tools) → LS-8036 (batching) + LS-9714 (consolidation)

| Tool                                                                             | Class         | Notes                                                                                                                                        |
| -------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci_rerun`                                                                       | ✅ batched    | `runIds` (1-50) param widening, not a separate tool (LS-9714 absorbed the former `ci_rerun_batch`/`ci_rerun_failed_jobs`/`ci_retry_failed`). |
| `ci_view_run`                                                                    | ✅ batched    | `runIds` (1-50) param widening (LS-9714 absorbed the former `ci_view_run_batch`).                                                            |
| `ci_cancel_run`                                                                  | ✅ batched    | `workflow`+`branch` selector mode (LS-9714 absorbed the former `ci_cancel_runs`).                                                            |
| `ci_list_runs`                                                                   | ⚪ single-use | Returns a list.                                                                                                                              |
| `ci_view_run_jobs`, `ci_get_logs`, `ci_search_logs`, `ci_workflow_info`          | ⚪ single-use | Reads.                                                                                                                                       |
| `ci_auto_fix`, `ci_dispatch_workflow`, `ci_workflow_set_state`                   | ⚪ single-use | One-shot orchestration.                                                                                                                      |
| `ci_get_playwright_report`, `ci_get_playwright_test_result`                      | ⚪ single-use | Per-report reads.                                                                                                                            |
| `ci_audit_session_bash`, `ci_find_session`, `ci_session_stats`, `ci_auth_status` | ⚪ single-use | Session/audit/auth.                                                                                                                          |

### aws-server (15 tools) → LS-8037

| Tool                                                                   | Class          | Notes                              |
| ---------------------------------------------------------------------- | -------------- | ---------------------------------- |
| `aws_lambda_status`                                                    | 🔴 needs-batch | P1 — verify N lambdas post-deploy. |
| `aws_logs_tail`                                                        | 🔴 needs-batch | P1 — tail across N lambdas.        |
| `aws_apigateway_inspect`, `aws_terraform_output`, `aws_iam_get_policy` | ⚪ single-use  | Reads.                             |
| `aws_ssm_get`, `aws_ssm_run_command`                                   | ⚪ single-use  | Per-command.                       |
| `aws_secretsmanager_*` (describe/get/list)                             | ⚪ single-use  | `list` already plural; reads.      |
| `aws_sso_status`, `aws_sso_login`                                      | ⚪ single-use  | Auth (login is user-only).         |
| `packer_build`, `packer_build_status`, `packer_build_wait`             | ⚪ single-use  | Long-running single jobs.          |

### worktree-server (45 tools) → LS-8038

| Tool                                                                                                                                                                                                                                                                                                                                                                    | Class         | Notes                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------- |
| `worktree_remove_batch`                                                                                                                                                                                                                                                                                                                                                 | ✅ batched    | reference                                                           |
| `worktree_run_all`                                                                                                                                                                                                                                                                                                                                                      | ✅ batched    | run across all worktrees                                            |
| `worktree_commit_batch`                                                                                                                                                                                                                                                                                                                                                 | ✅ batched    | LS-8038 — array of `{ worktree, message, files?, amend? }`.         |
| `worktree_push_batch`                                                                                                                                                                                                                                                                                                                                                   | ✅ batched    | LS-8038 — array of `{ worktree, setUpstream?, … }`.                 |
| `worktree_status_batch`                                                                                                                                                                                                                                                                                                                                                 | ✅ batched    | LS-8038 — array of worktree identifiers.                            |
| `worktree_commit` / `worktree_push` / `worktree_status`                                                                                                                                                                                                                                                                                                                 | ⚪ single-use | Single-item tools retained for one-off use alongside the batches.   |
| `worktree_list`, `worktree_list_branches`, `worktree_show`, `worktree_log`, `worktree_diff`, `worktree_read`, `worktree_show_file`, `worktree_file_info`, `worktree_ls_tree`, `worktree_reflog`, `worktree_commit_stat`, `worktree_conflict_info`, `worktree_show_commit`, `worktree_show_remote`, `worktree_is_tracked`, `worktree_check_ignore`, `worktree_file_mode` | ⚪ single-use | Reads.                                                              |
| `worktree_run`, `worktree_rebase`, `worktree_rebase_continue`, `worktree_reset`, `worktree_reset_to_remote`, `worktree_stash`, `worktree_stash_pop`, `worktree_resolve_conflict`, `worktree_unstage`, `worktree_set`, `worktree_checkout_file`, `worktree_guard`, `worktree_stabilize`, `worktree_install_recover`, `worktree_set_executable`, `worktree_branch`        | ⚪ single-use | Per-worktree mutations; `worktree_run_all` covers the fan-out case. |
| `worktree_rm`, `worktree_unlink`, `worktree_clean`, `worktree_lock`, `worktree_unlock`, `worktree_attach`, `worktree_rename_branch`, `worktree_rename_session`, `worktree_delete_remote_branch`, `worktree_ping`                                                                                                                                                        | ⚪ single-use | Lifecycle/admin.                                                    |

### make-server (13 tools) — no ticket (no high-priority gaps)

`make_run` already runs one composite target (e.g. `pc`); looping it is rare. `terraform_state_mv_batch` is already batched.
`make_run_status`/`make_run_wait`/`make_ping`/`make_worktree_create`/`make_wt_setup` and the `terraform_*` state tools are
single-shot. **No batch variant warranted** beyond the existing `terraform_state_mv_batch`.

### nx-server (8 tools) — no ticket

`nx_run_affected` / `nx_affected` already fan out across affected projects (the natural "batch"). `nx_run`,
`nx_show_project(s)`, `nx_dep_graph`, `nx_check_package_health`, `nx_install_package` are single-shot. **No gap.**

### browser-server (8 tools) — no ticket

`browser_dev_*`, `browser_navigate`, `browser_screenshot(_upload)`, `browser_dev_login`, `browser_cleanup` are inherently sequential
single-session operations. **No gap.**

### db-admin-server (3 tools) — no ticket

`db_query`, `db_migration_status`, `db_migrate` are one-shot per session; `db_query` already runs arbitrary
multi-statement SQL. **No gap.**

---

## Roll-up

- **Tools inventoried**: 10 servers, ~160 registered tools.
- **Already batched**: 9 tools (the convention models) + 3 worktree batches landed via LS-8038 + 3 ci batches landed via LS-8036/LS-9714 (the latter folded the standalone `*_batch` tools back into param widening).
- **Needs-batch candidates**: 20, concentrated in **jira (7)**, **github (8)**, **aws (2)**, **worktree (3)**.
- **P0 (do first)**: `jira_transition`, `jira_edit_ticket`, `github_merge_pr`, `github_rebase_pr` (removed LS-9294; batch variant `github_bulk_rebase` shipped),
  `github_reply_to_review`, `ci_rerun` — these are the operations agents most often call N-in-a-row during PR/ticket sweeps.
- **No-gap servers**: make, nx, browser, db (their multi-target needs are already covered or inherently single-shot).

This inventory satisfies LS-8032 and gates LS-8033 (convention) + LS-8034–LS-8038 (per-server implementation).
