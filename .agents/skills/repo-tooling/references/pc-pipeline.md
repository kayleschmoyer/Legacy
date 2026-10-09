# The pc Pipeline — Steps, Chunks, and Per-Environment Routing

> Loaded from [repo-tooling SKILL](../SKILL.md).

## The pc pipeline: 9 steps, 7 chunks

`make pc` (alias for `make pre-commit`) runs nine steps. The seven standalone chunk targets exist because the monolith exceeds cloud-session transport timeouts (LS-7906); they are equivalent to `make pc` **only when all seven run in this order**:

| #   | Step                            | Command (from `_PC_*_CMD`)                                                                              | Chunk target   | Runs when            |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------- | -------------------- |
| 1   | Migration immutability          | `node scripts/check-migration-immutability.js --branch`                                                 | `pc-db-prep`   | `PC_HAS_DB=1`        |
| 2   | Schema generation               | `pnpm exec nx run db:print-schema`                                                                      | `pc-db-prep`   | always               |
| 3   | Codegen                         | `GRAPHQL_SCHEMA=<abs>/lambdas/db/schema.graphql nx run-many -t codegen`                                 | `pc-db-prep`   | always               |
| 4   | Typecheck                       | `pnpm exec nx affected -t typecheck --base=$(NX_BASE)`                                                  | `pc-typecheck` | `PC_DOCS_ONLY=0`     |
| 5   | Lint (scoped fix + check)       | `node scripts/lint-fix-changed.js --base=$(NX_BASE) && pnpm exec nx affected -t lint --base=$(NX_BASE)` | `pc-lint`      | `PC_DOCS_ONLY=0`     |
| 6   | Format (prettier + auto-commit) | `_PC_FORMAT_RECIPE` (see below)                                                                         | `pc-format`    | always               |
| 7   | Workflow validation             | `node scripts/validate-workflows.js`                                                                    | `pc-workflows` | `PC_HAS_WORKFLOWS=1` |
| 8   | Test                            | `pnpm exec nx affected -t test --base=$(NX_BASE)`                                                       | `pc-test`      | `PC_DOCS_ONLY=0`     |
| 9   | Build                           | `pnpm exec nx affected -t build --base=$(NX_BASE)`                                                      | `pc-build`     | `PC_DOCS_ONLY=0`     |

Canonical chunk order: `pc-db-prep` → `pc-typecheck` → `pc-lint` → `pc-format` → `pc-workflows` → `pc-test` → `pc-build`. Lint runs before format (LS-10145) so `eslint --fix` rewrites (step 5) still get a formatting pass (step 6) before being committed — the reverse order let unformatted `--fix` output ship and fail CI's lint & format check.

As of 2026-07-02, lambda unit suites run under `nx affected -t test` like every other project (the `jest --onlyChanged` gap was closed by adding `project.json` jest targets; `lambdas/db` joined 2026-09-13 once its red suites were fixed) — so step 8 and CI both gate lambda tests. Which suites gate merge overall: see [testing → What Gates Merge](../../testing/SKILL.md#what-gates-merge).

### pc-workflows: vendored JSON schemas

Step 7 validates every `.github/workflows/*.yml` and `.github/actions/**/action.yml`
against JSON schemas **vendored under `scripts/schemas/`** — not fetched from
SchemaStore at run time.

They used to be fetched live on every run, which made this step a function of a
third party's current HEAD. On 2026-09-01 SchemaStore tightened `workflow_call`
to reject a null value and every open PR went red simultaneously — markdown-only
diffs included — with no repo commit to bisect or revert (LS-9797).

Two consequences worth knowing:

- **`pc-workflows` no longer needs network, and no longer silently skips itself.**
  The old code returned `null` on a fetch failure and skipped validation while
  still reporting green. Loading now fails **closed**: a missing or corrupt
  vendored schema is an error telling you to run `make update-workflow-schemas`.
- **Upstream schema changes arrive as a reviewable commit.** Refresh with
  `make update-workflow-schemas` (or `CHECK=1` to report drift without writing),
  then run `make lint-workflows` and commit the schema diff on its own.

`--check` is deliberately not wired into CI — doing so would recreate the exact
failure mode vendoring removes. See [`scripts/schemas/README.md`](../../../../scripts/schemas/README.md).

### Change classification (why steps get skipped)

Each pc invocation runs `node scripts/classify-changes.js --base $(NX_BASE)`, which diffs `NX_BASE...HEAD` and emits three flags:

- `PC_HAS_DB=1` — any changed file under `lib/db-client/` or `lambdas/db/` (enables step 1, migration immutability)
- `PC_HAS_WORKFLOWS=1` — any changed file under `.github/workflows/` or `.github/actions/` (enables step 7)
- `PC_DOCS_ONLY=1` — ALL changed files are docs (`*.md`, `docs/`, `.agents/skills/`) (skips steps 4, 6, 8, 9)

**Steps 2–3 (schema generation + codegen) always run, regardless of `PC_HAS_DB`** (LS-9276). They used to be gated the same way as step 1, which let generated-file staleness introduced by one PR (e.g. a schema change that didn't regen every codegen target) go undetected by every later PR whose own diff didn't happen to touch `lib/db-client/`/`lambdas/db/`. Both commands are cheap (~20s combined) and a no-op when already fresh, so running them unconditionally closes that gap for local validation — mirroring what `.github/workflows/check-schema.yml`'s `git diff --exit-code -- '*.generated.ts'` already enforces in CI for PRs that touch schema-relevant paths.

**Fail-safe:** if `git diff` fails (typical cause: shallow clone with no merge-base for `origin/main`) or no changes are detected, every step runs. In cloud, `.claude/cloud-setup.sh` deepens the clone (`git fetch --deepen=200`, fallback `--unshallow`) precisely to avoid this slow run-everything path.

**NX_BASE:** defaults to `origin/main` (falls back to `main` on non-Windows if `origin/main` is missing). Override per-invocation: `make pc NX_BASE=<ref>`. The same base feeds both classify-changes and every `nx affected` step.

### pc-format: auto-commit and recovery

Step 6 runs `pnpm exec prettier --write --ignore-unknown .`, then:

- **Clean working tree + formatter rewrote files** → `git add -A && git commit -m 'style: apply formatting'`: the fixes land in a **new commit** on top of your tip commit. Deliberately does **not** amend the tip (LS-8367) — the ticket-to-merge spine mandates commit → push → draft PR before validation runs, so the tip commit is always already on the remote by the time this step runs; amending it would rewrite pushed history and require a force-push, which Claude Code's auto-mode permission classifier blocks. A new commit reaches the remote with a normal push.
- **Dirty working tree + formatter rewrote files** → **exit 1** with "Commit or stash them first, then re-run make pc."

Preconditions and recovery:

1. Before running `make pc` or `pc-format`, commit all your work so the tree is clean.
2. If pc-format failed on a dirty tree: commit (or stash) your changes, then re-run — the rewrites will commit cleanly as a new commit.
3. `make format-commit` remains available as a standalone target with the same "new commit, not amend" behavior, for use outside the `pc-*` pipeline (e.g. formatting before the first commit of a session).

## Running validation per environment

- **`nx_run_pc_chunk` MCP tool available** (connector/local sessions with the nx stdio server): it is **mandatory** for every chunk — `nx_run_pc_chunk({ chunk: "pc-typecheck" })`, in canonical order. It runs `make pc-<chunk>` as a background job (30-min runaway backstop; transport safety comes from the bounded waits, not the process timeout) with a bounded in-call wait, so every call returns cleanly even under the ~60s cloud MCP transport timeout (source: `tools/mcp/nx-server/src/tools/run-pc-chunk.ts`). A chunk that finishes within the ~45s single-call budget returns `{ chunk, passed, output }` (`isError: true` with failure output on failure); a chunk still running at the budget returns `{ chunk, status: "running", jobId, logTail }` while it continues in the background — follow up with `nx_job_wait({ jobId })` (blocks ≤55s; re-invoke while it returns `status: "running"`), `nx_job_status({ jobId })` (non-blocking snapshot), or `nx_job_list()` (recover job handles after a session resume or lost result). **Never re-run a chunk that handed back a jobId** — re-invoking `nx_run_pc_chunk` for the same chunk while it runs joins the in-flight job instead of spawning a duplicate. Two terminal states have a defined recovery: a job killed by the backstop (`error` contains "internal timeout") or reported `orphaned` (job outlived its server or its deadline) may be re-run **once** — Nx caches every task that completed before the kill, so the retry only redoes the interrupted tail (LS-8353).
- **Degraded Claude-Code-web** (no custom stdio MCP servers, `nx_run_pc_chunk` absent from your tool list): the sanctioned path (owner ruling, 2026-07-02) is Bash `make pc-<chunk>` with `run_in_background: true`, **one chunk at a time in canonical order**, waiting for each background completion before starting the next. Foreground `make pc-<chunk>` is blocked by `enforce-background.mjs` (exit 2) — see the [hook truth table](hook-truth-table.md). Pass the plain `make pc-<chunk>` command directly — never wrap it in `nohup ... &`; the harness already backgrounds it, and a `nohup` wrapper's near-instant "completion" is a false positive for the still-running real command (LS-8951, see [cloud-agent-mode](../../cloud-agent-mode/references/platform-detection.md#validation-binding-safety-critical--read-before-running-anything)).
- **Local sessions (Windows or otherwise), regardless of timeout-proneness**: run the seven `pc-*` chunks in canonical order — `make_run({ target: "pc-<chunk>" })` or `nx_run_pc_chunk({ chunk: "pc-<chunk>" })` when the nx MCP server is loaded. This used to be scoped to "timeout-prone" sessions only, with a plain `make pc`/`make_run({ target: "pc" })` recommended otherwise; LS-8797 observed a monolithic `make pc` backgrounded via `run_in_background` in an ordinary, not-previously-flagged local Windows session hang for 40+ minutes with zero output and no child process tree under `make.exe` at all — a Windows/Git-Bash stdout-pipe buffering deadlock (or a step silently blocked on stdin that never gets EOF when backgrounded), not a slow-but-progressing run. Chunking keeps each step a short-lived foreground-from-Make's-perspective process, which avoids the failure mode even though the underlying hazard (a backgrounded Windows child whose stdout pipe fills with nothing draining it) isn't fully root-caused. `make pc`/`make_run({ target: "pc" })` (bypass the `guard-make-pc.sh` block with `# pc-ok` on the Bash form) stays available only as a deliberate, human-confirmed exception for a run you watch live in the foreground of a real terminal — never pass `run_in_background: true` with it.

Before any pc run: check migration status first (AGENTS.md Tier-2; commands in [database](../../database/SKILL.md)).

### pc-test OOM on memory-constrained machines (LS-8666)

`pc-test` / `make test` run `nx affected -t test` across every affected project at full Jest worker parallelism. On a memory-constrained machine this can OOM-crash Node — the failure signature is `Fatal process out of memory: Zone` plus `spawn UNKNOWN` inside a `jest-worker` stack trace, often with a handful of spurious failures in totally unrelated spec files (a crashed worker's queue got reassigned). **That signature means retry with fewer Jest workers, not that the code under test regressed.**

Cap Jest worker parallelism with `MAXWORKERS`/`maxWorkers` (forwarded as `-- --maxWorkers=<n>` to the underlying `nx affected -t test`):

- `make pc-test MAXWORKERS=2` / `make test MAXWORKERS=2`
- `make_run({ target: "pc-test", maxWorkers: 2 })` / `make_run({ target: "test", maxWorkers: 2 })`
- `nx_run_pc_chunk({ chunk: "pc-test", maxWorkers: 2 })`

No effect on non-test targets/chunks.

### Makefile else-branches: no `@true`/`@:` (LS-9959)

`pc` and `pc-test` gate the PowerShell-test step on `PC_HAS_PS1` via `$(if $(findstring PC_HAS_PS1=1,$(_PC_FLAGS)),@$(_PC_TEST_PS_CMD),)` — note the **empty** else-branch. Do not fill that branch with `@true` or `@:` as a "no-op" placeholder: Make's default `SHELL` on native Windows is `cmd.exe`, where `true` is not a builtin (fails the recipe) and `:` is a label token, not a portable no-op either. An `$(if ...)` branch that expands to nothing is skipped by Make entirely — no subshell is spawned — which is the actual cross-platform no-op for a conditional recipe line. Keep the else-branch empty rather than reaching for a shell no-op command.

### pc-lint scopes autofix to the diff, then checks the whole affected set (LS-8777)

`pc-lint` runs two passes, not one: `node scripts/lint-fix-changed.js --base=$(NX_BASE)` autofixes only files changed vs the merge-base (grouped by nearest `eslint.config.*`, same resolution `nx_run_eslint` uses), then an unscoped `pnpm exec nx affected -t lint --base=$(NX_BASE)` (no `--fix`) checks every affected project and fails pc-lint on any violation the scoped pass didn't touch. Before this split, `nx affected -t lint --fix` ran `eslint . --fix` per affected _project_ — fixing every file in the project tree, not just the ones changed, which silently stripped BOMs and deleted `eslint-disable` directives from unrelated specs/configs that then rode along into the commit via `git add -A`. `make lint-fix` (the standalone developer target, not part of `make pc`) still runs the old whole-project `--fix` deliberately — that command's entire purpose is a full auto-fix pass, invoked explicitly by a human, not a silent side effect of validation.

### pc-lint OOM on individual large projects (LS-9114)

The unscoped check pass (`nx affected -t lint`) runs `eslint .` across every affected project at nx's default project-level parallelism (`nx.json`: 5 concurrent projects). On a memory-constrained machine, several large `eslint .` processes running concurrently (each ballooning to 2-5GB RSS) can OOM-kill individual large projects — notably `lambdas/db` and `cli` — even though overall memory has headroom at other points in the run. The failure surfaces as `Killed` in the eslint subprocess output and a non-zero `make pc-lint` exit; a bare retry of the same project in isolation succeeds immediately, and nx may mislabel the retried task "flaky" — masking that the root cause was memory pressure, not flakiness. **That signature means retry with lower nx parallelism, not that the project's lint actually failed.**

Cap nx's project-level parallelism with `PARALLEL`/`parallel` (forwarded as `--parallel=<n>` to the check pass's `nx affected -t lint`; `make lint-fix`'s own `--fix` run takes the same flag directly):

- `make pc-lint PARALLEL=2` / `make lint-fix PARALLEL=2`
- `nx_run_pc_chunk({ chunk: "pc-lint", parallel: 2 })`
- `make_run({ target: "pc-lint", variables: "PARALLEL=2" })`

No effect on non-lint targets/chunks.
