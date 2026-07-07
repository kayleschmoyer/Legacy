# Ground-Truth Audit — Software & Documentation (2026-07-07)

**Scope**: full re-verification of the repo's documented claims and enforcement mechanisms against code reality, four days after the 2026-07-02 skills audit. Six parallel read-only audit passes (AGENTS.md/CLAUDE.md claims, hook enforcement, CI/merge gates including live GitHub state, code-quality rule enforcement, skill/slash-command cross-references, core human-facing docs), plus direct execution of the repo's own self-check lint battery (`lint-agent-prompts`, `lint-skills`, `lint-review-patterns`, `lint-touch-map`, `lint-workflows`).

**Method**: every claim treated as a hypothesis and probed per `.agents/skills/ground-truth-verification/SKILL.md`. Volatile facts are date-stamped; unverifiable claims are labeled OPEN. Citations use symbols/anchors, not line numbers.

**Headline verdict**: the agent-instruction layer (AGENTS.md, skills, slash commands, merge gates) is in strong shape — the 2026-07-02 rewrite held up on nearly every probe, all four required merge checks match live GitHub state with real producers, and prompt-mirror sync is genuinely CI-enforced. The gaps are concentrated in three places: **(1) two ESLint enforcement mechanisms that are silently dead or absent** (the inline-`gql` tag ban and any `eslint-disable` ban), **(2) client-side hook enforcement that is far weaker than prose implies** (especially the Tier-1 "never commit to main" rule in cloud), and **(3) human-facing docs that never got the 2026-07-02 correction pass** (root README, architecture README, setup/troubleshooting guides).

---

## 1. What held up (confirmed accurate)

- **AGENTS.md / CLAUDE.md**: zero broken-path claims. All 16 cited Make targets exist and do what's documented — `make pc` really is a 9-step pipeline; the seven `pc-*` chunks exist in the documented order (`pc-db-prep → pc-typecheck → pc-format → pc-lint → pc-workflows → pc-test → pc-build`); `kill-stale` really is a Linux stub. All 29 checked file paths exist. All 45 skill dirs are referenced (zero orphans); `credentials/` and `cli-usage/` are proper deprecation stubs as documented.
- **Merge gates (as of 2026-07-06, live via `github_get_branch_protection`)**: `.github/ruleset.json` requires exactly `bot-review`, `No Merge Conflicts`, `Verify All Migrations Applied`, `CI Gate`; **live state matches config**, and each context has a producing workflow (`review.yml` reviewer commit status, `check-conflicts.yml`, `check-migrations-applied.yml`, `ci-pipeline.yml` `ci-gate.js` aggregate). The LS-8014 CI Gate cutover has evidently been applied.
- **Prompt-mirror drift is CI-enforced**: `ci-pipeline.yml` `custom-checks` job runs every `.github/checks/*.sh`, including `agent-prompts-sync.sh` (`sync-agent-prompts.mjs --check`), which feeds the required `CI Gate`. Currently green: 96 generated files from 26 commands, in sync; the 2 canonical-only commands (`recover-stall`, `sync-designs`) correctly carry `agents: 'claude'`.
- **pnpm enforcement**: `packageManager: pnpm@9.12.1` plus a `preinstall` guard (`scripts/preinstall-guard.js`) that rejects npm/yarn and protects worktree symlinks.
- **No invented MCP tool names in live use**: all cited-as-usable tools verified against 206 registered names in `tools/mcp/*/src`; every unmatched citation is an explicitly-labeled future tool, a documented-as-removed name, or not a tool name.
- **Clean rules**: `route.continue()` in `apps/web-e2e/src/tests/` — 0 violations; `@ts-ignore`/`@ts-nocheck` — 0 in source (mechanically banned via `ban-ts-comment`).
- **Docs that verify clean**: `docs/README.md`, `docs/DOCUMENTATION_STRUCTURE.md`, `docs/feature-flags.md` (GrowthBook key confirmed wired in `deploy-web.yml`, `deploy-pr-preview.yml`, `build-android-app.yml`; all four inventoried flags live in code), `docs/dev-process/llm-environments.md`, `docs/architecture/multi-sport.md` (the `sport` discriminator claims are code-verbatim accurate), and `.agents/skills/repo-tooling/references/hook-truth-table.md` (accurate on every verified row — the one hooks doc that matches the code).
- **Skill hygiene**: all 45 SKILL.md files have valid frontmatter matching their dirs; no stale "as of" dates (everything ≥ 2026-06); shallow-clone claim re-confirmed (`git rev-parse --is-shallow-repository` → `true`).

---

## 2. Enforcement gaps (ranked)

### P1 — Enforcement believed to exist but mechanically broken or absent

1. **The inline-`gql` tag ban is silently dead** (root `.eslintrc.json`). The `no-restricted-syntax` override banning `` gql` `` tagged templates is clobbered wholesale by the later env-var-selector override for the same `files` set — the exact "LS-7947 last-override-wins hazard" that `apps/web-e2e/.eslintrc.js` documents. Verified empirically: ESLint reports zero `no-restricted-syntax` messages on `apps/app/src/screens/AnalyticsScreen.tsx`, which contains two inline `gql` tags. ADR-0004's claim that ESLint "rejects new gql" is currently untrue for the tag form (the `no-restricted-imports` half does fire, but is suppressed in that file by a file-level `eslint-disable`). **Fix**: merge the gql `TaggedTemplateExpression` selector into the surviving `no-restricted-syntax` override; migrate `AnalyticsScreen.tsx` to codegen.

2. **`label-sync.yml` will delete two workflow-consumed labels on its next run.** The sync is explicitly exhaustive ("labels not listed in the file are deleted"), and live labels `schema-breaking-ok` (consumed by `check-schema.yml` / schema-contract check) and `docs: touch-map gap` (applied by `scripts/lint-touch-map.js`) are **not** in `.github/labels.yml`. **Fix**: add both to `labels.yml`.

3. **"No suppression" is unenforced for `eslint-disable`.** Only the ts-comment half is mechanical. No `eslint-comments` plugin exists anywhere; the only checks are the diff-scoped `lint-review-patterns` (self-review only, not CI) and the LLM reviewer. Reality: ~688 `eslint-disable` occurrences, ~290 in live linted source (hotspots: `lambdas/db` ~90, `lib/shared-components` ~47, `apps/web` ~33, `apps/app` ~31), 466 with no `-- description`. **Fix**: adopt `@eslint-community/eslint-plugin-eslint-comments` (`require-description` at minimum) and burn down.

4. **Tier-1 "NEVER commit to main" has zero client-side enforcement in cloud.** `guard-main-repo.sh` blocks by hardcoded Windows path (`D:/code/legacy-sports`) + worktree existence — it never checks the branch and is a guaranteed no-op on Linux. The `.github/hooks/pre-push` hook is not installed in cloud checkouts (`.git/hooks/` samples only, `core.hooksPath` unset) and contains no main-branch check anyway. The only real barrier is the server-side ruleset `pull_request` rule — and the repo owner is an always-bypass actor. `worktree-workflow/SKILL.md`'s claim that the hook "blocks edits on `main`" is drift (hook-truth-table is honest about this). **Fix**: add a branch check to a PreToolUse hook (or a pre-push hook installed by setup) and correct the skill prose.

5. **`enforce-background.mjs` is evadable via the repo's own mandated syntax.** The block regex requires `make` immediately followed by `pc-*`, so `make -C $wt pc-typecheck` — the exact flag form AGENTS.md's Command Patterns section requires — is not matched; only the first line of a multi-line command is scanned. Same regex-shape gap in `guard-make-pc.sh` (`make -C <dir> pc` undetected). **Fix**: allow an options/`-C <dir>` prefix in both regexes and scan all lines.

6. **Never-linted projects harbor a live lint error.** `lambdas/image-upload`, `lib/app-config`, and `lib/graphql` have no ESLint config so `@nx/eslint/plugin` infers no lint target; `lib/codegen` and `apps/video` aren't Nx projects at all. `lib/codegen/codegen.base.ts` produces a real `no-console` **error** when ESLint is run on it manually — invisible to every pipeline. Additionally, the root `no-console` rule only covers `*.ts,*.tsx` (JS files exempt), and the config's exception list has diverged from AGENTS.md in **both** directions (undocumented carve-outs: `apps/app-e2e`, `apps/web-e2e` `src/**`, various `codegen.ts` files, `.storybook/**`, `lambdas/db` fixtures). **Fix**: give the unlinted projects configs; sync the AGENTS.md exception list with the real overrides.

7. **Lint is affected-only everywhere, with no full-repo sweep.** CI `lint` and `make pc-lint` both run `nx affected -t lint`; no workflow anywhere runs `nx run-many -t lint`. Any repo-wide rule change (e.g. fixing gap #1) never re-checks untouched projects, so stale violations persist indefinitely. **Fix**: add a scheduled full-repo lint job.

8. **`make lint-review-patterns` is red and nothing runs it.** On the current tree it exits 1 with **87 errors / 104 warnings** (including plausibly real findings such as unsanitized git-ref arguments in `tools/mcp/worktree-server` `runGit(['show', sha, ...])` call sites), appears in no workflow, and on shallow clones spams dozens of `fatal: origin/main...HEAD: no merge base` before falling back. A documented self-review gate that fails wholesale trains agents to ignore it. **Fix**: triage the 87 errors, add a merge-base fallback (like `lint-touch-map` has), and decide whether it should join `custom-checks`.

9. **Test-gating soft spot: `lambdas/draft-processor`.** It is jest-bearing but has no explicit `project.json` test target — its merged target is plugin-inferred and inherits `passWithNoTests: true` from `nx.json` `targetDefaults`, outside the LS-8247 hardening pattern (11 lambdas have explicit `@nx/jest:jest` + `passWithNoTests: false`; `lambdas/db` is deliberately ungated). The ground-truth skill's "every jest-bearing lambda except `lambdas/db`" wording overclaims. **Fix**: add the explicit test target; correct the skill sentence.

10. **`Required Checks Lint` never completed its staged rollout.** `required-checks-lint.yml`'s own header says step 2 was to add it to the required set; it remains advisory, runs only when workflow/ruleset files change, and is paths-filtered (which would violate its own assertion #2 if promoted as-is). **Fix**: remove the paths filter and promote, or delete the stale staging note.

11. **Stop-gate hooks silently no-op in cloud.** `check-open-pr.sh` requires the `gh` CLI (absent in this cloud environment — it exits 0 silently) and `check-incomplete-work.sh` only fires for `/.claude/worktrees/` paths (cloud cwd is `/home/user/legacy-sports`). Docs present these as active drive-to-merge stop-blockers without the dependency caveat. Similarly `cleanup-orphaned-symlinks.sh` claims in its header to run at SessionStart but is registered nowhere for Claude Code (only the Copilot twin is wired).

12. **`block-tmp-polling.mjs` is simultaneously overbroad and porous.** Confirmed live in this session: it blocked a `Read` of the harness-assigned scratchpad (`/tmp/claude-0/...` matches its pattern), yet `Bash: cat` of the very task-output files it targets passes with at most a warning. Its advisory text also recommends a `TaskGet` tool that doesn't exist in the current surface. **Fix**: exempt the sanctioned scratchpad path, cover Bash reads or soften the claim, update the advisory text.

13. **Shared-components-first has no mechanical backing.** `@nx/enforce-module-boundaries` is configured with the wildcard no-op constraint (`sourceTag: "*" → onlyDependOnLibsWithTags: ["*"]`) while projects carry meaningful tags (`platform:web`, `platform:shared`, `type:ui`) that nothing consumes. **Fix**: write real `depConstraints` against the existing tags.

14. **`check-skipped-tests` is a reporting tool nobody runs.** Not invoked by CI, `make pc`, or hooks; never passed `-FailOnSkipped`; regex only matches `test.skip(` in `*.spec.ts`/`*.test.ts` — it misses the 2 live `it.skip` in `lambdas/game-selection` handlers, plus `describe.skip`/`.only`/`xit`/`test.fixme`/`.tsx`. **Fix**: widen the regex and wire `.only` detection into `custom-checks`.

**Hook execution note (corrects a tempting wrong conclusion)**: PreToolUse hooks demonstrably DO fire in interactive cloud sessions — `block-tmp-polling.mjs` blocked a Read in this very session. However, hooks do not appear to fire inside SDK subagent harnesses (the compact counter was absent after 17+ tool calls in one). Treat subagent sessions as hook-free; main-session enforcement is real, subject to the per-hook gaps above.

### P2 — Documentation drift (would mislead a reader today)

15. **Root `README.md` still teaches the retired stack**: "Next.js web" (three places — reality: Vite + React SPA, port 4200), "React Native CLI" (reality: Expo 56 + expo-router), dead lowercase `agents.md` link (file is `AGENTS.md` — dead on case-sensitive systems), setup step `cp apps/web/.env.example ...` (file doesn't exist), "19 packages" in `lib/` (26 dirs; violates the repo's own no-counts rule), incomplete `lambdas/`/`apps/` listings. This is the exact error class the 2026-07-02 audit fixed in `docs/README.md` — the front door never got the pass.

16. **`docs/architecture/README.md`: "Web App: Next.js with SSR/SSG"** — wrong framework _and_ rendering model, in the architecture "start here" hub, directly contradicting the stack-corrections block in `docs/README.md` one level up.

17. **Database-recovery runbooks are broken.** `docs/guides/troubleshooting.md` and `docs/guides/development-setup.md` tell devs to run `pnpm exec nx run db:migrate` (4 occurrences — project `db` is the GraphQL lambda; no such target; real path is `pnpm --prefix lib/db-client run db:up` / root `db:migrate` script), `pnpm run cli ...` (no such root script), `nx run game-selection:dev` (target is `serve`), `Copy-Item .env.template ...` (no such file), and reference `.agents/skills/db-restore-dev/SKILL.md` (twice — skill doesn't exist). Troubleshooting also still probes port 3000 (nothing listens there).

18. **`docs/api/graphql-schema.md`**: dev endpoint given as `localhost:5001/graphql` (5001 is the OAuth proxy; GraphQL dev is 5000) and its "Core Types" (`CreateUserInput`, `LeagueStatus`, `User.profilePicture`) have zero matches in the generated `lambdas/db/schema.graphql` despite the "auto-generated" footer claim.

19. **`docs/architecture/build-system.md`**: lists a nonexistent `lib/sentry` (Rollbar since migration), pins "Nx 21.5.2" (actual 22.7.1), stale `DEVELOPMENT_SETUP.md (when created)` pointer. Not banner-marked stale, unlike `database-schema.md` (which remains wrong in body — `draft_type`, owner/commissioner permission values, baseball-only scope — but is properly bannered, so acceptable).

20. **`docs/dev-process/session-startup.md`**: claims five SessionStart entries (there are four; the `.ps1` isn't registered) and lists `legacy-sports-rollbar` as a `.mcp.json` stdio server (it isn't; `local-git` and `stripe` are unlisted).

21. **Skill-network dead links** (the full sweep found these genuinely broken): `standards/references/codegen-policy.md` → `../../codegen/SKILL.md` (skill removed with no stub — the stub policy was applied unevenly vs. `credentials`/`cli-usage`); `.claude/commands/rebase.md` → `Skill(skill: "rebase")` (self-referential loop, also reached from `fix-pr.md`, propagated into all 4 mirrors); `testing/SKILL.md` cites a nonexistent `apps/web-e2e/.eslintrc.json` no-console carve-out (file and claim both wrong); `infrastructure/references/version-information.md` → `.github/actions/build-lambda/action.yml` (no such action) and a moved `AboutPage.tsx` path; `worktree-workflow/references/rebase/rebase-conflict-strategies.md` → nonexistent `apps/app/src/api/db/graphql.generated.ts`; `plan-ticket/references/qa-coverage-model.md` cites a nonexistent design-bundle worked example; several `skills/...` refs missing the `.agents/` prefix.

22. **Retired-tool mentions flagged by the repo's own `lint-skills`** (18 warnings, all real): `github_list_review_threads` in `ground-truth-verification/SKILL.md` and `pr-lifecycle/references/sweep.md`; `ScheduleWakeup` in `mcp-first/SKILL.md`; `github_resolve_thread`/`github_pr_files` in sweep refs; line-number citations; spine-ordering restatements in four files. (Some are deliberate "example of a purged name" mentions — the linter can't tell; consider a lint pragma.)

23. **Stale "expected drift" prose**: `ruleset.json` `_comment` and `ground-truth-verification/SKILL.md` §4 still describe the CI Gate cutover as pending/owner-gated; live matched config as of 2026-07-06.

24. **Small AGENTS.md nits**: `make worktree` not annotated Windows-only (the recipe is a Linux stub); commit-format convention is not machine-enforced (no commitlint/husky); `create/references/create-skill.md` writes "59 skills" — violating the no-counts rule that two neighboring skills cite as their canonical example (45 dirs exist); `subagent-templates/SKILL.md` says "symlinked" where the files are `@import` stubs; `shared-components.md` mentions `next-auth` (not a dependency anywhere); `multi-sport.md` understates the football stats tables (`FootballStatistics.ts` defines full season/career passing/rushing/receiving/kicking/defense tables, not just IDP).

### OPEN (unverifiable from this session)

- Live ruleset `pull_request` rule parameters, `non_fast_forward`/`deletion` rules, `bypass_actors`, and `strict_required_status_checks_policy` — the MCP surface exposes required checks/review count only; full comparison needs the `check-ruleset.yml` admin-token path.
- Whether hooks fire in _interactive_ cloud sessions beyond the PreToolUse layer observed here (Stop/SessionEnd unobserved).
- Deployed Lambda/live Stripe/production endpoint claims in deployment docs (out of scope for this pass).

---

## 3. Remediation backlog (ticket-sized, prioritized)

| #   | Fix                                                                                                                                                                                                     | Area    | Effort |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| 1   | Add `schema-breaking-ok` + `docs: touch-map gap` to `.github/labels.yml`                                                                                                                                | CI      | XS     |
| 2   | Repair the clobbered `no-restricted-syntax` gql-tag ban; migrate `AnalyticsScreen.tsx`                                                                                                                  | Lint    | S      |
| 3   | Root README stack/link/setup corrections (Next.js→Vite, Expo, `AGENTS.md` case, env example, counts)                                                                                                    | Docs    | S      |
| 4   | Fix broken DB-recovery commands in troubleshooting + development-setup; remove `db-restore-dev` refs                                                                                                    | Docs    | S      |
| 5   | Fix `architecture/README.md` Next.js/SSR claims                                                                                                                                                         | Docs    | XS     |
| 6   | Repoint `rebase` command self-reference + regenerate mirrors; add `codegen` skill stub or repoint `codegen-policy.md`                                                                                   | Skills  | XS     |
| 7   | Harden `enforce-background.mjs`/`guard-make-pc.sh` regexes (`-C` prefix, multi-line)                                                                                                                    | Hooks   | S      |
| 8   | Branch-aware main-commit guard that works on Linux; fix `worktree-workflow` prose                                                                                                                       | Hooks   | M      |
| 9   | ESLint configs for `lambdas/image-upload`, `lib/app-config`, `lib/graphql`, `lib/codegen`; fix the live `no-console` error                                                                              | Lint    | S      |
| 10  | Sync AGENTS.md no-console exception list with real config                                                                                                                                               | Docs    | XS     |
| 11  | `eslint-comments` plugin (`require-description` first) + suppression burn-down plan                                                                                                                     | Lint    | M      |
| 12  | Scheduled full-repo `nx run-many -t lint`                                                                                                                                                               | CI      | S      |
| 13  | Explicit test target for `lambdas/draft-processor` (`passWithNoTests: false`); correct ground-truth skill wording                                                                                       | Testing | XS     |
| 14  | Triage `lint-review-patterns`' 87 errors; add merge-base fallback; decide CI wiring                                                                                                                     | Tooling | M      |
| 15  | Add `route.continue` selector to the web-e2e `no-restricted-syntax` pack (belt over the clean status quo)                                                                                               | Lint    | XS     |
| 16  | Promote or de-stage `required-checks-lint.yml` (remove paths filter first)                                                                                                                              | CI      | S      |
| 17  | Widen `check-skipped-tests` regex; wire `.only` detection into custom-checks                                                                                                                            | Testing | S      |
| 18  | Real `depConstraints` for the existing Nx tags                                                                                                                                                          | Lint    | M      |
| 19  | `block-tmp-polling.mjs`: exempt sanctioned scratchpad, fix advisory text                                                                                                                                | Hooks   | XS     |
| 20  | Sweep of small doc fixes: session-startup counts/servers, build-system banner or fixes, graphql-schema port/types, stale expected-drift prose, retired-tool mentions, dead skill links (§2 items 20–24) | Docs    | M      |

---

_Provenance: produced 2026-07-07 on branch `claude/software-docs-audit-cpwacw` (cloud session, shallow clone). Live GitHub facts fetched 2026-07-06/07 via the repo's GitHub MCP server. Re-verification recipes for every claim here live in `.agents/skills/ground-truth-verification/SKILL.md`._
