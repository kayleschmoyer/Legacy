# Nx MCP Tool Catalog

> GENERATED FILE — DO NOT EDIT.
>
> Source: `tools/mcp/nx-server/src/{index,lambda}.ts`. Regenerate with 
> `make mcp-api-reference`; CI fails on drift (LS-9701 Tier 2, review pattern #48).
>
> For the interactive, filterable version of this same data across every
> server: [`docs/mcp/api-reference.html`](../../../../../docs/mcp/api-reference.html).

Nx project graph, affected-target runs, per-chunk pc execution, lint/format/test runners, and package health checks.

Local stdio process only — not exposed as a hosted connector.

---

### `nx_affected`

Show affected projects. Optionally filter by target.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `target` | string |  | — | Filter to projects with this target |
| `base` | string |  | — | Base ref (default: origin/main) |
| `worktreePath` | string |  | — | Worktree path (default: repo root) |

### `nx_check_package_health`

Scan for package issues: nested node_modules, wildcard ranges, missing overrides, missing @types/.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktreePath` | string |  | — | Worktree path (default: repo root) |

### `nx_dep_graph`

Query dependency graph: what a project depends on or what depends on it.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `project` | string | **required** | — | Project name |
| `direction` | enum |  | — | "dependencies" or "dependents" |
| `worktreePath` | string |  | — | Worktree path (default: repo root) |

### `nx_install_package`

Prefer this over `pnpm add -w`/`-Dw` via shell to install an npm package at workspace root. Refuses if node_modules is a symlink; checks for @types/ companion. Edits package.json + `pnpm install`, avoiding peer-graph re-resolution; reports `lockfileDiffLines`. Fast installs return in one call; a slow one returns { status: "running", jobId } — poll nx_job_wait({ jobId }), do NOT re-run.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `name` | string | **required** | — | Package name |
| `version` | string |  | — | Version (default: latest) |
| `dev` | boolean |  | — | Install as devDependency |
| `worktreePath` | string |  | — | Worktree path (default: repo root) |

### `nx_job_list`

List recent background jobs (newest first), including jobs started by a previous MCP server process. Use after a session resume or lost tool result to recover a job handle instead of re-running validation.

_No parameters._

### `nx_job_status`

Cheap, instant snapshot of a background job started by a job-backed nx tool (nx_run_pc_chunk, nx_run, nx_run_affected, nx_run_e2e_specs, nx_install_package). Returns { status, elapsedSec, logTail } while running (never an error), or the final pass/fail output once done. Use nx_job_wait to block until completion.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `jobId` | string | **required** | — | Job ID returned by a { status: "running" } result |

### `nx_job_wait`

Wait for a background job to finish, bounded at 55s per call (stays under the MCP transport timeout). If the job is still running when the wait expires, returns a { status: "running" } snapshot with logTail — re-invoke to continue waiting. Never re-run the underlying command while a job is in progress.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `jobId` | string | **required** | — | Job ID returned by a { status: "running" } result |
| `maxWaitMs` | number |  | coerced, integer, > 0, max 55000 | Max wait per call in ms (default and cap: 55000) |

### `nx_run`

Prefer this over `pnpm exec nx run <project>:<target>` / `pnpm exec nx run-many -t <target>` via shell. Runs an Nx target on one project, or fans out across every project declaring it if `project` is omitted. Allowed: build, test, lint, typecheck, codegen, serve, dev, print-schema, deploy:plan, e2e, integration, storybook, format (colon-suffixed variants accepted). Fast targets return pass/fail in one call; a slow run returns { status: "running", jobId } after ~45s — call nx_job_wait({ jobId }); do NOT re-run.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `project` | string |  | — | Project name. Omit or pass "all" to fan out across every project declaring the target. |
| `target` | string | **required** | — | Target to run |
| `configuration` | string |  | — | Named configuration |
| `noCache` | boolean |  | — | Bypass Nx cache |
| `updateSnapshot` | boolean |  | — | Update Jest snapshots (appends --updateSnapshot). Only applies to the "test" target. |
| `args` | string \| string[] |  | — | Extra flags after "--" (e.g. ["--verbose"] for verbose output). Array preferred; string split on whitespace. For multiple test patterns, pipe is preferred: ["--testPathPatterns", "FileA\|FileB"]. Separate array elements also work: ["--testPathPatterns", "FileA", "FileB"] — on Windows these are automatically coalesced into a single pipe-separated token. |
| `env` | object (key-value) |  | — | Environment variables to set for the command (e.g. { "PLAYWRIGHT_GREP": "@regression" }). |
| `worktreePath` | string |  | — | Worktree path (default: repo root) |

### `nx_run_affected`

Prefer this over `pnpm exec nx affected -t <target>` via shell. Run an Nx target on all affected projects. Allowed: build, test, lint, typecheck, codegen. A run still going after ~45s returns { status: "running", jobId } — call nx_job_wait({ jobId }) to continue waiting; do NOT re-run (re-invoking joins the in-flight run).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `target` | string | **required** | — | Target to run on affected projects |
| `base` | string |  | — | Base ref (default: origin/main) |
| `fix` | boolean |  | — | Pass --fix for lint target |
| `worktreePath` | string |  | — | Worktree path (default: repo root) |

### `nx_run_e2e_specs`

Prefer this over raw `npx playwright test` shell commands. Hermetic mode (default): runs specs from src/tests/ against a local static build, auto-selects a free E2E_PORT, and forces E2E_AUTH_MODE=ci (no OAuth needed). Requires dist/apps/web — run nx_run({ project: "web", target: "build" }) first if missing. Integration mode (integration: true): runs specs from src/integration/tests/ against the live backend (api.legacy-fantasy.com) with workers=1 to avoid throttling. Checks e2e JWT freshness (~/.legacy-sports/e2e-token.json) and E2EPOOLPASSWORD before launching. Set withTracing: true to enable Playwright tracing in either mode; trace.zip paths are returned in traceArtifacts. Returns a compact summary: pass/fail counts, failing test details, raw output, traceArtifacts, and (integration only) graphqlErrors. A run still going after ~45s returns { status: "running", jobId } — call nx_job_wait({ jobId }) for the same structured summary once done; do NOT re-run (re-invoking joins the in-flight run). The underlying Playwright process is hard-killed after 30 minutes (hermetic) / 8 minutes (integration) independent of how many nx_job_wait calls you make — large hermetic batches (100+ specs) usually finish well within that, but if you hit the kill, split specs into smaller batches across multiple calls.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `specs` | string[] | **required** | min 1 | Spec file paths relative to apps/web-e2e/ (e.g. ["src/tests/roster-management.spec.ts"] for hermetic, "src/integration/tests/league.spec.ts" for integration). Absolute paths are also accepted. |
| `project` | string |  | — | Playwright project. Hermetic: chromium (default), firefox, webkit, Mobile Chrome, Mobile Safari. Integration: integration, shared-live (omit = all). |
| `grep` | string |  | — | Filter tests by title regex (Playwright --grep). E.g. "@critical" or "should show roster". |
| `worktreePath` | string |  | — | Worktree path (default: repo root) |
| `integration` | boolean |  | — | When true, runs specs against the live backend using playwright.integration.config.ts instead of the hermetic config. Enforces workers=1. Checks JWT freshness and E2EPOOLPASSWORD before launching. |
| `withTracing` | boolean |  | — | When true, enables Playwright tracing (--trace=on) in either mode. Trace zip paths are returned in traceArtifacts. |
| `skipGlobalSetup` | boolean |  | — | Integration mode only. Skips globalSetup and the JWT/E2EPOOLPASSWORD preflight, for hermetic *.contract.spec.ts files. |

### `nx_run_eslint`

Prefer this over raw `pnpm exec eslint` via shell. Lints a small explicit file list, or the whole project when `files` is omitted and `project` set. Runs from the nearest directory owning an eslint.config.* so the project's flat config applies; a file list spanning two config roots is rejected (split per root). Capped at ${ESLINT_MAX_FILES} files. Verdict matches pc-lint: errors fail, warnings don't (maxWarnings opts into stricter). Result has errorCount/warningCount. NOT a fast path: type-aware rules build a full TS program per run (~280s in lambdas/db). A run still going after ~45s returns { status: "running", jobId } — call nx_job_wait; do NOT re-run.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `files` | string[] |  | min 1 | Paths to lint: relative to `project` root if given (falling back to repo-root), else repo-root/worktreePath-relative or absolute. Must share one eslint.config.* root. Omit with `project` set to lint the whole project. |
| `project` | string |  | — | Nx project name; resolves `files`, or lints the whole project if `files` omitted. |
| `mode` | enum |  | — | "check" reports lint errors (default); "fix" applies --fix. |
| `maxWarnings` | number |  | integer, min 0 | eslint --max-warnings. Omit for unlimited (matches pc-lint: only errors fail); pass 0 for strict. |
| `worktreePath` | string |  | — | Worktree path (default: repo root) |

### `nx_run_pc_chunk`

Prefer this over `make pc-<chunk>` via shell for cloud agents. Run a single pre-commit validation chunk. Chunks must run IN ORDER: pc-db-prep → pc-typecheck → pc-lint → pc-format → pc-workflows → pc-test → pc-build. Fast chunks return structured pass/fail output in one call. A chunk still running after ~45s returns { status: "running", jobId } instead of blocking into the ~60s MCP transport timeout — the chunk keeps running in the background; call nx_job_wait({ jobId }) to continue waiting. Do NOT re-run the chunk: re-invoking while it runs joins the in-flight job.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `chunk` | enum | **required** | — | Pre-commit validation chunk to run. One of: ${PC_CHUNKS.join(', ')} |
| `worktreePath` | string |  | — | Worktree path (default: repo root) |
| `verbose` | boolean |  | — | When true, include the full raw output (up to 30k chars) in the response instead of the default compact summary. Default false: prettier per-file listings (pc-format) are collapsed to a count, and the step body (e.g. eslint output for pc-lint) is truncated to 20 lines with a note to run the step directly for the rest. Use verbose: true only when you need the complete output for debugging. |
| `maxWorkers` | number |  | integer, > 0 | Cap Jest worker parallelism for the pc-test chunk by passing MAXWORKERS=<n>, which the pc-test recipe forwards to `nx affected -t test` as `-- --maxWorkers=<n>`. Use on memory-constrained machines to avoid "Fatal process out of memory: Zone" crashes (with "spawn UNKNOWN" in jest-worker) from full-parallelism Jest workers across every affected project — that failure signature means retry pc-test with a lower maxWorkers, not that the code under test regressed. E.g. maxWorkers: 2. Ignored by chunks other than pc-test. |
| `parallel` | number |  | integer, > 0 | Cap nx project-level parallelism for the pc-lint chunk by passing PARALLEL=<n>, which the pc-lint recipe forwards to `nx affected -t lint --fix` as `--parallel=<n>` (nx.json default: 5). Use on memory-constrained machines to avoid individual large projects (e.g. lambdas/db, cli) getting "Killed" (OOM) when several `eslint . --fix` processes run concurrently, each ballooning to 2-5GB RSS — nx may then mislabel the OOM-killed project "flaky" on retry, masking the real cause. E.g. parallel: 2. Ignored by chunks other than pc-lint. |

### `nx_run_prettier`

Prefer this over raw `pnpm exec prettier --check/--write <files>` via shell, and over nx_run_pc_chunk({ chunk: "pc-format" }) when you only need a small, explicit file list (e.g. fixing Prettier drift in 1-3 files after a rebase). Runs prettier --check or --write against exactly the given files — never the whole repo diff — so it carries none of pc-format's auto-amend-already-pushed-commit risk (LS-8367) or full per-file-listing overflow risk (LS-8423). Capped at ${PRETTIER_MAX_FILES} files — for broader formatting use nx_run_pc_chunk({ chunk: "pc-format" }) instead. Works on any file in the repo, including files outside every Nx project (e.g. top-level scripts/, like scripts/modules-pool/link.mjs) — there is no Nx project resolution here at all, just prettier run directly against the given paths.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `files` | string[] | **required** | min 1 | File paths (relative to worktreePath/repo root, or absolute) to check or format. |
| `mode` | enum |  | — | "check" (default) only reports; "write"/"fix" reformats in place. |
| `worktreePath` | string |  | — | Worktree path (default: repo root) |

### `nx_run_test`

Prefer this over raw `npx jest --config <path> --testPathPatterns <pattern> -t <name>` via shell when narrowing to one spec/test. Wrapper over nx_run: resolves `config` to the matching jest target (e.g. "mobile" -> "test:mobile") and forwards testPathPatterns/testNamePattern. Omit `config` for a single "test" target (fans out for aggregate targets, e.g. shared-components; auto-routes to `files` for a `node --test` target, e.g. ci-reviewer). Same job semantics as nx_run — call nx_job_wait if slow. On a failing run pass report: "summary" for the full failing-test list; the raw log is truncated and cuts through the middle of it.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `project` | string | **required** | — | Project name |
| `testPathPatterns` | string |  | — | Jest --testPathPatterns: spec filename or regex ("LeagueListRow"); pipe-separate multiple ("A\|B"). Max 300 chars, no nested quantifiers like "(a+)+". Omit to run the whole suite. Use `files` for `node --test` targets. |
| `testPathPattern` | string |  | — | Alias for testPathPatterns. |
| `files` | string[] |  | — | Project-relative file paths, for a "test" target running `node --test` instead of Jest (e.g. ["lib/__tests__/retry.test.mjs"]). Unused for Jest targets. |
| `testNamePattern` | string |  | — | Jest -t value: filters to matching test names, e.g. "DraftSquadStrip". Same length cap and ReDoS guard as testPathPatterns. |
| `config` | string |  | — | Jest config variant, mapped to the "test:<config>" target (e.g. "mobile", "web", "stories"). Omit for projects with a single "test" target. |
| `updateSnapshot` | boolean |  | — | Update Jest snapshots (appends --updateSnapshot). |
| `noCache` | boolean |  | — | Bypass Nx cache |
| `report` | enum |  | — | Structured failures parsed from jest --json. "summary": counts plus failures: [{ suite, fullName, message }], ANSI-stripped, each message clipped to ~10 lines, no raw log. "json": adds the raw output. Omit for the default shape. Pair with noCache: true — an Nx cache replay writes no report. |
| `worktreePath` | string |  | — | Worktree path (default: repo root) |

### `nx_show_project`

Inspect a project: root, targets, tags, type.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `project` | string | **required** | — | Project name |
| `worktreePath` | string |  | — | Worktree path (default: repo root) |

### `nx_show_projects`

List Nx projects. Filter by affected, target, or tag.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `affected` | boolean |  | — | Only affected projects vs origin/main |
| `withTarget` | string |  | — | Filter to projects with this target |
| `tag` | string |  | — | Nx tag filter |
| `worktreePath` | string |  | — | Worktree path (default: repo root) |

