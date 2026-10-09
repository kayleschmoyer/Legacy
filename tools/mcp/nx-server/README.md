# MCP Nx Server

Nx build system intelligence for AI agents — project discovery, affected analysis, target execution, dependency graph queries, and safe package installation.

## Tools

- **nx_show_projects** — List Nx projects with optional filters (affected, target, tag)
- **nx_show_project** — Inspect a single project's configuration (targets, tags, deps)
- **nx_affected** — Show which projects are affected by current changes
- **nx_run** — Run an Nx target on a specific project
- **nx_run_test** — Run one spec/test by pattern; `report: "summary" | "json"` returns Jest's parsed failure list instead of the raw log (see [Structured test failures](#structured-test-failures))
- **nx_run_affected** — Run a target on all affected projects
- **nx_run_prettier** — Run `prettier --check`/`--write` against an explicit, small file list (capped at 50 files) without the whole-repo side effects of `nx_run_pc_chunk({ chunk: 'pc-format' })`
- **nx_run_eslint** — Run `eslint` (optionally `--fix`, and against an nx `project`-relative or repo-relative file list) against an explicit, small file list (capped at 50 files), or — with `files` omitted and `project` set — the whole project (`eslint .` from its root, LS-10355). Pass/fail agrees with `pc-lint` by default (errors fail, warnings don't); pass `maxWarnings` to opt into a stricter threshold. See [Scoped lint and typecheck](#scoped-lint-and-typecheck)
- **nx_dep_graph** — Query dependency relationships between projects
- **nx_install_package** — Symlink-aware package installation with lock file, duplicate detection, and @types/ companion check
- **nx_check_package_health** — Scan workspace for nested node_modules, wildcard ranges, missing overrides, and missing @types/ companions

## How It Works

Wraps Nx CLI commands (`nx show projects`, `nx show project`, `nx affected`, `nx run`, `nx graph`) with token-efficient structured output (see [Response format](#response-format)) and safety guardrails. Target execution is limited to an allowlist of safe targets (build, test, lint, typecheck, codegen, serve, dev, print-schema, deploy:plan, e2e, storybook) to prevent unintended side effects.

### Scoped lint and typecheck

`nx_run_eslint` lints an explicit, small file list, or a whole project when `files` is omitted and `project` is passed (e.g. `nx_run_eslint({ project: "db" })` after `pc-lint` reports `db:lint` red, LS-10355), instead of the whole repo (`pc-lint`) — useful when you want a report narrowed to the files you just touched (LS-8735). By default it omits `--max-warnings` (unlimited), so `passed` agrees with `pc-lint`'s own verdict — errors fail, warnings alone don't; pass `maxWarnings: 0` to opt into `pc-lint`'s stricter `eslint . --max-warnings=0` threshold deliberately (LS-10143). The result's `errorCount`/`warningCount` fields carry the error/warning split without parsing the rendered `output` text.

`files` entries are tried relative to the named `project`'s root first (when `project` is given), falling back to repo-root/`worktreePath`-relative — so `nx_run_eslint({ project: "db", files: ["src/queries.ts"] })` works without spelling out `lambdas/db/src/queries.ts` (LS-10143).

> **It is not a fast path in this repo, and the ticket's premise that it would be did not survive measurement.** Every TS config here enables type-aware `@typescript-eslint` rules via `parserOptions.project` (the root config points at `tsconfig.base.json`, `lambdas/db/eslint.config.mjs` at `tsconfig.*?.json`), so ESLint constructs a full TypeScript program before linting even one file. Measured in `lambdas/db`:

| Run                        | Time     |
| -------------------------- | -------- |
| single file                | 4m 39.9s |
| whole project (`eslint .`) | 4m 41.9s |

Scoping to one file saves **~2 seconds out of ~280** (0.7%). The cost is per-_run_, not per-_file_, so narrowing the file list does not shrink it. Prefer `nx_run({ project, target: 'lint' })` when you want a whole project — it is Nx-cached, so a repeat run with no input changes returns instantly, which a direct ESLint invocation never does. For this reason the underlying ESLint process is given a generous **process-level kill timeout of 10 minutes** — a hard backstop against a genuinely runaway process, independent of the MCP-transport-facing budget described next.

Because a legitimate scoped run (~280s) routinely exceeds the ~60s MCP transport timeout, `nx_run_eslint` runs as a background job with the same job/jobId semantics as `nx_run`/`nx_run_test`/`nx_run_pc_chunk` (LS-9594): a run that finishes within the tool's **~45s sync budget** (distinct from the 10-minute kill timeout above — this is how long one MCP call blocks before handing back a `jobId`, not how long the process itself is allowed to run) returns its pass/fail result in one call; a slower one returns `{ status: "running", jobId }` — poll with `nx_job_wait({ jobId })` (or `nx_job_status`) rather than falling back to a raw shell invocation.

Unlike `nx_run_prettier`, it cannot simply hand the file list to the CLI from the repo root. Prettier resolves `.prettierrc` per file; **ESLint 9 resolves flat config from its current working directory**, so linting `lambdas/db/src/*.ts` from the workspace root silently applies the root config and drops `lambdas/db/eslint.config.mjs` — including that project's `@nx/enforce-module-boundaries` allow-list, which turns legitimate `@apollo/server` imports into reported violations. Verified with `eslint --print-config` on the same file: `allow: []` from the repo root, the project's allow-list from `lambdas/db`.

So the tool walks up from each file to the nearest directory owning an `eslint.config.*`, runs ESLint from there, and relativises the paths to it. A file list spanning two config roots is rejected rather than silently linted under one project's rules — split it into one call per root.

**There is deliberately no file-scoped typecheck tool.** `tsc` refuses to combine `-p/--project` with explicit source files, and dropping `-p` discards the project's `compilerOptions`, path mappings, and `include`/`exclude`, which produces errors that aren't real. The honest granularity for typecheck is the project: `nx_run({ project, target: 'typecheck' })`. Likewise there is no `nx_run_jest` — scoped Jest already works through `nx_run({ project, target: 'test', args: ['--testPathPatterns', '<pattern>'] })`.

### Package Installation Safety

`nx_install_package` enforces the monorepo's package installation rules:

1. **Symlink detection** — refuses to install if `node_modules` is a symlink into a shared pool slot (it would mutate a slot other worktrees may be running)
2. **Immutable pool slots** — the content-addressable `node_modules` pool (`scripts/modules-pool/link.mjs`) makes concurrent installs safe by construction: a new lockfile builds a separate immutable slot, so installs never corrupt another worktree's `node_modules`
3. **Workspace root** — always declares the dependency in root `package.json` (all deps are hoisted to the root)
4. **Minimal lockfile churn** (LS-10189) — declares the dependency in `package.json` directly and installs via `pnpm install` rather than `pnpm add`. `pnpm add` re-resolves the whole peer-dependency graph when it rewrites the lockfile, which on this workspace's react-native/expo tree can rewrite thousands of unrelated lines for a single new dependency; letting `pnpm install` patch the lockfile against its existing resolutions instead keeps the diff to what the new package actually needs. The result reports `lockfileDiffLines` and adds a warning above 100 changed lines so any residual unrelated churn is surfaced instead of silently riding along in a PR diff.
5. **Post-install scanning** — checks for nested `node_modules` in `lib/` that signal version duplication
6. **Types detection** — reports whether the package bundles types or needs an `@types/` companion

### Structured test failures

`nx_run_test`'s `report` param (LS-10092) makes Jest itself the source of the failure list instead of the console log. It appends `--json --outputFile=<temp>` to the run, parses that file server-side, deletes it, and returns `{ passed, numTotalTests, numPassedTests, numFailedTests, numFailedTestSuites, failures: [{ suite, fullName, message }] }` — every failing test named, each message ANSI-stripped and clipped to 10 lines, the list capped at 50 with an `omittedFailures` count. `"summary"` drops the raw log; `"json"` keeps it. Omitting `report` leaves the response shape exactly as it was.

It exists because the raw log cannot carry this reliably: a 16-failure run overflowed `MAX_OUTPUT_CHARS` and was truncated through the middle of the failure list, surfacing 2 of the 16 names. Jest writes to a temp file rather than stdout so nx's own wrapper lines can't corrupt the JSON, and a run that outlives the sync budget is formatted identically when polled via `nx_job_wait` (a `jest-report` job formatter, the LS-9814 lesson).

An Nx cache replay never re-runs Jest and so writes no report: the response then carries `reportUnavailable` plus the raw output rather than a fabricated zero-failure result. Pair `report` with `noCache: true` when that's a risk.

Two related truncation rules apply everywhere in this server: command output is ANSI-stripped before it is matched or truncated (escape codes inflate the budget by 40-80% and break the daemon/plugin-worker/project-not-found pattern matching), and a **failed** `nx_run_pc_chunk` truncates from the top rather than the bottom — eslint and jest print per-project progress first and the real error list last, so head-truncation drops precisely the lines the caller needs.

## Response format

Responses use `@legacy-sports/mcp-format` for token efficiency (epic LS-8018). Format is chosen per response shape: flat project-name lists (`nx_show_projects`, `nx_affected`, `nx_dep_graph`) render as a compact list — a one-line minified-JSON summary (counts + active filters) followed by the bare names, one per line — while single objects and nested project detail (`nx_show_project`, run/health results) render as minified JSON. Fields agents don't consume (e.g. the redundant `success` flag, and `nx_show_project`'s `targets` array, whose names are the keys of `targetDetails`) are pruned. Runtime alias resolution is wired via `TSX_TSCONFIG_PATH` on the server's `.mcp.json` entry.
