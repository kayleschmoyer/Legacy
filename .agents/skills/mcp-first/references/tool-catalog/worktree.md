# Worktree MCP Tool Catalog

> GENERATED FILE — DO NOT EDIT.
>
> Source: `tools/mcp/worktree-server/src/{index,lambda}.ts`. Regenerate with 
> `make mcp-api-reference`; CI fails on drift (LS-9701 Tier 2, review pattern #48).
>
> For the interactive, filterable version of this same data across every
> server: [`docs/mcp/api-reference.html`](../../../../../docs/mcp/api-reference.html).

Git worktree lifecycle, branch/commit/push plumbing, and repo-wide git queries for parallel ticket work.

Local stdio process only — not exposed as a hosted connector. 63 tools.

---

### `auth_check_all`

Check workspace auth token presence for all services (GitHub, Jira, AWS, CI). Returns per-service ok/method/hint. Call at the start of any workflow that requires credentials. Never initiates login flows — read-only token presence check only. If allAuthenticated is false, surface the hint for each failing service and stop; never attempt to generate tokens. Pass `sessionToolNames` to also flag a connector absent from your tool roster (LS-9749).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `sessionToolNames` | string[] |  | — | Your current tool names, to detect a service whose MCP server is absent from your roster. |

### `worktree_attach`

Attach an existing branch as a new sibling worktree under D:\code\legacy-sports-worktrees\. Use this when resuming work on an existing PR branch — it runs `git worktree add <path> <branch>`, sets the new worktree as active, and optionally runs `make wt-setup`. MCP alternative to raw `git worktree add` via Bash.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `branch` | string | **required** | — | Existing branch name (e.g. "LS-2857/fix-ci" or "claude/LS-2857-fix-ci"). The branch must already exist locally or on origin. |
| `path` | string |  | — | Explicit worktree path. Defaults to D:\code\legacy-sports-worktrees\<slug> where slug is derived from the branch name by replacing "/" with "-". |
| `setup` | boolean |  | — | If true, run `make wt-setup` after attaching to copy .env, create symlinks, and install git hooks (default: false). Windows-only — ignored on other platforms. |

### `worktree_baseline_setup`

Set up (or tear down) a persistent baseline worktree for an e2e-hold Phase A local comparison against a PR branch: runs `git worktree add`, links node_modules via scripts/modules-pool/link.mjs, and builds the web app (`pnpm exec nx build web`), then returns a ready-to-use worktreePath to pass straight to nx_run_e2e_specs({ worktreePath }). Unlike worktree_run_on_ref (which is one-shot and self-cleaning), the worktree this creates is persistent and keyed by ref — calling it again for the same ref reuses and refreshes it instead of piling up a new checkout. Pass cleanup: true when the comparison is done to remove it.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `ref` | string |  | — | Ref to check out (branch/tag/SHA/remote ref). Default "origin/main". |
| `cleanup` | boolean |  | — | If true, remove the baseline worktree for this ref instead of setting one up (default false). |
| `skipModulesLink` | boolean |  | — | Skip linking node_modules (default false). |
| `skipBuild` | boolean |  | — | Skip the `pnpm exec nx build web` step (default false). |

### `worktree_branch`

Create or switch a local branch within the active worktree's directory — no new worktree/pool slot needed. `action: 'create'` runs `git checkout -b` (off HEAD, or an explicit `from` ref) for a throwaway scratch branch stacked on the active branch, instead of raw git via Bash. `action: 'switch'` runs `git checkout` on an already-existing local branch, e.g. to return to the original branch once a scratch branch is no longer needed. For a brand-new worktree directory on its own branch, use make_worktree_create instead — this tool never creates a new directory.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `branch` | string | **required** | — | action='create': name of the new branch (e.g. "LS-9411/scratch-mobile-proof"); must not be "main" or "origin/main". action='switch': name of the existing local branch to switch to. |
| `action` | string | **required** | — | 'create' to branch and switch; 'switch' to an existing branch. |
| `from` | string |  | — | action='create' only. Ref (branch, tag, or SHA) to base the new branch on. Omit to base on the worktree's current HEAD. |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree. |

### `worktree_check_ignore`

Check whether paths would be ignored by .gitignore rules (git check-ignore -v). Returns per-path results with the matching rule, source file, and line number. Useful when a newly created file silently disappears from git status.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `paths` | string[] | **required** | — | One or more file/directory paths to check (maximum 100). Paths are passed through as provided; only values beginning with `-` are rejected. |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |

### `worktree_checkout_file`

Restore files to a ref, or resolve conflicts. Alias: paths/path.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `files` | string[] |  | — | File paths |
| `strategy` | string |  | — | Conflict resolution strategy |
| `ref` | string |  | — | Restore ref (default: HEAD) |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |

### `worktree_clean`

Remove a worktree safely (symlink-aware). Uses `twig worktree remove` to avoid destroying shared symlinks. Clears active worktree if it was the one removed.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |
| `prune` | boolean |  | — | Also run `twig worktree clean` to prune stale references (default: true) |
| `force` | boolean |  | — | Fall back to `git worktree remove --force` if twig times out or fails. Removes symlinks first to avoid deleting through them. (default: false) |

### `worktree_commit`

Stage and commit. Pass `files` (string or string[]) to stage only specific paths (default: all). Refuses main. Refuses .env/credentials. Supports amend. Pass `resetAuthor: true` with `amend: true` to run `--reset-author` (fixes commit author in cloud sessions). Pass `addAll: true` with `amend: true` (and no `files`) to fold newly-added untracked files into the amended commit (git add -A instead of the default tracked-only git add -u); alternatively pass `files` explicitly for surgical control over exactly which untracked paths to include. Pass `allowEmpty: true` to permit a commit with no staged changes. Auto-appends Co-Authored-By, unless the message already has one or `skipAutoTrailer: true` is passed.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `message` | string |  | — | Conventional format: type(scope): description |
| `files` | string \| string[] |  | — | Files to stage. When provided, ONLY these files are staged (staging area is cleared first). When omitted, new commits stage all changes including untracked files (git add -A), while amend stages only tracked changes (git add -u, after clearing the index) to avoid pulling in untracked files. |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |
| `worktreeKey` | string |  | — | Alias for worktree. Ticket key, absolute path, or omit for active worktree |
| `worktreeId` | string |  | — | Alias for worktree. Ticket key, absolute path, or omit for active worktree |
| `amend` | boolean |  | — | Amend previous commit. If message is provided, replaces the commit message; otherwise uses --no-edit. |
| `resetAuthor` | boolean |  | — | When combined with amend: true, passes --reset-author to git commit. Use this in cloud sessions to fix the commit author (git config user.email + --reset-author). Has no effect without amend: true. |
| `addAll` | boolean |  | — | When combined with amend: true and no explicit files, stages tracked-modified AND untracked files (git add -A) before amending, instead of the default tracked-only git add -u — use this to fold newly-added files into the amended commit without enumerating every path. Has no effect without amend: true, and is ignored whenever files is provided (files already stages exactly the given paths, tracked or untracked — use it instead of addAll for surgical control). Default: false, preserving today's tracked-only amend behavior. |
| `allowEmpty` | boolean |  | — | Pass --allow-empty to git commit, permitting a commit with no staged changes (e.g. an empty files list or a clean tree). Default: false. Use to retrigger CI, unstick a reviewer-bot cycle, or republish a changelog-only commit. |
| `skipAutoTrailer` | boolean |  | — | Skip the auto-appended Co-Authored-By trailer. Auto-skipped already when `message` contains a Co-Authored-By:/Claude-Session: line. |

### `worktree_commit_batch`

Commit across multiple worktrees in one call. Each item is processed independently with worktree_commit semantics (refuses main, refuses .env/credentials, auto-appends Co-Authored-By). Failures do not stop remaining items. Returns { total, succeeded, failed } per LS-8033 shared convention.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `items` | object[] | **required** | — | Per-worktree commit specs (max 50). Each item accepts the same fields as worktree_commit: worktree (ticket key, path, or branch), message, files, amend, resetAuthor, addAll, skipAutoTrailer. |

### `worktree_commit_stat`

Structured JSON stat for a single commit: author, date, subject, per-file insertions/deletions with status (A/M/D/R/C), and totals. Use this instead of `git show <ref> --stat` shell calls when you need a machine-readable file list (e.g. "what files did this commit touch?"). Prefer over worktree_show_commit with stat:true when structured output is needed.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `ref` | string |  | — | Commit SHA, HEAD, HEAD~N, or any git rev (default: HEAD) |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |

### `worktree_conflict_info`

List conflicted files with line ranges and previews.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |

### `worktree_delete_remote_branch`

Delete a remote branch via `git push origin --delete <branch>`. Refuses to delete main or origin/main. Use this to clean up accidentally-pushed branches that have no open PR.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `branch` | string | **required** | — | Remote branch name to delete (e.g. "claude/LS-1234-my-branch"). Do not include the "origin/" prefix. |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |

### `worktree_diff`

Git diff against a base ref (default: origin/main). Supports stat/name-only. Pass staged:true to show staged changes (git diff --cached).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |
| `base` | string |  | — | Base ref (default: origin/main). Ignored when staged is true. |
| `paths` | string[] |  | — | Path filter — string or string[]. Alias: "files" (either name works; providing both is an error). |
| `files` | string \| string[] |  | — | Alias for "paths" — string or string[]. Providing both "paths" and "files" is an error. |
| `stat` | boolean |  | — | Diffstat only |
| `nameOnly` | boolean |  | — | File names only |
| `staged` | boolean |  | — | Show staged changes only (git diff --cached / index vs HEAD). When true, the base ref is ignored. |

### `worktree_fetch`

Fetch from a remote (git fetch [remote] [branch]). Returns the list of updated refs and whether the remote was already up to date. Use this instead of worktree_run(command: "git fetch origin") when you need up-to-date remote refs before a merge-base check, ancestor comparison, or any operation that reads origin/* refs. Typical use: fetch before worktree_status() to get accurate ahead/behind counts, or before worktree_run(command: "git merge-base --is-ancestor origin/main HEAD"). If a merge-base check fails with "unrelated histories" or comes back empty, the worktree is likely a shallow clone — pass `deepen` (e.g. 200) instead of falling back to a raw `git fetch --deepen`/`git rev-parse --is-shallow-repository` via Bash.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `remote` | string |  | — | Remote name (default: "origin"). |
| `branch` | string |  | — | Specific branch or refspec to fetch (e.g. "main" or "refs/heads/main"). Omit to fetch all branches from the remote. |
| `deepen` | number |  | — | Deepen a shallow clone by this many additional commits (`git fetch --deepen=<n>`). Use when a merge-base check against origin/main fails or returns nothing. 200 covers typical PR depths. |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree. |

### `worktree_file_info`

Get metadata for one or more paths (files or directories). Always reports: exists, isFile, isDirectory, isSymlink, isJunction (Windows only), linkTarget (when isSymlink). For regular files ≤10MB also reports bytes, lines, and approxTokens; files >10MB get bytes only. Use this instead of `ls`, `dir`, `Test-Path`, or `Get-ChildItem` to detect whether node_modules is a junction, a real directory, or missing.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `paths` | string[] | **required** | — | One or more file paths (max 100). Relative paths are resolved against the worktree root; absolute paths are used as-is. |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree. Used as the root for relative paths. |

### `worktree_file_mode`

Read the git index mode (100644 or 100755) of one or more tracked paths (git ls-files -s). Answers "is this file executable in the index?" without falling back to raw `git ls-files -s` via Bash. Paths not tracked by git are reported with tracked: false rather than erroring.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `paths` | string[] | **required** | — | One or more file paths to check (maximum 100). Relative to the worktree root. |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |

### `worktree_guard`

Check if a path is inside the main repo and warn.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `path` | string | **required** | — | Path to check |

### `worktree_install_recover`

Recover from a broken pnpm installation in a worktree that has an independent node_modules (not a symlink). Runs the idempotent recovery sequence: (1) kill-stale to release file locks, (2) sweep orphan *_tmp_* directories that block reinstalls, (3) retry pnpm install up to 3 times, removing EPERM/ENOTEMPTY/EBUSY offenders on each failure, (4) if still failing, escalate to pnpm install --force. Returns structured result with attempts made, paths cleaned, and final node_modules state. Do NOT use on symlinked node_modules — run `node scripts/modules-pool/link.mjs` to recreate the symlink instead.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree. |
| `force` | boolean |  | — | Start with pnpm install --force instead of a normal install. Useful when prior recovery attempts have already cleared orphan dirs. |

### `worktree_is_tracked`

Check whether one or more paths are tracked by git (i.e. recorded in the index). Answers the "is this committed source or a build artifact?" question without falling back to `git ls-files <path>` via Bash. Returns tracked/ignored status and file size in one call.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `paths` | string[] | **required** | — | One or more file paths to check (maximum 100). Relative to the worktree root. |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |

### `worktree_job_list`

List recent background jobs (newest first), including jobs started by a previous MCP server process. Use after a session resume or lost tool result to recover a job handle instead of re-running the command.

_No parameters._

### `worktree_job_status`

Cheap, instant snapshot of a background job started by worktree_run or worktree_run_all. Returns { status, elapsedSec, logTail } while running (never an error), or the final output once done. Use worktree_job_wait to block until completion.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `jobId` | string | **required** | — | Job ID returned by a { status: "running" } result |

### `worktree_job_wait`

Wait for a background job to finish, bounded at 55s per call (stays under the MCP transport timeout). If the job is still running when the wait expires, returns a { status: "running" } snapshot with logTail — re-invoke to continue waiting. Never re-run the underlying command while a job is in progress.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `jobId` | string | **required** | — | Job ID returned by a { status: "running" } result |
| `maxWaitMs` | number |  | integer, min 1, max 55000 | Max wait per call in ms (default and cap: 55000) |

### `worktree_list`

List active worktrees with symlink status and branch info. Pass remote=true to list remote branches instead (with optional pattern or merged-into-ref filters and ahead/behind counts).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `remote` | boolean |  | — | List remote branches instead of local worktrees (default: false) |
| `pattern` | string |  | — | Glob pattern to filter results (e.g. "*LS-193*"). Remote: branch names. Local: branch/key/path — plain text substrings, "*"/"?" globs the full value. |
| `merged` | string |  | — | Only include remote branches merged into this ref (e.g. "origin/main"). Only used when remote=true. Equivalent to `git branch -r --merged <ref>`. |
| `limit` | number |  | — | Max results (default: 50 remote, 20 local). |
| `nodeModulesFilter` | string |  | — | Local only: "stale" = no node_modules (abandoned); "active" = has node_modules. |

### `worktree_list_branches`

List local and/or remote-tracking branches with metadata (type, current-branch marker). Supports substring or regex filtering via the `filter` parameter. Use this to check whether a branch for a given Jira ticket key already exists (e.g. filter: "LS-2955") before creating a new worktree, or to verify no open branches reference a ticket.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `filter` | string |  | — | Substring or JavaScript regex pattern to filter branch names. Examples: "LS-2955" (substring), "^claude/" (regex prefix). Omit to return all branches. |
| `remote` | boolean |  | — | Include remote-tracking branches (default: true). Remote branches are listed as "origin/<name>". |
| `local` | boolean |  | — | Include local branches (default: true). |

### `worktree_lock`

Acquire an advisory lock on a worktree for multi-agent coordination. Signals to other agents that the worktree is in use so they should avoid modifying it concurrently. Locks have a TTL and are automatically cleaned up when stale.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |
| `agent` | string |  | — | Agent identifier (e.g. session ID, agent name). Defaults to "claude-session". |
| `task` | string |  | — | Human-readable description of what the agent is doing (optional). |
| `ttl` | number |  | — | Lock TTL in seconds (default: 7200 = 2 hours). Lock expires after this period. |
| `force` | boolean |  | — | Force-acquire even if another agent holds the lock (default: false). |

### `worktree_log`

Structured commit log as JSON.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |
| `maxCount` | number |  | — | Max commits (default: 20) |
| `path` | string |  | — | File path filter |
| `range` | string |  | — | Commit range |
| `since` | string |  | — | Only show commits more recent than this date. Accepts any format `git log --since` accepts (e.g. "2026-04-03 15:00", "2.weeks.ago", ISO 8601). Combine with `until` to bracket a window. |
| `until` | string |  | — | Only show commits older than this date. Accepts any format `git log --until` accepts. Combine with `since` to bracket a window. |
| `searchString` | string |  | — | Pickaxe search (`git log -S`). Only show commits whose diff adds or removes the literal string. Combine with `path` to scope to a single file. Example: searchString="playwright_version" answers "when did this constant first appear?". |
| `searchRegex` | string |  | — | Generalized pickaxe (`git log -G`). Like `searchString` but the value is treated as a regular expression. Mutually compatible with `searchString` (both forwarded to git, but typically use one at a time). |
| `file` | string |  | — | Restrict log to commits that touched this file path (maps to `git log -- <file>`). Alias for `path` — use either; `file` takes precedence when both are provided. Example: file="apps/web/src/pages/Login.tsx" answers "which commits last modified this file?". |
| `grep` | string |  | — | Filter commits whose message matches this pattern (maps to `git log --grep=<pattern>`). Useful for finding commits by Jira ticket key, e.g. grep="LS-2433". The pattern is matched case-insensitively against the full commit message. |
| `stat` | boolean |  | — | Include per-commit file change stats. Each entry in the `files` array has `path`, `status` (A=added, M=modified, D=deleted, R=renamed, C=copied), `insertions`, and `deletions`. Use maxCount=1 + stat=true as a replacement for `git show --stat HEAD` or `git diff HEAD~1 HEAD --name-status`. |

### `worktree_ls_tree`

List files at a git ref without checkout (git ls-tree).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `ref` | string |  | — | Git ref to list from (default: "HEAD"). Accepts any rev: branch, tag, or SHA. |
| `path` | string |  | — | Directory path (relative to root) |
| `recursive` | boolean |  | — | Recursive (default: true) |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |

### `worktree_merge_main`

Semantic one-shot merge: fetch origin/main → merge it into the current branch → push. Complements worktree_rebase_onto_main for the merge-resolution path AGENTS.md sanctions for PR merge-conflict notices ("merge the base branch ... into your PR head — or rebase"). On conflict, leaves the merge in progress (does not abort) and returns the same structured conflict info worktree_conflict_info provides (conflicted file list + marker locations) — resolve, then worktree_commit + worktree_push, or worktree_run(command: "git merge --abort") to back out. Refuses to operate on the main branch. `dryRun: true` — see that param.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree. |
| `from` | string |  | — | Branch to merge from (default: "main"). |
| `pushTimeoutMs` | number |  | — | Timeout for git push in milliseconds (default: 120000). |
| `dryRun` | boolean |  | — | No mutation: report mergeable/conflicted + conflicting files (default: false). |

### `worktree_mv`

Move or rename one or more tracked files (git mv), preserving rename detection so the diff shows R instead of a delete+add pair. Creates intermediate directories in the destination path since git mv does not. Refuses paths outside the worktree root, .git/, or node_modules/. Accepts multiple { from, to } pairs in one call for batch moves (e.g. moving a source file and its spec together).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `moves` | object[] | **required** | — | One or more { from, to } path pairs to move/rename (maximum 50 per call). |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree. |

### `worktree_ping`

Check connectivity and state of the worktree server. Returns git version, main repo path, active worktree, and total worktree count. Use this to verify the server is running correctly before using other worktree_* tools.

_No parameters._

### `worktree_push`

Push with --force-with-lease. Refuses main.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |
| `worktreeKey` | string |  | — | Alias for worktree. Ticket key, absolute path, or omit for active worktree |
| `worktreeId` | string |  | — | Alias for worktree. Ticket key, absolute path, or omit for active worktree |
| `setUpstream` | boolean |  | — | Set upstream (-u). Also accepts string "true"/"false"/"1"/"0" (MCP framework coercion). |
| `skipLint` | boolean |  | — | Set SKIP_PREPUSH_LINT=1 before pushing. Use when pnpm virtual store is absent and the pre-push formatter hook fails. Also accepts string "true"/"false"/"1"/"0" (MCP framework coercion). |
| `remoteBranch` | string |  | — | Push to this remote branch name instead of the local branch name. Must contain an LS-#### Jira key; pushes are refused otherwise. Providing remoteBranch also implies upstream is set (-u). ⚠️ Do NOT use this in native ephemeral (launcher-checkbox) sessions — local/remote name mismatch confuses PR association in the Claude Code UI (anthropics/claude-code#18690). Jira linking for native ephemeral sessions is done via PR title and commit messages containing LS-####, not the branch name. See .agents/skills/worktree-workflow/references/branch-naming.md. |
| `timeoutMs` | number |  | — | Timeout in milliseconds for the git push subprocess (default: 120000). Increase when pre-push hooks run slow checks (e.g. terraform validate, pnpm format) that exceed the default. |
| `fetchFirst` | boolean |  | — | — |

### `worktree_push_batch`

Push multiple worktrees in one call with --force-with-lease. Each item is processed independently with worktree_push semantics (refuses main). Failures do not stop remaining items. Returns { total, succeeded, failed } per LS-8033 shared convention.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `items` | object[] | **required** | — | Per-worktree push specs (max 50). Each item accepts the same fields as worktree_push: worktree (required), setUpstream, skipLint, remoteBranch, timeoutMs, fetchFirst. |

### `worktree_read`

Read the contents of any file on the local filesystem by absolute path. Use this for files outside the project directory (e.g. /tmp, ~/Downloads, C:\\Users\\...). For files inside the project directory, the built-in Read tool is preferred. Supports optional line ranges (startLine/endLine) and grep filtering.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `path` | string | **required** | — | Absolute path to the file to read (e.g. "/tmp/extracted/design.md" or "C:\\Users\\user\\Downloads\\handoff.txt"). |
| `startLine` | number |  | integer, min 1 | First line to return (1-based, inclusive). Omit to return the full file. |
| `endLine` | number |  | integer, min 1 | Last line to return (1-based, inclusive). Requires startLine. |
| `grep` | string |  | — | Optional JavaScript RegExp source string. When provided, only matching lines (with line numbers) are returned. Mutually exclusive with startLine/endLine. |
| `maxMatches` | number |  | integer, min 1, max 500 | Max number of matched lines to return when `grep` is provided (default: 50, max: 500). |

### `worktree_rebase`

Fetch and rebase onto parent. Accepts an optional 'base' parameter to rebase onto an explicit branch (e.g. 'origin/main') when the branch has no twig parent registered. Run worktree_stabilize after rebasing, before pushing.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |
| `abort` | boolean |  | — | Abort in-progress rebase |
| `skip` | boolean |  | — | Skip current commit in rebase |
| `base` | string |  | — | Explicit git ref or commit-ish to rebase onto, e.g. 'origin/main' or 'HEAD~3'. Defaults to twig parent if omitted; falls back to 'origin/main' if twig has no parent registered. Cannot be combined with 'abort' or 'skip'. |
| `disableRerere` | boolean |  | — | Disable rerere (reuse recorded resolution) for this rebase. Pass true when a bad rr-cache entry is causing conflict markers to be silently committed. |

### `worktree_rebase_continue`

Continue rebase after resolving conflicts.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `files` | string \| string[] |  | — | Files to stage (default: all) |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |

### `worktree_rebase_onto_main`

Semantic one-shot rebase: fetch origin/main → rebase current branch onto it → push with --force-with-lease. Replaces the three-step worktree_fetch → worktree_rebase(base: "origin/main") → worktree_push sequence. Pass `upstream` for the `--onto` 3-arg form after a squash-merged stacked base (see worktree-workflow skill). Aborts and reports if conflict markers are detected post-rebase rather than pushing a broken state. Refuses to operate on the main branch.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree. |
| `onto` | string |  | — | Branch to rebase onto (default: "main"). |
| `upstream` | string |  | — | Old base head to replay from — enables `git rebase --onto <onto> <upstream>`. Omit for a plain rebase onto `onto`; see worktree-workflow skill for when to set this. |
| `disableRerere` | boolean |  | — | Disable git rerere during the rebase (set rerere.enabled=false). Use when a bad rr-cache entry is causing silent conflict-marker commits. |
| `pushTimeoutMs` | number |  | — | Timeout for git push in milliseconds (default: 120000). |

### `worktree_reflog`

Show the reflog for a worktree — all HEAD movements including commits removed by reset --hard, amend, and rebase. Use this to recover SHAs after destructive operations (reset --hard, bad rebase, accidental amend). Prefer this over `git reflog` shell calls. Substitutes: `git reflog` → `worktree_reflog()`, `git reflog | head -20` → `worktree_reflog({ limit: 20 })`.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `limit` | number |  | — | Max reflog entries to return (default: 20, max: 100) |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |

### `worktree_remove_batch`

Remove multiple worktrees in one call using `twig worktree remove`. Symlink-aware — safer than `git worktree remove`. Use for bulk sweep pruning. Each worktree entry is processed independently; failures do not stop remaining removals.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktrees` | string[] | **required** | — | Worktrees to remove. Each entry can be a ticket key (e.g. "LS-1234"), branch name (e.g. "LS-1234/foo"), directory name, or absolute path. Maximum 100. |
| `force` | boolean |  | — | Fall back to `git worktree remove --force` (with symlink removal first) when twig fails. Default: false. |

### `worktree_rename_branch`

Rename the current branch in the active (or specified) worktree. Use this after `jira_create_ticket` returns the LS key to rename the auto-generated `claude/<random>` branch to `claude/LS-####-description` before the first push (AGENTS.md Step 4b). MCP alternative to `git branch -m <newName>` via Bash.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `newName` | string | **required** | — | New branch name. Must contain an LS-#### Jira key (e.g. "claude/LS-2994-add-rename-tool"). Must not be "main" or "origin/main". |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree. |

### `worktree_rename_session`

Set the display title for the current Claude Code session. Appends a custom-title entry to the session JSONL so the session appears with the given title in /resume and the session list. Call after jira_view to set the title to "LS-#### <ticket summary>". Safe to call multiple times — the last title wins.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `title` | string | **required** | — | New session title (e.g. "LS-3052 feat(skills): add session rename"). Must be non-empty. |
| `worktree` | string |  | — | Ticket key or absolute path whose session to rename. Omit to use the active worktree (or main repo if none active). |

### `worktree_rerere_forget`

Clear the cached rerere resolution for one or more files, for recovery when rerere has stored a bad resolution during a rebase/merge conflict. If a file no longer has conflict markers (rerere already auto-applied its resolution), it is reset to the conflicted state first (`git checkout --merge`) before forgetting — this is the default, unconditional behavior, since it is the only safe way to clear rerere for an already-resolved file. Never throws on partial failure; returns { cleared, failed } per-file so recovery can continue with manual conflict resolution.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `paths` | string \| string[] | **required** | — | File path(s) to clear the rerere cache for. |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |

### `worktree_reset`

Reset HEAD to a specific commit SHA (git reset). Safety: refuses main branch and only allows resetting to ancestor SHAs (commits reachable from HEAD) to prevent accidental data loss. Typical use: strip a stray commit and restore the branch before force-pushing with worktree_push.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `sha` | string | **required** | — | Target commit SHA to reset to. |
| `mode` | string |  | — | Reset mode (default: 'hard'). 'hard' resets index and working tree. 'soft' moves HEAD only, leaving changes staged. 'mixed' resets index but leaves working tree unchanged. |
| `force` | boolean |  | — | Skip the dirty-worktree check for --hard resets. Default false (refuses if uncommitted changes exist); true discards them. |
| `allowNonAncestor` | boolean |  | — | Default false. If true, allow non-ancestor sha in reflog. |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |

### `worktree_reset_to_remote`

Hard-reset the current branch to its remote tracking ref (git reset --hard origin/<branch>). Use this to recover from a corrupted local rebase — e.g. committed conflict markers, stacked duplicate commits, or rerere auto-resolve failures — by discarding all local history and returning to the clean remote state. Safety: refuses main/master branches; requires force: true when the working tree is dirty. Abandoned local commits remain reachable via git reflog.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `remote` | string |  | — | Remote name (default: "origin"). The remote whose tracking ref will be used as the reset target. |
| `branch` | string |  | — | Branch name to reset to on the remote (default: current tracking branch). E.g. "main" or "claude/my-feature". Omit to use the current branch's upstream. |
| `force` | boolean |  | — | Skip the dirty-worktree safety check. When false (default), refuses to reset if there are uncommitted working tree changes. Pass true to discard them. |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |

### `worktree_resolve_conflict`

List conflicted files or resolve them with per-file strategies. Without resolutions, returns conflict details.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `resolutions` | object[] |  | — | Per-file resolution strategies. Omit to list conflicted files. |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |

### `worktree_rm`

Delete a file or directory from a worktree. Refuses to delete paths outside the worktree root, .git/, or node_modules/. Use for removing accidentally created files, duplicates, or generated outputs before regeneration.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `path` | string | **required** | — | Path relative to the worktree root (e.g. "scratch/debug.ts", "apps/web/old-component.tsx"). |
| `recursive` | boolean |  | — | Allow deleting non-empty directories. Default: false. |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree. |

### `worktree_run`

Run a command in the active worktree. Refuses main repo unless overridden. Use this only for git operations that have no dedicated worktree_* tool: git merge-base, git cherry-pick, git tag, git add <file> after manual conflict resolution. For all other operations prefer the purpose-built tools: worktree_fetch (git fetch), worktree_stash/worktree_stash_pop (git stash), worktree_unstage (git reset HEAD --), worktree_rm (git rm / file deletion), worktree_mv (git mv), worktree_is_tracked (git ls-files), worktree_check_ignore (git check-ignore), worktree_file_mode / worktree_set_executable (git ls-files -s / git update-index --chmod), worktree_commit (git add + commit), worktree_push (git push), worktree_status (git status), worktree_diff (git diff), worktree_reset (git reset), worktree_reflog (git reflog). Fast commands return their output in one call. A command still running after ~45s returns { status: "running", jobId } instead of blocking into the ~60s MCP transport timeout — call worktree_job_wait({ jobId }) to continue waiting; do NOT re-run the command (LS-8559). A 120s process-level cap still applies — prefer nx_run_pc_chunk / make_run / nx_run for long-running work (make pc, builds, installs).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `command` | string | **required** | — | Shell command |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |
| `allowMainRepo` | boolean |  | — | Allow main repo |
| `tailLines` | number |  | integer, min 0 | Cap output to the last N lines. Use 0 for no truncation. A header showing the omitted line count is prepended. |

### `worktree_run_all`

Run a make target across all active worktrees and report pass/fail per worktree. Useful for batch validation (e.g. format:write, lint, typecheck, pc) across all in-flight branches. Each worktree runs as a background job: a batch finishing within ~45s returns the full summary in one call; a longer batch returns { status: "running" } with per-worktree jobIds — poll with worktree_job_wait({ jobId }) / worktree_job_status while the batch continues in the background; do NOT re-run worktree_run_all (LS-8559).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `command` | string | **required** | — | Make target to run (e.g. "format:write", "lint", "lint-fix", "typecheck", "pc", "build", "test", "codegen", "format:check"). |
| `filter` | string |  | — | Filter worktrees by ticket prefix (e.g. "LS-16"). Matches against key or branch. |
| `parallel` | boolean |  | — | Run in parallel vs sequential. Default: false (sequential). |
| `maxConcurrency` | number |  | — | Max parallel workers when parallel=true. Default: 4. |
| `timeoutSeconds` | number |  | — | Override per-target timeout in seconds. Defaults: pc=600, install/build/test/codegen=900, others=300. |

### `worktree_run_long`

Run an ad-hoc command in a specific worktree without the 120s process-level cap that worktree_run enforces. Use this for long (>120s) untargeted commands that have no dedicated nx target — e.g. a full, unfiltered `npx jest --no-coverage` run (not the project's configured test target, which may filter to changed files only) — especially when the command needs to run in a worktree other than the caller's active one. Prefer worktree_run for short commands and nx_run_pc_chunk / make_run / nx_run for commands that map to a project's configured target; reach for this tool only when neither fits. Same background job/poll pattern as worktree_run: a command finishing within ~45s returns its output inline; a longer command returns { status: "running", jobId } to poll via worktree_job_wait({ jobId }) / worktree_job_status — do NOT re-run the command while a job is in progress (LS-8602).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `command` | string | **required** | — | Shell command |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |
| `allowMainRepo` | boolean |  | — | Allow main repo |
| `tailLines` | number |  | integer, min 0 | Cap output to the last N lines. Use 0 for no truncation. A header showing the omitted line count is prepended. |
| `timeoutSeconds` | number |  | — | — |

### `worktree_run_on_ref`

Run a command against a throwaway detached checkout of a ref (default origin/main), auto-linking node_modules and auto-cleaning up. Use to check whether a failure is pre-existing on the base branch, independent of this PR's diff. Not for ticket development — prefer worktree_run/worktree_attach for that.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `command` | string | **required** | — | Shell command to run against the ref checkout |
| `ref` | string |  | — | Ref to check out (branch/tag/SHA/remote ref). Default "origin/main". |
| `skipModulesLink` | boolean |  | — | Skip linking node_modules (default false). |
| `timeoutSeconds` | number |  | max 300 | Command timeout in seconds (default 180, max 300). |

### `worktree_set`

Set the active worktree for subsequent commands.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `key` | string |  | — | Ticket key, number, branch name, directory name, or absolute path to a git worktree (including ephemeral .claude/worktrees/ paths) |
| `worktreeKey` | string |  | — | Alias for key. Ticket key, number, branch name, directory name, or absolute path to a git worktree |
| `worktree` | string |  | — | Alias for key. Ticket key, number, branch name, directory name, or absolute path to a git worktree |

### `worktree_set_executable`

Set or clear the executable bit on a tracked file's git index mode (git update-index --chmod=+x|-x). MCP alternative to running `git update-index --chmod` via Bash. The path must already be tracked (commit or stage it first) — git update-index --chmod fails on untracked paths.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `path` | string | **required** | — | File path to modify. Relative to the worktree root. |
| `executable` | boolean | **required** | — | true to set the executable bit (100755), false to clear it (100644). |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |

### `worktree_show`

Show commit metadata, stat summary, and optional filtered diff.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `sha` | string | **required** | — | Commit SHA or HEAD |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |
| `path` | string |  | — | File path for filtered diff |

### `worktree_show_commit`

Read the diff introduced by a specific commit-ish. Use `stat: true` for a file-change summary (like `git show <ref> --stat --oneline`). Provide `path` to restrict output to a single file's diff. Without either flag, returns the full commit diff. Prefer this over raw `git show` shell calls during commit reconnaissance. `ref` is the preferred parameter name (matches worktree_show_file / worktree_commit_stat / worktree_show_remote); `sha` is retained as a back-compat alias and wins if both are provided. Provide one of the two.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `ref` | string |  | — | Commit SHA, HEAD, HEAD~N, or any git rev (preferred). Ignored if `sha` is also provided. |
| `sha` | string |  | — | Commit SHA, HEAD, HEAD~N, or any git rev. Back-compat alias for `ref` — takes precedence if both are provided. |
| `path` | string |  | — | Optional file path to restrict the diff to a single file |
| `stat` | boolean |  | — | When true, return a stat summary only (--stat --oneline) instead of the full diff |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |

### `worktree_show_file`

Read the contents of a file at a specific git ref (branch, tag, SHA, or special ref) without checking it out. Runs `git show <ref>:<path>`. Defaults to HEAD when `ref` is omitted. Use cases: (1) CI triage — inspect files on remote branches; (2) rebase conflict resolution — read what origin/main or FETCH_HEAD has before deciding which side to keep; (3) debugging — compare a file at HEAD vs a prior commit. Prefer this tool over `git show` shell commands — it uses execFileSync (args array) and works correctly on Windows where `git show ref:path` shell quoting fails.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `ref` | string |  | — | Git ref: branches, local or fetched remote-tracking ("origin/main"; unfetched, use worktree_show_remote), SHAs, relative refs ("HEAD~1"), special refs ("FETCH_HEAD", "ORIG_HEAD", "REBASE_HEAD"). Default "HEAD". |
| `path` | string | **required** | — | File path relative to repo root (e.g. "lib/db-client/src/schema.ts"). |
| `worktree` | string |  | — | Optional ticket key. Uses active worktree if omitted, falls back to main repo if no active worktree is set. |
| `startLine` | number |  | integer, min 1 | First line to return (1-based, inclusive). Omit to return the full file. |
| `endLine` | number |  | integer, min 1 | Last line to return (1-based, inclusive). Requires startLine. Defaults to startLine when omitted. |
| `grep` | string |  | — | Optional JavaScript RegExp source string passed to `new RegExp(pattern)`. Provide only the pattern text (for example, `foo.*bar`), not a slash-delimited literal like `/foo.*bar/`, and flags such as `i` or `m` are not supported by this parameter. When provided, only matching lines (with line numbers) are returned instead of the full file. Use this for large files where you know what to look for. Mutually exclusive with `startLine`/`endLine`. |
| `maxMatches` | number |  | integer, min 1, max 500 | Max number of matched lines to return when `grep` is provided (default: 50, max: 500). |
| `outputPath` | string |  | — | Absolute path to write raw bytes to instead of returning content (metadata-only response). Must be under worktree root or OS temp dir. Exclusive with `grep`/`startLine`/`endLine`. |

### `worktree_show_remote`

Read a file from a remote branch without needing a worktree. Auto-fetches the remote ref first, then reads the file via `git show`. Useful for inspecting files on PR branches before deciding whether to create a worktree.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `ref` | string | **required** | — | Remote ref to read from (e.g. "origin/LS-1901/ci-dispatch-workflow"). If no remote prefix is given, "origin/" is prepended automatically. |
| `path` | string | **required** | — | File path relative to repo root (e.g. "tools/mcp/ci-server/src/tools/dispatch-workflow.ts"). |
| `lines` | string |  | — | Optional line range to return (e.g. "1-30", "50-100"). Returns the full file if omitted. |
| `grep` | string |  | — | Optional JavaScript RegExp pattern. When provided, only matching lines (with line numbers) are returned instead of the full file. Use this for large files where you know what to look for. Mutually exclusive with `lines`. |
| `maxMatches` | number |  | integer, min 1, max 500 | Max number of matched lines to return when `grep` is provided (default: 50, max: 500). |

### `worktree_stabilize`

Post-rebase stabilization: install, db:print-schema, codegen. Must run BEFORE push.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |

### `worktree_stash`

Temporarily shelve uncommitted changes in the working directory. Equivalent to `git stash push -u -m <message>` (includes untracked files). Use before running baseline tests to verify whether failures are pre-existing (i.e. present before your changes), then restore with worktree_stash_pop.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `message` | string |  | — | Optional label for the stash entry (shown in git stash list output). |
| `worktree` | string |  | — | Optional ticket key (e.g. 'LS-1134'). Uses active worktree if omitted. |

### `worktree_stash_pop`

Restore the most recently stashed changes. Equivalent to `git stash pop`. Use after running baseline tests with worktree_stash to restore your in-progress work.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktree` | string |  | — | Optional ticket key (e.g. 'LS-1134'). Uses active worktree if omitted. |

### `worktree_status`

Structured git status: files, branch, ahead/behind, rebase/conflict state.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |
| `worktreeKey` | string |  | — | Alias for worktree. Ticket key, absolute path, or omit for active worktree |

### `worktree_status_batch`

Get git status for multiple worktrees in one call. Each entry is processed independently with worktree_status semantics. Returns { total, succeeded, failed } per LS-8033 shared convention; successful entries include the parsed status payload (branch, modified, staged, untracked, conflicted, ahead, behind, etc.).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktrees` | string[] | **required** | — | Worktrees to inspect (max 50). Each entry can be a ticket key, absolute path, directory name, or branch name. Required — batch calls cannot fall back to the active worktree. |

### `worktree_unlink`

Remove node_modules symlink so worktree gets independent deps via make install.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |

### `worktree_unlock`

Release an advisory lock on a worktree. Any agent can release any lock (locks are advisory, not enforced).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktree` | string |  | — | Ticket key, absolute path, or omit for active worktree |

### `worktree_unstage`

Remove files from the git staging area (index) without losing changes. Equivalent to `git reset HEAD -- <files>`. Use to unstage accidentally added files.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `files` | string \| string[] | **required** | — | File paths to unstage (relative to repo root). Use ["."] to unstage all. |
| `worktree` | string |  | — | Optional ticket key (e.g. 'LS-1134'). Uses active worktree if omitted. |

