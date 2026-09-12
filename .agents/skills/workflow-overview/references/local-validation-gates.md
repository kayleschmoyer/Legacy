# Local Validation Gates — Hooks, make pc, Self-Review, and the Spec Gate

> Loaded from [workflow-overview SKILL](../SKILL.md).

## Local validation gates

Three local gates run before code reaches CI.

### Pre-Commit Hook (5 checks)

Installed via `pnpm security:install-hooks` (copies `scripts/git-hooks/pre-commit` into `.git/hooks/pre-commit`). Runs on `git commit`:

| #   | Check                               | Purpose                                                                              |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | Secret validation                   | Scans staged files for accidentally committed secrets                                |
| 2   | YAML linting                        | Validates syntax of staged `.yml`/`.yaml` files (via `yamllint`)                     |
| 3   | JSON linting                        | Validates syntax of staged `.json` files (via `jsonlint`)                            |
| 4   | Migration immutability              | Ensures previously-landed migrations are not modified or deleted                     |
| 5   | `@legacy-sports` package validation | Prevents npm-installing workspace packages that should use pnpm workspace references |

### `make pc` (pre-commit pipeline)

The full pre-commit validation pipeline backed by the `pre-commit` Makefile target. **Must pass before a PR is marked ready** (a draft PR may be opened earlier as a durability checkpoint without `make pc` having passed — see the [spine's draft-PR-before-validate gate](ticket-to-merge-spine.md#critical-gates-preconditions)).

1. Migration immutability check (ensures previously-landed migrations are not modified or deleted)
2. Schema generation for database changes (`nx run db:print-schema`)
3. DB code generation for database changes (`nx affected -t codegen`)
4. `nx affected -t typecheck` -- TypeScript type checking on affected projects
5. `nx format:write` -- auto-formats code; if the working tree was clean, it formats and commits the rewrites as a new commit (never amends the tip — LS-8367), otherwise you must commit the formatted files and re-run
6. `scripts/lint-fix-changed.js` auto-fixes only files changed vs the merge-base, then `nx affected -t lint` (no `--fix`) checks every affected project -- scoping autofix to the diff prevents ESLint from rewriting files the agent never touched (LS-8777)
7. Workflow validation (`scripts/validate-workflows.js`) -- JSON schema, working-directory paths, and yamllint over every workflow/action file. Without yamllint installed locally it prints a `yamllint DID NOT RUN` banner and continues; under `CI` or `REQUIRE_YAMLLINT=1` that is a failure (LS-10104)
8. `nx affected -t test` -- Jest unit/integration tests on affected projects
9. `nx affected -t build` -- build validation on affected projects

Some steps are conditionally skipped (e.g., steps 1-3 for non-database changes, steps 4/6/8/9 for docs-only changes).

### Pre-Push Hook (format & safety checks)

Installed via `make setup-hooks` (copies `.github/hooks/pre-push` into your Git hooks dir). Runs on `git push`:

| #   | Check / Behavior                            | Purpose                                                                      |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Stray lockfile scan                         | Rejects tracked `package-lock.json` / `yarn.lock` (this repo is pnpm-only)   |
| 2   | Conflict marker scan \*                     | Prevents pushing files that still contain unresolved merge conflict markers  |
| 3   | Conditional `terraform validate` \*         | Validates Terraform when Terraform files are part of the push                |
| 4   | `nx format:write` \*                        | Auto-formats code before push                                                |
| 5   | Auto-amend + abort on formatting changes \* | Amends the last commit with formatting changes and aborts the push to review |

\* Checks 2--5 only run when `node_modules` is present (i.e., a non-docs-only worktree). In docs-only worktrees without dependencies, the pre-push hook exits after the lockfile scan. Can be bypassed with `--no-verify`.

### Self-review gate (local)

The [spine's self-review gate](ticket-to-merge-spine.md#critical-gates-preconditions) is mandatory before the first push. Locally: run `make lint-review-patterns` to auto-check the mechanical patterns, fix any violations, then run the `/review` skill for the judgment-requiring patterns. Read every changed file **in full** (not just diff hunks); check patterns #3, #4, #7, #8, #9, #19, #20 from [common-review-patterns.md](../../pr-lifecycle/references/common-review-patterns.md); and produce a brief Self-Review Summary before pushing. `make pc` passing is necessary but not sufficient — it does not run Playwright tests at all.

### Local spec gate (integration tests)

If **any** of these is true, running the integration spec locally is a **mandatory gate before pushing**: the ticket has a "failing test" / "run the spec locally" / "DO NOT SUBMIT" block; the ticket names a specific spec as a verification gate; or **you modified any `.integration.spec.ts` file**. Before running, verify `node_modules/.bin/playwright` exists (run `node scripts/modules-pool/link.mjs` if not — it is missing in freshly set up worktrees), then run the specific spec against the live backend and confirm it passes. The following are **not** valid reasons to skip — treat each as a stop condition requiring user input:

- **⛔ "Requires real infrastructure"** — integration specs run against the live backend with test-user credentials auto-linked from the main repo's `.env`; no extra setup is needed in a standard worktree. If credentials are genuinely absent, ask the user.
- **⛔ "CI passed anyway"** — integration tests are **not run in CI for PRs**; the CI E2E suite only covers hermetic mocked specs. A CI green gives zero signal for integration correctness. Local execution is the only gate that exists.
- **⛔ "Running locally races CI on shared accounts"** — integration tests are not run in CI on PRs, so there is no concurrent run to race. The premise is false.
- **⛔ "Fix is structurally identical to a verified fix / analogous to LS-####"** — structural similarity is not evidence of correctness in a different runtime context; code analysis is not a substitute for the observation the ticket required.
- **⛔ "make pc passed"** — `make pc` does not run Playwright tests. Necessary, not sufficient.
