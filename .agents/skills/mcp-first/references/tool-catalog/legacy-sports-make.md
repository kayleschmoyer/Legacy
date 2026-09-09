# Make MCP Tool Catalog

> GENERATED FILE — DO NOT EDIT.
>
> Source: `tools/mcp/make-server/src/{index,lambda}.ts`. Regenerate with 
> `make mcp-api-reference`; CI fails on drift (LS-9701 Tier 2, review pattern #48).
>
> For the interactive, filterable version of this same data across every
> server: [`docs/mcp/api-reference.html`](../../../../../docs/mcp/api-reference.html).

Whitelisted Makefile targets, the pre-commit (pc) pipeline and its chunks, PR validation, and Terraform state surgery.

Local stdio process only — not exposed as a hosted connector. 17 tools.

---

### `ci_run_custom_checks`

Discover and run this repo's own `.github/checks/*.sh` custom-check scripts locally — the same scripts the 🚀 CI Pipeline / custom-checks job runs (ci-failure-capture-tests.sh, format-check-pipefail-tests.sh, integration-select-tests.sh, etc.). Each script is a cheap, self-contained `node --test` runner with no external deps. Prefer this over raw `bash .github/checks/<name>.sh` or `node --test <path>` via shell — it discovers every script automatically and reports pass/fail per script in one call, instead of stopping at the first failure the way the CI step does. Running the relevant check before pushing catches failures (e.g. a missing e2e-surface-map.json entry) that would otherwise cost a CI round-trip. Pass `scripts` to run a named subset (e.g. ["integration-select-tests"] — the .sh suffix is optional); omit it to run every discovered script. Defaults to `verbosity: "failures"` to keep full runs small.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktreePath` | string |  | — | Worktree or repo root (default: repo root) |
| `scripts` | string[] |  | — | Named subset of check scripts to run, by basename (e.g. "integration-select-tests" or "integration-select-tests.sh"). Omit to run every script under .github/checks/*.sh. Unknown names return an error listing the available scripts. |
| `timeoutMs` | number |  | integer, > 0 | Per-script timeout in milliseconds (default: 120000). |
| `verbosity` | enum |  | — | Output verbosity (default: "failures"): "summary" — name/passed/durationMs rows only, no output text. "failures" (default) — output only for failed scripts. "full" — output for every script. |
| `maxOutputChars` | number |  | integer, > 0 | Per-script output cap in characters (default: 5000). |

### `make_ping`

Check if the make server can locate make, the repo root, and the Makefile. Returns ready status, make version, repo root path, and whether the Makefile exists. Use this to verify the server is operational before using other make_* tools.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktreePath` | string |  | — | Worktree or working directory (default: repo root) |

### `make_run`

Prefer this over `make <target>` via shell. Run a whitelisted Makefile target (pc, build, test, lint, typecheck, format, codegen, install, kill-stale, ...). A target still running after ~45s returns { status: "running", jobId }; call make_run_wait({ jobId }) to keep waiting and do NOT re-run it. The pc pipeline also runs as ordered chunks (pc-db-prep, pc-typecheck, pc-format, pc-lint, pc-workflows, pc-test, pc-build) — equivalent to `pc` only when all run in that order. runner-apply prompts interactively: always pass variables="NO_CONFIRM=1". Target details and per-environment validation: .agents/skills/repo-tooling/SKILL.md.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `target` | string | **required** | — | Make target |
| `worktreePath` | string |  | — | Worktree or working directory (default: repo root) |
| `variables` | string |  | — | Make variables, e.g. "DRYRUN=1 FORCE=1" |
| `maxWorkers` | number |  | integer, > 0 | Cap Jest worker parallelism on test-bearing targets (MAXWORKERS=<n>). Use on memory-constrained machines: an out-of-memory crash with "spawn UNKNOWN" in jest-worker means retry lower, not a real test regression. No effect on non-test targets. |
| `timeoutMs` | number |  | integer, > 0 | Runaway backstop in ms, not a transport guard. Defaults 600000 for heavy targets, 300000 otherwise; pass 900000 for `pc` on a cold cache. On timeout the result carries { timedOut: true }. |
| `runInBackground` | boolean |  | — | Return a { jobId } immediately instead of waiting out the ~45s sync budget. The default already backgrounds safely; this only skips the initial wait. Follow with make_run_wait/make_run_status. |
| `verbose` | boolean |  | — | Return full raw output (up to 30k chars) instead of the compact summary, which collapses prettier file listings to a count and truncates each step body to 20 lines. |

### `make_run_status`

Get the current status and output of a background make_run job. Returns instantly: { status: "running" | "done" | "failed", ... }. For heavy targets (pc, pre-commit, full-check) also returns structured step results on completion.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `jobId` | string | **required** | — | Job ID from a make_run / validate_pr result (status: "running") |

### `make_run_wait`

Wait for a background make_run job to complete. Blocks until the job finishes or maxWaitMs elapses (default 50000, capped at 55000 to stay under the ~60s MCP transport timeout). If the job is still running when the wait expires, returns status: "running" — re-call to continue waiting. On completion returns the full structured result (step results for pc/pre-commit/full-check).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `jobId` | string | **required** | — | Job ID from a make_run / validate_pr result (status: "running") |
| `maxWaitMs` | number |  | integer, > 0 | Maximum milliseconds to block (default: 50000, max: 55000). Capped at 55000 to stay under the ~60s MCP transport timeout in cloud sessions. |

### `make_worktree_create`

Prefer this over `make worktree` via shell. Create a new git worktree for a Jira ticket. Runs `make worktree TICKET=... DESC=...` which creates the branch, worktree directory, and registers the parent dependency. After creation, run make_wt_setup to install dependencies. IMPORTANT: Use this instead of `make worktree` via Bash — it validates inputs and provides structured output with next steps. NOTE: When using a stacked parent (PARENT=...), the parent branch must already be pushed to origin — the script will fail fast with a clear message if it is not.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `ticket` | string | **required** | — | Jira ticket key or number (e.g., "LS-1234" or "1234"). |
| `description` | string | **required** | — | Short kebab-case description for the branch name (e.g., "fix-scoring", "add-draft-ui"). No spaces — use hyphens. |
| `parent` | string |  | — | Parent branch to base off (e.g., "LS-507/fix-scoring" for stacked branches). Defaults to "main" if omitted. |

### `make_wt_setup`

Prefer this over `make wt-setup` via shell. Set up a worktree: symlink node_modules, copy .env, configure .twig, install hooks. Run after worktree creation.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktreePath` | string | **required** | — | Absolute worktree path |
| `removeSymlink` | boolean |  | — | Remove symlink and install independent node_modules |
| `noFrozenLockfile` | boolean |  | — | Run pnpm install --no-frozen-lockfile first (for new workspace packages) |

### `terraform_apply_status`

Poll a terraform_plan job. Without `maxWaitMs`, returns an instant status snapshot (like make_run_status). With `maxWaitMs`, blocks until the job completes or the wait expires (like make_run_wait), capped at ~55s to stay under the ~60s MCP transport timeout. On completion returns the same structured { summary, resources } shape as terraform_plan.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `jobId` | string | **required** | — | Job ID from a terraform_plan result (status: "running") |
| `maxWaitMs` | number |  | integer, > 0 | Maximum milliseconds to block waiting for completion. Omit for an instant non-blocking snapshot. |

### `terraform_fmt`

Format .tf files in the terraform/ subdirectory.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktreePath` | string |  | — | Worktree path (default: repo root) |
| `check` | boolean |  | — | Check-only mode (no modifications) |
| `files` | string[] |  | — | Specific .tf files (relative to terraform/) |

### `terraform_gen_tfvars`

Generate terraform/secrets.auto.tfvars from environment variables. Reads GOOGLE_OAUTH_CLIENT_SECRET, JWT_SECRET_KEY, OAUTH_PROXY_COOKIE_SECRET, JIRA_CLIENT_ID/SECRET/CLOUD_ID (or JIRA_CREDENTIALS), ROLLBAR_ACCESS_TOKEN, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, DISCORD_* and CLOUDFLARE_* vars. Safe to re-run — always overwrites. Use checkOnly to validate without writing.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktreePath` | string |  | — | Repo or worktree root (default: repo root) |
| `checkOnly` | boolean |  | — | Report missing vars without writing the file |

### `terraform_plan`

Prefer this over raw `terraform plan` via Bash. Runs `terraform plan` (via `terraform show -json` under the hood) and returns structured output — { summary: { add, change, destroy }, resources: [{ address, action, forcesReplacementOn? }] } — instead of raw text an agent would otherwise grep for resource replacements. Defaults to `lock: false` (passes `-lock=false`) so a routine plan never contends for the shared state lock that the Lock Watchdog polices; pass `lock: true` only when you specifically need the real locking behavior. Plans against `terraform/main` commonly take 2-6 minutes — a plan still running after ~45s returns { status: "running", jobId }; poll with terraform_apply_status({ jobId }) and do NOT re-run it.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `dir` | string | **required** | — | Terraform working directory, e.g. "terraform/main" or "terraform/runners". Relative to repo root, or absolute. |
| `lock` | boolean |  | — | Whether to take the real Terraform state lock. Default false (passes -lock=false) — a plan is read-only and should not contend for the shared lock by accident. Set true only when you specifically need locking. |
| `targets` | string[] |  | — | Optional resource addresses to scope the plan to, e.g. ["aws_lambda_function.graphql"] — passed as repeated -target flags. |
| `worktreePath` | string |  | — | Repo or worktree root (default: repo root). Used to resolve relative `dir` values. |
| `timeoutMs` | number |  | integer, > 0 | Process-level timeout backstop in ms (default: 900000 / 15 minutes). Independent of the MCP transport timeout. |

### `terraform_state_list`

List resources in Terraform state. Equivalent to `terraform -chdir=<dir> state list [<address>]`. Omit `address` to list all resources; provide an address to filter.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `dir` | string | **required** | — | Terraform working directory, e.g. "terraform/main" or "terraform/runners". |
| `address` | string |  | — | Optional resource address filter, e.g. "aws_lambda_function.graphql". Supports partial module paths. |
| `worktreePath` | string |  | — | Repo or worktree root (default: repo root). |

### `terraform_state_mv_batch`

Move one or more resources in Terraform state. Accepts 1–200 { from, to } pairs and runs them sequentially. Pass a single-element array to move one resource. All pairs are attempted even if earlier ones fail; returns per-pair success/error results. Use for bulk module renames or resource restructuring.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `dir` | string | **required** | — | Terraform working directory, e.g. "terraform/main" or "terraform/runners". |
| `moves` | object[] | **required** | min 1, max 200 | Array of { from, to } address pairs to move sequentially. |
| `batchTimeoutSeconds` | number |  | integer, > 0 | Overall timeout for the entire batch in seconds (default: 300). If elapsed time exceeds this limit before all moves complete, remaining moves are skipped with a timeout error and partial results are returned. |
| `worktreePath` | string |  | — | Repo or worktree root (default: repo root). |

### `terraform_state_pull`

Pull the current Terraform state JSON from the remote backend. Equivalent to `terraform -chdir=<dir> state pull`. Returns the raw Terraform state JSON text; clients must parse it if they need an object. Use `dir` as a relative path like "terraform/main" or "terraform/runners", or an absolute path. Security warning: Terraform state commonly contains sensitive values such as provider credentials, tokens, and secrets, and MCP tool output may be persisted in logs or transcripts. Only use this tool when you explicitly need the full state contents.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `dir` | string | **required** | — | Terraform working directory, e.g. "terraform/main" or "terraform/runners". Relative to repo root, or absolute. |
| `worktreePath` | string |  | — | Repo or worktree root (default: repo root). Used to resolve relative `dir` values. |

### `terraform_state_push`

Push a Terraform state JSON to the remote backend. Equivalent to `terraform -chdir=<dir> state push <state-file>`. The state is written to a temp file and pushed. CAUTION: This overwrites the remote state — always pull first and verify.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `dir` | string | **required** | — | Terraform working directory, e.g. "terraform/main" or "terraform/runners". |
| `stateJson` | string | **required** | — | Full Terraform state as a JSON string (from terraform_state_pull). |
| `force` | boolean |  | — | Pass -force to bypass serial number check. Use only when you are certain the state is correct. |
| `worktreePath` | string |  | — | Repo or worktree root (default: repo root). |

### `terraform_state_rm`

Remove a resource from Terraform state (does NOT destroy the real infrastructure). Equivalent to `terraform -chdir=<dir> state rm <address>`. Use `dryRun: true` to preview what would be removed without modifying state.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `dir` | string | **required** | — | Terraform working directory, e.g. "terraform/main" or "terraform/runners". |
| `address` | string | **required** | — | Resource address to remove, e.g. "aws_lambda_function.old_resource". |
| `dryRun` | boolean |  | — | Pass -dry-run to preview removal without modifying state. Recommended before destructive removes. |
| `worktreePath` | string |  | — | Repo or worktree root (default: repo root). |

### `validate_pr`

Semantic one-shot for the mandatory migrate-before-pc gate: checks DB migration status → applies pending migrations → runs make pc. Guarantees the AGENTS.md invariant order and short-circuits on migration failure (does not run pc on a broken DB). Returns { migrations: { applied, pending, needsMigration }, pc: { passed, steps, errors } }. The default runs make pc as a background job with a ~45s bounded wait: if pc is still running the result is { pc: { status: "running", jobId } } — poll with make_run_wait({ jobId }), never re-invoke while it runs. runPcInBackground: true skips the bounded wait and returns the jobId immediately. Use sanctionedChunks: true to run the seven pc steps individually (pc-db-prep → pc-typecheck → pc-format → pc-lint → pc-workflows → pc-test → pc-build); each call is budgeted to ~45s and may return { pc: { status: "in_progress", ... } } with resume instructions (re-invoke with startAtChunk, or make_run_wait a still-running chunk job) — never restart validation from scratch.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktreePath` | string |  | — | Worktree or repo root (default: repo root) |
| `sanctionedChunks` | boolean |  | — | Run the seven pc chunks individually instead of make pc (timeout-resilient for cloud sessions). Runs as many chunks as fit in a ~45s budget, then returns an in_progress result with resume instructions. Ignored when runPcInBackground: true. |
| `startAtChunk` | enum |  | — | Resume sanctioned-chunk validation at this chunk (implies sanctionedChunks: true; skips the migration check — it ran in the initial call). Use the value from a previous in_progress result. |
| `runPcInBackground` | boolean |  | — | Spawn make pc as a background job and return immediately with a { jobId } instead of waiting out the ~45s sync budget. Use make_run_wait({ jobId }) to poll for completion. The default already backgrounds make pc safely — this flag just skips the initial bounded wait. |

