# E2E Change Safety

**How to change product code without landing a red E2E spec on `main`.**

[e2e-determinism.md](e2e-determinism.md) tells a _test author_ how to write a spec that does not flake. This document tells a _product-change author_ what to check before shipping, and a _fixer_ how to repair a spec that a shipped change broke. It exists because those are now different problems with different dominant failure modes.

## Why this document exists — the evaluation

An evaluation of the ~41 E2E fix commits merged between **2026-07-01 and 2026-08-31** (`git log --grep="fix(e2e)\|fix(web-e2e)"` over that window) puts them in six classes:

| Class                                                       | Count | Representative tickets                                                 |
| ----------------------------------------------------------- | ----- | ---------------------------------------------------------------------- |
| **Spec drift from a shipped product change**                | ~10   | LS-9762, LS-9718, LS-9366, LS-9408, LS-9068, LS-8994, LS-8577, LS-8393 |
| **Viewport / multi-project (Mobile Chrome, Mobile Safari)** | ~8    | LS-9712, LS-9493, LS-9326, LS-9408, LS-8595, LS-8501                   |
| **Mock / API-isolation gaps**                               | ~6    | LS-9488, LS-9366, LS-9068, LS-9413, LS-8517, LS-8590                   |
| **Timing & readiness**                                      | ~7    | LS-9457, LS-9586, LS-8399, LS-8474, LS-9410                            |
| **Runner / harness / config**                               | ~7    | LS-9695, LS-8920, LS-8739, LS-8319, LS-9115                            |
| **Live-backend integration**                                | 3     | LS-9759, LS-9486, LS-9280                                              |

The headline: **the top two classes are not flake.** They are deterministic breakage introduced by a merged PR whose own CI never ran the spec that asserts the thing it changed. The spec then fails on _everyone else's_ PR — the always-on `@critical` net, the nightly full suite, or a broader affected set — and blocks the merge queue repo-wide until a separate ticket fixes it. LS-9762, LS-9718, LS-9488 and LS-9068 were each discovered by an agent driving an unrelated PR to green.

The determinism catalog in [e2e-determinism.md](e2e-determinism.md#antipatterns-from-past-regressions--class-of-bug-catalog) covers the May–June nightly-integration era and is still correct. It does not cover this class, because this class is not a test-quality problem — it is a **change-safety** problem.

## Part 1 — Before you ship a change to product code

### The reverse lookup (do this, not a guess)

When your diff touches a `testID`, an accessible name, user-visible copy, a conditional render, a GraphQL operation, or a mock/fixture factory, find the specs that assert it **by searching, before you push**:

```bash
# 1. The exact symbol you renamed or removed
rg -n "loading-indicator" apps/web-e2e/src

# 2. The component name (page objects name their surfaces after components)
rg -n "StatsDataGrid|PlayerStatsSurface" apps/web-e2e/src

# 3. The GraphQL operation name, if you added/renamed one
rg -in "nudgeexpireddraftpick" apps/web-e2e/src
```

A hit in `apps/web-e2e/src/pages/*.page.ts` matters as much as a hit in a spec — page objects are shared by dozens of specs, so one stale locator there breaks all of them (LS-9762: `players.page.ts` asserted `loading-indicator` and `error-message` after LS-9036 renamed them to `player-stats-loading-skeleton` and `player-stats-error-card`).

**Then run what you found.** `make pc` does not run Playwright. See [testing/SKILL.md Critical Rule 3](../SKILL.md#critical-rules).

### The six change shapes that break specs

Each row is a shape observed in the fix history, with the check that would have caught it.

| Shape                                              | What broke                                                                                                                                                                                                  | Check before shipping                                                                                                                                                                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Renamed / moved `testID`**                       | LS-9036 renamed two testIDs in `StateCards.tsx`; `players.page.ts` still asserted the old ones → LS-9762                                                                                                    | `rg` the old testID across `apps/web-e2e/src`. Also check **scoping**: LS-9036 moved the error card _out_ of the grid container, so a container-scoped locator failed even after the ID was fixed.                                  |
| **Conditional-render or responsive-branch change** | LS-9355 changed `compact={!isCurrent}` to `compact={!isCurrent \|\| isNarrow}` → the whole waiver panel vanished below `md` → LS-9408                                                                       | Ask which viewports and which states now render a _different element tree_, then check specs at those widths (see Part 3).                                                                                                          |
| **New auto-fired GraphQL operation**               | `useDraftTimer` fires `NudgeExpiredDraftPick` when the countdown hits 0:00; `mid-draft-trades.spec.ts` had no branch for it → API-isolation failure → LS-9488                                               | Any new query/mutation a component fires **on mount or on a timer** needs a baseline entry in `fixtures/shared-mocks.ts`, or a per-spec branch in every spec that mounts it. LS-9366 is the same bug for `FootballPlayerStatsGrid`. |
| **Mock / fixture factory field with a default**    | LS-9655 added `sport: 'baseball' \| 'football'` to `mockLeague()`, defaulting to `'baseball'`; football fixtures silently resolved to baseball → LS-9718                                                    | Adding a defaulted field to a shared factory changes behaviour at **every existing call site**. Audit them all in the same PR, the way LS-9718's fix did — do not rely on selection to find them.                                   |
| **Entitlement / gating source change**             | LS-8645 moved the player-detail-modal gate from `GetUserById.subscriptionTier` to the `MyEntitlements` query; free-tier specs mocked only the former and fell through to the **premium** baseline → LS-9068 | When you change _what a gate reads_, grep for specs asserting the gated behaviour and update their mocks. An unmocked entitlement query resolves to the permissive baseline, so the test passes for the wrong reason.               |

A sixth shape belongs with them, and it is the one with the widest blast radius:

| Shape                                  | What broke                                                                                                                                                                                                                                            | Check before shipping                                                                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Changed value of a _baseline_ mock** | LS-5030 flipped baseline `GetUserById` from `subscriptionTier: null` to `'premium'`. Since `useIsPremium()` reads that response, the default e2e user became premium **globally**, silently breaking every free-gate assertion in the suite → LS-8010 | A baseline edit in `fixtures/shared-mocks.ts` is a repo-wide event. Grep for specs depending on the old value, and pin them explicitly (`mockUserTier(page, 'free')`) in the same PR. |

At its worst this had 12 of 15 open PRs red on unrelated diffs. It reached `main` because the surface map did not map the gating sources to the dependent specs — the same gap as Part 2 below. LS-8010's repair added the `PremiumGate.tsx` / `useIsPremium.ts` mappings so the next gating change actually selects them.

Three of these deserve their own rule, because each produces a test that _passes while asserting nothing_:

- **An unmocked operation is not a neutral event — and it has two different outcomes.** If the operation is **not** in `BASELINE_GRAPHQL_RESPONSES`, `_apiIsolation` returns `{ errors: [...] }` and then throws after the test body (`API isolation caught N unmocked GraphQL request(s)`) — loud, and easy to fix. If it **is** in the baseline, it silently resolves to the baseline default, which for entitlements is the **full premium catalog**: a "free tier cannot see X" test whose `MyEntitlements` query is unmocked is testing a premium user (LS-9068). The loud case costs you a run; the quiet case costs you the assertion.
- **A negative assertion about gated content must wait for the gate's data to settle.** `expect(modal).not.toBeVisible()` passes instantly if it runs before the entitlement query resolves. LS-9068's fix awaits the `MyEntitlements` response and asserts the gate overlay _is_ visible **and** the modal is closed.
- **A mock whose shape or enum values disagree with the generated types is inert until it isn't.** `userTeamIdResponse()` wrapped a scalar `Int` in a fabricated `UserTeamId` object type that does not exist in the schema; every consumer compared `object !== number` and silently got `isOwner === false` (LS-8590). `twenty-questions.spec.ts` hand-wrote UPPERCASE enum values against a schema that serializes lowercase, so a category button was never found and a winning guess was scored as a loss (LS-7788). Check shapes against `lambdas/db/schema.graphql` and enum values against `lib/shared-components/src/api/db/graphql.generated.ts` — never against GraphQL naming convention.

## Part 2 — Affected-spec selection will not catch this for you

The most important thing to internalise: **a green CI run on your PR does not mean the specs that cover your change ran.** PR CI runs the specs the surface map selects for your changed files, plus the always-on `@critical` net — and the live map under-selects on exactly the changes that break the suite.

Reproduced against the live selector (`apps/web-e2e/src/e2e-surface-map.json`, the manifest `ci-pipeline.yml` actually uses), before and after LS-9787:

| Change                                                                 | Before LS-9787                           | Now (live map)        | Graph-derived map (shadow) |
| ---------------------------------------------------------------------- | ---------------------------------------- | --------------------- | -------------------------- |
| `apps/web-e2e/src/pages/players.page.ts` only                          | **0 specs**                              | `runAll` (218)        | 107 specs                  |
| LS-9036's changed files (`features/players/shell/StateCards.tsx` etc.) | 6 specs — **not** `player-stats.spec.ts` | 7 specs, including it | 189 specs, including it    |
| LS-9655's changed files (`mocks/graphql/league.mocks.ts` etc.)         | 2 specs — only the two edited spec files | `runAll` (218)        | `runAll` (217)             |

Check it yourself for your own diff before you trust a green run:

```bash
git diff --name-only origin/main...HEAD | node .github/scripts/integration-select/select-specs.mjs --manifest apps/web-e2e/src/e2e-surface-map.json --changed-from-stdin --json
```

**LS-9787 closed the shared-harness hole.** `pages/**`, `mocks/**`, `fixtures/**`, `components/**`, `driver/**`, `base/**` and `support/**` are now in `runAllWhenChanged` alongside `utils/**`, so a page object or mock-factory edit forces the full suite instead of selecting nothing. Measured cost on a 80-PR sample: full-suite trip rate 22.5% → 23.8%.

**One hole is still open, and it is the one that bit LS-9036.** LS-8920 dropped ten `lib/shared-components/src/features/*` directories from `runAllWhenChanged` (`analytics`, `auth`, `baseball`, `elite-draft`, `football`, `leagues`, `matchup`, `players`, `roster`, `stats`) after verifying each had per-spec coverage — at _subfolder_ granularity. LS-9787 re-audited that at spec granularity, using testID ownership as the oracle (a testID defined only inside a dropped subfolder and referenced by an e2e page object is a real, invisible coupling):

| Dropped subfolder                                 | Specs coupled but unmapped | Cost to restore (80-PR sample) | LS-9787 action                      |
| ------------------------------------------------- | -------------------------- | ------------------------------ | ----------------------------------- |
| `leagues`                                         | 103                        | 0 PRs                          | **restored** to `runAllWhenChanged` |
| `players`                                         | 101                        | 4 PRs (5.0pp)                  | **not restored** — see below        |
| `baseball`                                        | 2                          | 0 PRs                          | **restored**                        |
| `football`                                        | 1                          | 0 PRs                          | **restored**                        |
| `elite-draft`                                     | 0                          | 2 PRs (2.5pp)                  | left dropped (LS-8920 was right)    |
| `analytics`, `auth`, `matchup`, `roster`, `stats` | 0                          | 0 PRs                          | left dropped                        |

`features/players/**` is the expensive one: 101 specs reach a players-owned testID through `players.page.ts`, but restoring it to run-all costs 5pp of full-suite escalation. LS-9787 took the surgical half instead — `player-stats.spec.ts` now carries the `features/players/**` glob its nine sibling player specs already had, which is the exact entry LS-8920 missed and LS-9762 paid for. **The residual 100-spec exposure is real and still open**: a change to `lib/shared-components/src/features/players/**` still selects far fewer specs than actually depend on it. That, and the derived-map cutover, are tracked by the LS-9689 successor.

The graph-derived map (LS-9661) closes the residual properly and already runs in CI — but in **shadow mode only** (`ci-pipeline.yml` → "Shadow: graph-derived E2E selection"). The flip is tracked by LS-9689, which is closed `Done` without the flip having landed; its successor owns the cutover.

Until that lands, the compensating control is you: **run the specs your reverse lookup found, locally, regardless of what CI selected.**

## Part 3 — Viewport and the mobile projects

The suite runs five projects: three desktop engines at 1280×720 and two device projects at 375×667. Since the mobile jobs reached full parity (LS-9658), every spec runs at phone width too — which turned a long tail of latent desktop-only assertions into ~8 of this window's fixes.

**The doctrine and the helpers live in [`apps/web-e2e/src/utils/viewport.ts`](../../../../apps/web-e2e/src/utils/viewport.ts) (LS-9712). Read that file; it is the source of truth and is not restated here.** The short version of its ordering:

1. **Fix the locator** so it resolves whichever presentation the viewport renders — best, keeps coverage at both widths (`PlayerStatsSurface.expectStatsSurfaceVisible()`, LS-9326; `waivers.page.ts` `isCompactSurface()`, LS-9408).
2. **Pin the viewport** with `test.use({ viewport: DESKTOP_VIEWPORT })` — the test still runs under every project.
3. **Skip on mobile** — last resort, needs maintainer authorisation, because a skipped test is invisible in a green run. Take LS-9712 itself as the lesson: it introduced a `skipOnMobileProject()` helper, and its own follow-up PR (`ca414b384`, "replace mobile-viewport test skips with viewport pins") deleted the helper again and converted the skips to pins.

There is also a **file-level** lever you will not see in any spec: `DESKTOP_GRID_ONLY_SPECS` in `playwright.config.ts` excludes **17 spec files** from the mobile projects entirely. That is deliberate — those files assert desktop-grid affordances the ≤800px card feed never renders (LS-9075/LS-9471/LS-9493/LS-9660) — but it is invisible in a green run. Check the list before concluding a surface has mobile coverage.

Two mechanics that caused real bugs and are easy to miss:

- **The app shell mounts desktop _and_ mobile nav chrome simultaneously**, toggled with `display: none`, not conditional rendering. `page.getByText(name).first()` therefore resolves the DOM-first (desktop, CSS-hidden) copy at _any_ width (LS-8501, LS-8595, LS-9712). This is now ESLint-enforced: `.first()`/`.nth()`/`.last()` chained on `getByText`/`getByLabel`/`getByTitle`/`getByAltText` is banned across all of `apps/web-e2e/src` (LS-9660). Scope to a testid/role container instead, or use `visible()`.
- **Pinning a viewport does not clear Playwright's `isMobile` fixture** — that comes from the project's device descriptor, not its width. A `test.skip(isMobile, …)` left next to a pin still skips.

When a mobile-project failure is a genuine layout bug rather than a stale assertion, fix the product: LS-8501 fixed six real phone-width defects (a dialog wider than the viewport, an action row behind the `MobileBottomBar`, a popover taller than 667px) rather than skipping the tests.

## Part 4 — Fixing a spec someone else's change broke

### Reproduce before you fix

Every high-quality fix in this window reproduced the failure first, and several **refuted the ticket's own hypothesis** by doing so (Part 5). The bar demonstrated by the corpus:

- **Before/after counts on the real specs.** LS-9366: "27 failed / 15 passed before, 42/42 after, plus an 89-test adjacent sweep to prove the baseline addition regressed nothing."
- **Induce the failure if it only appears under load.** LS-8399 injected artificial latency into the mocked routes to reproduce a CI-only timeout locally, then removed the injection — that is what justified widening the timeout instead of guessing at it.
- **Dispatch CI when local cannot reproduce.** LS-9457 and LS-8474 both fail only under multi-worker contention; both used a `run-playwright-tests.yml` dispatch against the branch as the evidence.

### Build fresh, or your local pass means nothing

LS-9068's fix was nearly abandoned because everything passed locally against a **stale `dist/apps/web`** predating the change under test — a bundle with zero `MyEntitlements` references, so the spec passed vacuously. LS-9069 closed that hole for the Nx targets (`e2e`, `e2e:ui`, `e2e:headed`, `e2e:debug` now `dependsOn` `web:build`). It is **not** closed if you invoke Playwright directly or use `nx_run_e2e_specs`, which documents `dist/apps/web` as a caller precondition. Build first.

### Never weaken an assertion to make it pass

The corpus is explicit about this and you should be too, in the PR body:

- LS-9408 branched on the surface the viewport actually renders and asserted _each_ — "never weakened to pass either way". On the compact surface it asserts that no cancel action exists (matching the design) rather than skipping.
- LS-9068 **strengthened** its assertion while fixing it: `not.toBeVisible()` alone passes instantly if it runs before the modal mounts, so the fix awaits the entitlement response and asserts the gate overlay _is_ visible **and** the modal is closed — the settled free state.
- LS-9493 skipped only assertions for affordances that genuinely do not exist below the breakpoint, each with an inline comment naming the source of the viewport gating.

An assertion that cannot fail is worse than a deleted test, because it reports coverage it does not have.

### Fix the class, not the instance

Already a rule in [e2e-determinism.md](e2e-determinism.md#antipatterns-from-past-regressions--class-of-bug-catalog); this window shows both halves of it:

- **Done right:** LS-9718 audited every `mockLeague({...})` call site under `apps/web-e2e/src/tests/**`, not just the reported one. LS-9457 stripped `waitUntil: 'networkidle'` from all 16 `waitForURL` calls in the file, not the 2 observed failures.
- **Done wrong:** LS-9077 rewrote specs for a route consolidation and shipped with its "retargeted specs pass against the dev server" test-plan box **unchecked**; LS-9366 then had to retarget assertions that asserted UI which does not exist on the canonical route. An unchecked verification box in a merged PR is a defect, not a formality.

### Timeouts

Widening a timeout is legitimate _only_ when you can name the mechanism the assertion is waiting on:

- **Legitimate:** LS-9586 — the assertion depended on a deliberately delayed mock (`STANDINGS_DELAY_MS`) but inherited the bare 3s default, while the assertion above it had `STANDINGS_DELAY_MS + 5000`. The fix aligned it with the delay it depends on. Rule: **an assertion downstream of a throttled mock must inherit that throttle's budget.**
- **Legitimate:** LS-8399 — reproduced with injected latency, identified the two-hop query waterfall, widened the first content assertion after `goto` to the 10s convention already used elsewhere.
- **Not legitimate:** a per-phase deadline bump with no named mechanism. That is antipattern #4 in [e2e-determinism.md](e2e-determinism.md#4-per-phase-deadline-extension-as-a-substitute-for-fixing-backend-state-contention) — stop and escalate.
- **Suite-wide budgets belong in `playwright.config.ts`, not in specs.** LS-9695 raised `expect.timeout` 3s → 5s and the per-test timeout 30s → 45s for the whole suite once the cause was known to be global (below).

## Part 5 — Three diagnostic misreads to rule out first

Each of these was the reported hypothesis on a ticket, and each was **wrong**. Check them before you touch a spec.

1. **"A different random test fails every run" → not a spec bug.** LS-9695: `@critical` failures scattered across unrelated specs (matchup, accessibility, auction-draft, scoreboard, notifications) on dozens of PRs. Cause: `playwright.config.ts` hardcoded 4 workers on a 4-vCPU runner fleet — one worker per vCPU, zero headroom for the OS, the `vite preview` server, and each browser's compositor threads. Whichever assertion happened to be polling during a starved beat blew the 3s cap. Fix was config (3 workers, 5s expect budget), not any spec. **Tell:** the failing set changes every run and does not correlate with the diff.

2. **"The mobile job has fewer resources" → check the config before believing it.** LS-9493: the `e2e` and `e2e-mobile` jobs run the identical affected list on one runner with the same worker config; there is no asymmetry. All 43 failures traced to specific desktop-only affordances that never render at 375px. **Tell:** the _same_ specs fail identically across re-runs — that is determinism, not contention.

3. **"The shard is misconfigured" → check what else lives in that shard.** LS-8517: four unrelated specs failed together on shard 2/3. Sharding is Playwright's native count-balance over alphabetical file order; all four names simply fall in the `l–p` band. The real bug was one spec registering a **second** `page.route(isGraphQLEndpoint, …)` handler over the one `beforeEach` installed, without `page.unroute()` — Playwright stacks handlers LIFO, so in-flight requests from the first mount raced the second handler across a re-navigation. **Tell:** "innocent bystanders" clustering by filename alphabetical range.

A fourth, cheaper check: before diagnosing anything, confirm the spec is actually failing for the reason reported. `getByText('Pos')` matches **case-insensitively as a substring** by default, which is why only `Pos` broke after a redesign while `BATTERS`/`PITCHERS` kept matching new, different headings (LS-8577). A passing sibling assertion is not evidence the DOM is unchanged.

## Checklist

Before pushing a change to `apps/web`, `lib/shared-components`, or the E2E harness:

- [ ] `rg` the renamed/removed testID, component name, accessible name, or copy across `apps/web-e2e/src` — including `pages/*.page.ts`.
- [ ] New query/mutation fired on mount or a timer? Baseline mock added in `fixtures/shared-mocks.ts` or a branch in every spec that mounts it.
- [ ] Added a defaulted field to a shared mock/fixture factory? Every existing call site audited in this PR.
- [ ] Changed what a gate reads? Specs asserting the gated behaviour updated — an unmocked entitlement query resolves permissive.
- [ ] Changed a **value** in `fixtures/shared-mocks.ts`? Treated as repo-wide: specs depending on the old value found and pinned explicitly (LS-5030 → LS-8010).
- [ ] New/edited mock checked against `lambdas/db/schema.graphql` (shapes) and `graphql.generated.ts` (enum serialization), not against GraphQL naming convention.
- [ ] Changed a conditional render or a responsive branch? Specs checked at **both** widths; locator fixed in preference to a pin, pin in preference to a skip.
- [ ] Ran `select-specs.mjs` on your own diff, and ran the specs your reverse lookup found even if selection missed them.
- [ ] Built `dist/apps/web` fresh before believing a local pass.
- [ ] Fixed the class, not the instance — every call site of the pattern, or an explicit follow-up ticket listing them.
- [ ] No assertion weakened, and no `test.skip`/`fixme` without a ticket ([e2e-determinism.md lever 11](e2e-determinism.md#11-quarantine-dont-disable)).

## Related

- [e2e-failure-atlas.md](e2e-failure-atlas.md) — the diagnostic companion: a symptom-indexed catalogue of every failure class in the 412-commit fix history, plus the triage decision tree and the environment traps that make a local run lie
- [e2e-determinism.md](e2e-determinism.md) — the 12 determinism levers and the nightly-integration class-of-bug catalog
- [api-isolation-architecture.md](api-isolation-architecture.md) — the 3-layer mock system, `route.fallback()` vs `route.continue()`, baseline catalog
- [playwright-best-practices.md](playwright-best-practices.md) — locator conventions, page objects, Tamagui pitfalls
- [`apps/web-e2e/src/utils/viewport.ts`](../../../../apps/web-e2e/src/utils/viewport.ts) — viewport doctrine and helpers (LS-9712)
- [`apps/web-e2e/eslint.config.mjs`](../../../../apps/web-e2e/eslint.config.mjs) — the machine-enforced half of these rules (LS-4456 / LS-4458 / LS-8096 / LS-9660)
- [e2e-ci-and-validation.md](e2e-ci-and-validation.md) — local pre-commit E2E validation and CI trigger conditions
- [ci-failure-prevention.md](ci-failure-prevention.md) — GrowthBook flag seeding and the other top write-time CI failure patterns
- [fix-integration-tests](../../fix-integration-tests/SKILL.md) · [nightly-green-campaign](../../nightly-green-campaign/SKILL.md) — the fixer-side workflows

## Provenance and maintenance

Derived from an evaluation of the ~41 E2E fix commits merged 2026-07-01 → 2026-08-31 (LS-9788), then corrected and extended against the full 412-commit fix history (LS-9789 — which added the baseline-mock-value shape, the two-outcome unmocked-operation semantics, the enum-drift rule, and the `DESKTOP_GRID_ONLY_SPECS` note). Every claim traces to a cited commit or ticket. The Part 2 selection numbers were re-measured against `main` at `624b97be1` when **LS-9787** landed the shared-harness `runAllWhenChanged` patch and the spec-granularity re-audit; re-run the `select-specs.mjs` command above to re-verify them. Delete Part 2's remaining `features/players/**` caveat once the LS-9689 successor flips selection to the derived map.
