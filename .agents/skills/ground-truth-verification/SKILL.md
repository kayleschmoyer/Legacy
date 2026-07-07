---
name: ground-truth-verification
description: 'Per-claim-type probe recipes for verifying any statement about this repo against code before acting on it or writing it down. Load when: about to cite a command, tool name, port, CI gate, schema fact, or Make target from a doc; writing or reviewing documentation; debugging why a documented behavior does not happen; or applying the retrieval-led-reasoning rule from AGENTS.md.'
metadata:
  scope: '**'
---

# Skill: Ground-Truth Verification

Prose in this repo drifts; code does not. The 2026-07 skills audit disproved ~90 documented claims — every one with a single cheap probe. This page packages those probes. **Before acting on or restating any claim of the types below, run the matching probe.** A wrong runbook step costs more than the 10 seconds the probe takes.

Tooling note: prefer the `Grep`/`Glob`/`Read` tools and MCP equivalents (`nx_show_project`, `db_query`) when available; the bash one-liners below are the degraded-session fallback and are all quick enough to run foreground. See [mcp-first](../mcp-first/SKILL.md) for which tool surface a session has.

## Probe routing table

| Claim type                            | Probe                                                                   | Output proves                                             |
| ------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| "Project X's tests run in CI"         | `pnpm exec nx show project <X> --json` → `.targets.test`                | The merged target nx actually executes (executor + flags) |
| "This jest config runs these files"   | `pnpm exec jest --config <path> --listTests`                            | The exact spec files the config matches                   |
| "Hook Y blocks Z"                     | Read the hook script; find its exit codes                               | exit 2 = blocks; exit 0 + stdout = warns only             |
| "Check C is required for merge"       | `.github/ruleset.json` (config) + live ruleset via `gh api`             | Config intent vs live enforcement — they can differ       |
| "Column/enum X exists in the DB"      | Read `lib/db-client/src/drizzle/public/models/` (+ `db_query` if avail) | Schema truth; the schema doc is known-stale               |
| "MCP tool T exists"                   | Grep `tools/mcp/*/src` for `'T'`; or check the live session tool list   | Tool is registered (or was invented by a doc)             |
| "Env var V is set in CI"              | Grep `.github/workflows/` for `V`                                       | A workflow actually injects it (or nothing does)          |
| "App X runs on framework F / port P"  | Read the app's bundler config + `project.json` serve target             | Real executor and port                                    |
| "Make target M exists / does X"       | Grep `Makefile` for `^M:` and read the recipe                           | Target exists and what it really runs                     |
| "Skill/doc D exists"                  | `Glob .agents/skills/*/SKILL.md` / `Glob docs/**/<D>*`                  | The file is really there before you link it               |
| "git log/blame shows the origin of X" | `git rev-parse --is-shallow-repository` first                           | Whether history is even visible (this clone is shallow)   |

Details and worked examples below. Each worked example is a real find from the 2026-07 audit of this repo.

## 1. "Project X's tests run in CI"

```bash
pnpm exec nx show project stats-lambda --json   # then inspect .targets.test
```

What it proves: nx merges `project.json` targets over `package.json` scripts and inferred targets. The `.targets.test` entry — its `executor` and `options` — is the only truth about what `nx affected -t test` runs. A `package.json` `"test"` script is dead text whenever `project.json` defines the target.

- `executor: "@nx/jest:jest"` with a `jestConfig` → nx runs jest directly with that config.
- `executor: "nx:run-script"` → nx runs the `package.json` script **verbatim** — read the script for hidden flags.

Worked example: as of 2026-07-02, 11 lambda `package.json`s still say `"test": "jest --onlyChanged"` — a flag that runs **zero tests on a clean tree** (all of CI, since CI runs post-commit). Until 2026-07-02 that script _was_ the merged target for 9 lambdas, so their unit suites (including lambdas/db's ~90 resolver specs) never gated merge, and a premium-breaking resolver bug shipped past green CI (LS-8247, RCA in commit `8575ba9`). Closed 2026-07-02 for every jest-bearing lambda **except `lambdas/db`** (deliberately left ungated over pre-existing red unit debt — its merged target is still `jest --onlyChanged`): the gated lambdas' `project.json`s now define `@nx/jest:jest` test targets with `passWithNoTests: false`, so their unit suites gate merge via `nx affected -t test` ([testing → What Gates Merge](../testing/SKILL.md#what-gates-merge) is the home). The probe distinguishes the states instantly — run it against both `stats-lambda` and `db` to see one of each.

## 2. "This jest config runs these files"

```bash
pnpm exec jest --config lambdas/stats-lambda/jest.config.ts --listTests
```

What it proves: the literal file list the config's `testMatch`/`roots` resolve to — settles any "are these specs even picked up" or naming-convention dispute without running a test.

Worked example: docs claimed DB-touching Jest specs are named `*.integration.spec.ts`; `--listTests` against the lambdas/db configs shows the real convention is `*.db.spec.ts` (matched by `lambdas/db/jest.db.config.ts`) — zero Jest `*.integration.spec.ts` files exist in the repo.

## 3. "Hook Y blocks Z"

Hooks live in **two** directories — read both: `.claude/hooks/` and `.agents/hooks/`. Read the script, not its description; find every `process.exit(...)` / `exit` statement.

- `exit 2` → the tool call is **blocked**.
- `exit 0` after printing to stdout → **warning only**; the command still runs.

Worked example (both from the audit): `.claude/hooks/guard-bash-mcp-first.sh` — its own header says "Always exits 0 — this is a WARNING hook" — yet repo-tooling prose claimed it blocks `ls`/`find`/`cat`. Conversely `.agents/hooks/enforce-background.mjs` genuinely `process.exit(2)`-blocks foreground `make pc-<chunk>`, `nx affected`, and `nx run-many` (bypasses: `run_in_background: true` or a `# bg-ok` comment). Two hooks, opposite enforcement, both misdescribed in prose — only the scripts knew.

## 4. "Check C is required for merge"

Two layers, deliberately staged — never conflate them:

- **Config**: `.github/ruleset.json` in-repo. As of 2026-07-02 it requires exactly 4 contexts: `bot-review`, `No Merge Conflicts`, `Verify All Migrations Applied`, `CI Gate` (post-LS-8014; the granular `🚀 CI Pipeline / *` names were removed from the required set).
- **Live**: applied to GitHub only when a maintainer runs `bash scripts/apply-ruleset.sh`. Until then the live ruleset can lag config, and `check-ruleset.yml` (non-required drift check) reports drift — **expected**, not a bug.

To check live state, do what `check-ruleset.yml` does:

```bash
gh api "repos/<owner>/<repo>/rulesets" --jq '.[] | select(.name == "Protect Main") | .id'
gh api "repos/<owner>/<repo>/rulesets/<id>"   # inspect required_status_checks
```

or read the latest `check-ruleset.yml` run output. As of 2026-07-02 the live cutover state is **UNKNOWN from the repo alone** — assert live required checks only after this probe. Merge-gate semantics home: [pr-lifecycle](../pr-lifecycle/SKILL.md).

## 5. "Column/enum X exists in the DB"

Ground truth is the drizzle model layer, then the live DB — in that order:

```bash
ls lib/db-client/src/drizzle/public/models/          # one file per table cluster
# enums: lib/db-client/src/drizzle/public/models/Enums.ts (pgEnum definitions)
```

With DB access (hosted DB MCP server), confirm live: `db_query` against `information_schema.columns` / `pg_enum`. Treat `docs/architecture/database-schema.md` as **untrusted** — the audit found it baseball-only and wrong on enums and permissions.

Worked example: database-schema.md documents a `draft_type` enum; `Enums.ts` contains no such `pgEnum` — the real ones are `draft_order` and `draft_mode`. Domain/data-model home: [domain-reference](../domain-reference/SKILL.md).

## 6. "MCP tool T exists"

Tools are registered in each server's source via `server.tool('<name>', ...)`:

```bash
grep -rn "'github_get_review_threads'" tools/mcp/github-server/src/   # hit → exists
grep -rn "github_list_review_threads" tools/mcp/                      # no hit → invented
```

In a live session, the tool list (or `ToolSearch`) is equally authoritative for hosted connectors, whose source is not in `tools/mcp/`.

Worked example: multiple sweep docs cited `github_list_review_threads` — zero matches anywhere under `tools/mcp/`; the registered tool is `github_get_review_threads` (`tools/mcp/github-server/src/index.ts`). Citing an unverified tool name sends the next agent into a retry loop. Server/session routing home: [mcp-first](../mcp-first/SKILL.md).

## 7. "Env var V is set in CI"

```bash
grep -rn "VITE_GROWTHBOOK_CLIENT_KEY" .github/workflows/
```

What it proves: whether any workflow actually injects the var at build/run time. No match = the var is never set in CI, whatever the feature doc promises.

Worked example: docs/feature-flags.md promised football could launch by flipping a GrowthBook flag "without a redeploy"; this grep returned **zero matches** before 2026-07-02, so production builds never loaded feature flags and the launch lever was inert. Wired 2026-07-02 (`deploy-web.yml`, `deploy-pr-preview.yml` set `VITE_GROWTHBOOK_CLIENT_KEY`). Caveat: for _app-code_ consumption (as opposed to CI injection), a name-grep misses bracket access and `getEnvVar*` helpers — see [config-and-flags](../config-and-flags/SKILL.md).

## 8. "App X runs on framework F / port P"

Read the app's bundler config and `project.json` serve target — never a doc:

```bash
head -20 apps/web/vite.config.mts
grep -n '"port"' apps/web/project.json
```

Worked example: four separate docs (architecture, dev-environment, docs/README, root README) said the web app is Next.js on port 3000. Reality: `apps/web/vite.config.mts` exists (Vite + react-router-dom) and `apps/web/project.json`'s `serve` target uses `@nx/vite:dev-server` with `"port": 4200`. Every downstream claim (cache dirs, start commands, proxy URLs) inherited the same error.

## 9. "Make target M exists / does X"

```bash
grep -n "^deploy-infrastructure:" Makefile   # target definition
grep -n "deploy-infrastructure" Makefile     # comments mentioning it count too
```

Then read the recipe — target names routinely outlive their behavior. Worked example: repo-tooling's makefile reference listed `make deploy-infrastructure`; the only Makefile match is a comment stating the target was **removed in LS-2425**. Also read for OS forks — some targets are Windows-only stubs on Linux.

## 10. "Skill/doc D exists"

Before linking any skill or doc, confirm the file:

```bash
ls .agents/skills/<name>/SKILL.md
```

(or `Glob` for `.agents/skills/*/SKILL.md` / `docs/**/<name>*`). Worked example: the sweep-doc cluster cited skills `resolve-merge-conflicts`, `rebase-and-conflicts`, and `debug-ci-failure` — none exist; each dead link strands the reader mid-runbook.

## 11. "git log/blame shows where X came from"

```bash
git rev-parse --is-shallow-repository   # prints: true
```

This clone is **shallow** (grafted 2026-06-22): `git log`, `git blame`, and `git log -S` silently return nothing for anything older than the graft — absence of history is NOT evidence of absence. For pre-graft provenance use the incident record instead: [failure-archaeology](../failure-archaeology/SKILL.md).

## Citation discipline (applies to everything you write)

- **Cite symbols and anchors, not line numbers.** The audit found `:NNN` citations wrong in 6+ places — line numbers rot on the next edit. Write `entitlements.ts ENTITLEMENTS map`, `Makefile pc-db-prep recipe`, `ruleset.json required_status_checks`, not `entitlements.ts:49`.
- **No unmaintained counts.** "56 skills" and "19 packages" were both wrong at audit time. Write "see `.agents/skills/`" instead of a number.
- **Date-stamp volatile facts.** Anything that a future commit can silently change (required checks, gate wiring, live infra state) gets "as of YYYY-MM-DD".
- **Label the unverified.** If a probe is impossible from your session (live ruleset without `gh api`, live Stripe state, deployed Lambda config), write **INFERENCE** or **OPEN** next to the claim — never state it as fact.
- **Never copy a claim from an old doc without re-probing it.** Old docs are hypotheses, not sources.

## When NOT to use this skill

This is **method, not map**. For _where things live_, use [architecture](../architecture/SKILL.md) and its FILE-MAP. For _whether a failure happened before and how it was fixed_, use [failure-archaeology](../failure-archaeology/SKILL.md). Come here when you have a specific claim in hand and need to know if it is true.

## Related skills

- [mcp-first](../mcp-first/SKILL.md) — which tool surface (MCP vs Bash) your session has for running these probes.
- [skill-authoring](../skill-authoring/SKILL.md) — verify-before-citing is a precondition for every doc edit.
- [debugging](../debugging/SKILL.md) — when a probe disproves a doc, the doc was the bug; fix or flag it.
- [failure-archaeology](../failure-archaeology/SKILL.md) — incident history and the shallow-clone record.
- [config-and-flags](../config-and-flags/SKILL.md) — full env-var access-style matrix behind probe 7.
- [domain-reference](../domain-reference/SKILL.md) — data-model ground truth behind probe 5.

## Provenance and maintenance

Created 2026-07-02 from the Phase-1 skills audit (scratch/skills-audit synthesis), which disproved ~90 documented claims using exactly these probes. Every probe above was re-executed against the working tree on 2026-07-02 before being written down. Re-verification commands for volatile facts:

- Lambda test gating (probe 1): `pnpm exec nx show project stats-lambda --json` — `.targets.test.executor` must be `@nx/jest:jest`.
- Hook enforcement (probe 3): re-read `.claude/hooks/guard-bash-mcp-first.sh` and `.agents/hooks/enforce-background.mjs` exit codes.
- Required merge contexts (probe 4): `grep -n '"context"' .github/ruleset.json`; live state via the probe-4 `gh api` commands.
- GrowthBook CI wiring (probe 7): `grep -rn VITE_GROWTHBOOK_CLIENT_KEY .github/workflows/`.
- Web port (probe 8): `grep -n '"port"' apps/web/project.json`.
- Shallow clone (probe 11): `git rev-parse --is-shallow-repository` — if `false`, delete probe 11's caveat.
