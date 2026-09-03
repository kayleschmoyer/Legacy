# E2E Failure Atlas

**A symptom-indexed catalogue of every E2E failure class this repo has actually shipped.** Derived from all **412 E2E fix commits** merged between 2026-02 and 2026-08 (~363 true fixes once the 49 coverage-backfill commits mislabelled as `fix` are excluded).

Use this when you are **looking at a failure**. Its two companions cover the other halves of the problem:

| Document                                     | Answers                                                      |
| -------------------------------------------- | ------------------------------------------------------------ |
| [e2e-determinism.md](e2e-determinism.md)     | "How do I write a spec that doesn't flake?" — the 12 levers  |
| [e2e-change-safety.md](e2e-change-safety.md) | "I'm changing product code — what will I break?"             |
| **this file**                                | "A spec is failing. What is it, and what's the correct fix?" |

## Where the failures actually are

Subject-frequency across the ~363 true fixes (categories overlap; a commit can hit several):

| Class                          | Count | Atlas section                                   |
| ------------------------------ | ----- | ----------------------------------------------- |
| Wait / race / timing           | 101   | [§3](#3-waiting-and-races)                      |
| Selector stale or ambiguous    | 57    | [§2](#2-selectors-and-the-dom)                  |
| Mock / fixture gap             | 38    | [§4](#4-mocks-fixtures-and-the-isolation-layer) |
| UI redesign / V2 migration     | 27    | [§2](#2-selectors-and-the-dom)                  |
| Auth / session / user identity | 25    | [§5](#5-identity-auth-and-sessions)             |
| Viewport / mobile projects     | 22    | [§6](#6-viewport-and-the-mobile-projects)       |
| Skip / unskip / quarantine     | 20    | [§9](#9-coverage-that-isnt-there)               |
| Rate limit / backoff / load    | 17    | [§7](#7-load-contention-and-the-shared-backend) |
| CI / runner / tooling          | 17    | [§7](#7-load-contention-and-the-shared-backend) |
| Cleanup / isolation / leak     | 12    | [§8](#8-state-leakage-between-runs)             |
| Schema / type drift            | 7     | [§4](#4-mocks-fixtures-and-the-isolation-layer) |

The monthly shape matters too: **44 (Mar) → 147 (Apr) → 137 (May) → 38 (Jun) → 16 (Jul) → 29 (Aug)**. The April–May peak is the `LeagueDetailPageV2` migration and the integration-suite hardening era; the Jun–Aug plateau is what the suite costs at steady state. The nightly is green as of 2026-09-01 — this atlas is about keeping it that way, not about digging out.

## Symptom index

| What you're looking at                                                  | Go to                                                                                                          |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| A **different** random test fails every run                             | [§1.1](#11-a-different-test-fails-every-run)                                                                   |
| The **same** tests fail identically across re-runs                      | [§1.2](#12-the-same-tests-fail-identically-every-run)                                                          |
| Unrelated specs fail together, clustered in one shard                   | [§1.3](#13-unrelated-specs-fail-together-in-one-shard)                                                         |
| Fails locally, passes in CI                                             | [§10](#10-environment-traps-that-make-a-local-run-lie)                                                         |
| Passes locally, fails in CI                                             | [§1.4](#14-passes-locally-fails-in-ci)                                                                         |
| `strict mode violation: resolved to N elements`                         | [§2.1](#21-strict-mode-violations)                                                                             |
| `element(s) not found` after a UI change landed                         | [§2.2](#22-stale-selectors-after-a-shipped-ui-change)                                                          |
| One text assertion fails, its siblings pass                             | [§2.3](#23-one-text-assertion-fails-and-its-siblings-pass)                                                     |
| A locator's `.count()` is wrong but nothing looks missing               | [§2.4](#24-accessible-names-that-change-with-state)                                                            |
| `toBeVisible` timeout right at the `expect` cap                         | [§3.1](#31-assertion-inherits-the-wrong-timeout-budget)                                                        |
| Click times out on an element that is clearly there                     | [§3.4](#34-actionability-failures-motion-overlays-and-off-screen)                                              |
| `expect.poll` never retries / throws the callback's error               | [e2e-determinism §1](e2e-determinism.md#1-expectpoll-callback-throws-instead-of-returning)                     |
| `API isolation caught N unmocked GraphQL request(s)`                    | [§4.1](#41-unmocked-operations-two-different-failures)                                                         |
| A gate test passes for the wrong reason (free user sees premium)        | [§4.2](#42-the-baseline-answers-permissively)                                                                  |
| Mock returns data but the UI ignores it                                 | [§4.3](#43-mock-shape-and-enum-drift)                                                                          |
| A mocked query resolves with another query's payload                    | [§4.6](#46-substring-operation-routing-sends-the-wrong-payload-to-the-wrong-query)                             |
| Test lands on the sign-in page mid-run                                  | [§5.1](#51-the-switchuser-race)                                                                                |
| WebSocket canary reports zero frames                                    | [§3.5](#35-listeners-registered-after-the-thing-they-listen-for)                                               |
| Fails only on Mobile Chrome / Mobile Safari                             | [§6](#6-viewport-and-the-mobile-projects)                                                                      |
| `HTTP 429` / "Failed to fetch" / `null teamId` in the integration suite | [e2e-determinism §6](e2e-determinism.md#6-http-429-from-the-shared-live-backend-masquerading-as-spec-failures) |
| Fixture creation rejected by the server                                 | [§4.4](#44-fixtures-that-violate-a-server-side-constraint)                                                     |

---

## 1. Triage first — four misreads that cost the most

Every entry below was the **reported hypothesis** on a real ticket, and every one was wrong. Rule them out before you touch a spec.

### 1.1 A different test fails every run

**Not a spec bug.** LS-9695: `@critical` failures scattered across matchup, accessibility, auction-draft, scoreboard and notification specs on dozens of unrelated PRs. `playwright.config.ts` hardcoded 4 workers on a 4-vCPU runner fleet — one worker per vCPU, zero headroom for the OS, the `vite preview` server, and each browser's compositor threads. Whichever assertion happened to be polling during a starved beat blew the 3s cap. The fix was config (3 workers, 5s `expect` budget, 45s test budget), not any spec.

**Tell:** the failing set changes every run and does not correlate with the diff.

### 1.2 The same tests fail identically every run

**That is determinism, not contention** — and the reported cause is often the opposite of the real one. LS-9493 was filed as "the Mobile Chrome job has fewer CPUs". It does not: `e2e` and `e2e-mobile` run the identical affected list on one runner with the same worker config. All 43 failures traced to specific desktop-only affordances that never render at 375px. **500+ Playwright `TimeoutError`s were misread as resource contention.**

**Tell:** re-runs produce byte-identical failure sets.

### 1.3 Unrelated specs fail together in one shard

**Check what else lives in that shard before blaming sharding.** LS-8517: four unrelated specs failed together on shard 2/3. Sharding is Playwright's native count-balance over alphabetical file order — all four filenames simply fall in the `l–p` band. The real bug was one spec registering a **second** `page.route(isGraphQLEndpoint, …)` handler over the one `beforeEach` had installed, without `page.unroute()`. Playwright stacks handlers LIFO, so in-flight requests from the first mount raced the second handler across a re-navigation; the other three were innocent bystanders.

### 1.4 Passes locally, fails in CI

Three real mechanisms, in order of frequency:

1. **Multi-worker contention** — LS-8474 reproduced only under genuine multi-file/multi-worker load; a single-file dispatch passed cleanly every time. Four independent sessions filed duplicate tickets for it (LS-8483, LS-8485, LS-8497). Reproduce by dispatching `run-playwright-tests.yml` against the branch, not by re-running locally.
2. **Missing CI-only env** — LS-8595's "Discord CTA is broken on mobile" hypothesis dissolved once `VITE_DISCORD_CLIENT_ID` was set: the button is gated on `config.discordClientId`, and without it the test fails on **every** viewport. The original repro had simply been run without the var.
3. **A real timing budget** — LS-8399 reproduced a CI-only timeout locally by _injecting artificial latency_ into the mocked routes (then removing it). That is what justified widening the timeout rather than guessing.

---

## 2. Selectors and the DOM

### 2.1 Strict-mode violations

`resolved to N elements` means the locator is ambiguous, and the ambiguity is usually **new**, caused by someone mounting a component that renders the same text somewhere else.

LS-3728: the `LeagueSwitcherChip` nav button started rendering the active league name in an `aria-label` and a span. Nine tests broke at once because `getByText('<LeagueName>')` and `getByRole('button', { name: /commissioner/i })` now matched both the nav chip and page content.

**Right fix — in order of preference:**

1. Scope to a container: `page.getByRole('main').getByText('Commissioner')`.
2. Match by role + **exact** accessible name: `getByRole('tab', { name: 'Commissioner', exact: true })` (LS-8325 — a `/Commissioner/i` regex matched a second tab).
3. Add a `data-testid` to the _new_ component so future tests can exclude it — LS-3728 added `league-switcher-chip` for exactly this.

**Wrong fix:** `.first()`. It resolves DOM order, not intent, and in this app DOM order is a trap (see §6.1). `.first()`/`.nth()`/`.last()` chained on a text-derived locator is now **ESLint-banned suite-wide** (LS-9660, `apps/web-e2e/eslint.config.mjs`). Two of the earliest strict-mode fixes in the corpus (LS-1230, LS-1231) chose `.first()` and are part of the 84-file grandfather list that ban is still burning down.

### 2.2 Stale selectors after a shipped UI change

The single largest cause of deterministic red on `main`. The full prevention procedure is [e2e-change-safety.md](e2e-change-safety.md); the diagnostic half is: **when one spec fails deterministically and its subject had a recent redesign, `git log --oneline -- <component>` before theorising about timing.**

Representative: LS-8577 (a redesign removed the `Pos` column header), LS-9762 (LS-9036 renamed two testIDs and moved the error card out of its container), LS-8393 (LS-5360 replaced a "render every member" roster with a one-player-per-slot `RosterBoard`, so a second mock member with a duplicate `positionId` was silently dropped).

Note LS-8393's second half: the spec clicked a genuinely **disabled** read-only slot. Playwright's actionability checks _wait for enabled_ rather than no-op, so a disabled element produces a 10s timeout that reads like a missing element. Assert `toBeDisabled()` instead of clicking through it.

### 2.3 One text assertion fails and its siblings pass

`getByText('Foo')` with a **plain string** matches **case-insensitively as a substring** (`exact: false`). A redesign can rewrite most labels and still satisfy most assertions.

LS-8577 asserted `BATTERS`, `PITCHERS`, `Actual`, `Proj`, `Pos`. The redesign renamed `BATTERS` → `Starting Lineup — Batters` (still a substring match), kept `Actual`/`Proj` spans — and removed the standalone `Pos` header entirely. Only `Pos` failed, so a whole-panel rewrite presented as one missing header.

**A passing sibling assertion is not evidence the DOM is unchanged.** When one exact-text assertion fails, diff the rendered labels before assuming a timing problem.

### 2.5 Scraping numbers out of panel text and asserting a relationship between them

`matchup-detail-ui.integration.spec.ts` reads every `\d+%` token out of the
win-probability panel and asserts that **some pair sums to exactly 100**. The panel
renders **three** text percentages — `{t1Pct}%`, `{tiePct}% tie`, `{t2Pct}%`
(`MatchupWinProbabilityPanel.tsx:134/149/164`), each independently `Math.round`ed —
and the tie line renders whenever `tieProb > 0.01`. Because the three sum to ~100, no
_pair_ can sum to 100 unless the tie rounds to 0. The test therefore fails **precisely
when the live Monte Carlo returns a tie probability above 1%**: not random, but
data-dependent, which is why it passes most runs and looks like a flake.

Two lessons. First, a regex over `innerText()` cannot tell you _which_ value it
matched — when the panel grew a third percentage, the assertion silently changed
meaning. Scope to per-value test ids instead. Second, when values are rounded
independently, any exact-total assertion is wrong by construction; assert a tolerance,
or make the product use largest-remainder rounding so the displayed parts really do
total 100.

Fixed by LS-9838, which did both halves: `roundPercentagesTo100` (largest-remainder) so
the displayed parts really do total 100, and an assertion on the tie-inclusive total
instead of a pair. Note what the old assertion cost — it failed on nothing worse than an
evenly-matched matchup, and only for some live data, so it read as a flake and was
re-hardened three times (LS-7869, LS-8138, LS-8419) without anyone questioning the
assertion itself.

### 2.4 Accessible names that change with state

A locator matching on accessible name can silently change its match set as the UI's state changes.

LS-8496: `RosterBoard`'s `SlotRow` rewrites a filled slot's name while a player is selected — every slot that player can swap into becomes `Swap {name} into {POS}` instead of `{name} at {POS}`. A `filledSlots` locator built from `/ at (SP|RP|C|…)$/` therefore **drops exactly the eligible-swap targets whenever a selection is active**, so its `.count()` is not the filled-slot count. The spec captured its baseline with one player selected and its post-count with another selected, producing a phantom −1 that was pure relabelling drift. Worse, `filledSlots.nth(1)` could never fire a swap: by construction it was a slot the selected player couldn't play, so the board just re-selected the occupant.

**Rule:** if a locator's match set can change with UI state, measure it in a **known, quiescent state** (here: no selection active), and drive the real gesture rather than a positional index.

---

## 3. Waiting and races

The largest class (101 commits). [e2e-determinism.md](e2e-determinism.md) owns the general levers and the integration-specific `expect.poll` / backend-visibility catalogue. This section covers what that document does not.

### 3.1 Assertion inherits the wrong timeout budget

LS-9586: a spec deliberately throttled its `getUserLeagueStandings` mock by `STANDINGS_DELAY_MS`. The hero-card assertion was explicitly given `STANDINGS_DELAY_MS + 5000`; the two assertions below it inherited the bare default and had **no slack against the very delay they depend on**.

**Rule: an assertion downstream of a throttled or waterfalled response must inherit that delay's budget.** Not a blanket bump — the specific budget, with the dependency named in a comment.

Legitimate siblings: LS-8399 (a two-hop query waterfall where `getPositionsForLeague` is gated on `leagueId` from the first hop; reproduced by injecting latency, then widened to the 10s convention already used in the suite). Illegitimate: any bump you cannot attach to a mechanism — that is [e2e-determinism antipattern #4](e2e-determinism.md#4-per-phase-deadline-extension-as-a-substitute-for-fixing-backend-state-contention), and the tell is a ticket titled "Nth regression guard".

**Suite-wide budgets belong in `playwright.config.ts`, not in specs** (LS-9695). Conversely LS-1180 removed inline 30s overrides from every spec once the config budget was right.

### 3.2 `networkidle` is not a readiness signal

Banned in page objects and helpers (LS-4456), in hermetic specs (LS-9660), and as a bare token anywhere under `apps/web-e2e/src` (LS-9793) — Apollo polling and WebSocket heartbeats defeat it, and under 4-worker load it can stall past the whole `expect` budget before the post-navigation assertion even starts polling (LS-9457, which stripped `waitUntil: 'networkidle'` from all 16 `waitForURL` calls in the file rather than the two that were observed failing; LS-8012 had made the identical fix earlier in a different file).

There is **no sanctioned `networkidle` use left.** The old carve-out for `page.waitForURL(pattern, { waitUntil: 'networkidle' })` was removed by LS-9793 — the repo had zero callers of it, and the one `waitForURL` that genuinely needs navigation commitment (`PlayerDetailSurface.waitForStatsList`) already uses `waitUntil: 'commit'`, which also survives a bfcache restore that fires no `load` event. Use `'commit'`.

**The hole, and how it was closed (LS-9793).** Both original bans were AST selectors requiring a **literal** argument:

```
CallExpression[callee.property.name='waitForLoadState'][arguments.0.value='networkidle']
Property[key.name='waitUntil'][value.value='networkidle']
```

`apps/web-e2e/src/pages/players.page.ts` took the value as a **parameter** — `gotoDetail(id, waitUntil = 'load')` / `gotoBrefId(...)` calling `page.waitForLoadState(waitUntil)`. `arguments.0` was an Identifier, not a Literal, so neither rule fired: not on the page object, and not on the **191** spec call sites passing `'networkidle'` into it as an ordinary string argument. Almost the entire non-grandfathered residue was the player-detail family reaching `waitForLoadState` this way.

LS-9793 closed it three ways:

1. **Type.** `gotoDetail` / `gotoBrefId` take `'load' | 'domcontentloaded'`; `'networkidle'` is a typecheck error at every call site.
2. **Lint.** `ls9793NoNetworkidleLiteralRules` bans the bare token as an argument to **any** call, as **any** property value, and **in a type position** — so no wrapper, alias, or re-widened signature can reopen it. Spread into every enforcing override block in `apps/web-e2e/eslint.config.mjs`.
3. **File scan.** `apps/web-e2e/src/hermetic-determinism-guards.test.ts` greps `src/tests/` for the token regardless of lint-override composition, with a self-checking LS-9676 burn-down allowlist: a listed file that no longer violates **fails** the test, so the list can only shrink.

The burn-down itself was safe because **188 of the 191 call sites already asserted `detail.expectOpen()` on the very next line** — the `networkidle` wait was pure dead wall-clock in front of an auto-retrying assertion. The three that did not were absence assertions (`toHaveCount(0)` / `not.toBeVisible()` for free-tier gating), and those got a **positive** signal first (`playersPage.premiumGate.expectVisible()`) rather than a deleted wait.

**Census after LS-9793: 93 references under `apps/web-e2e/src`** — 87 in files on the LS-9660 grandfather lists (the LS-9676 burn-down) and 6 that are the two determinism guards' own matching machinery. **Zero real waits outside the grandfather list.** Do not add more.

> Generalise it: **an AST rule that matches on a literal is bypassed by any indirection**, and a page-object parameter is the most natural indirection in this suite. When you rely on a lint rule to hold an invariant, check whether the invariant can be reached through a variable — and consider pairing the rule with a token-level file scan, which no signature change can route around.

### 3.3 Missing an explicit wait for a navigation the app performs synchronously

LS-8474: a mocked create-league mutation, a synchronous `navigate()` in the click handler, and still a deterministic `toHaveURL` timeout under 4-worker load. The distinguishing feature versus its two structurally identical sibling tests was that this one changed `schedulingStrategy` away from its default, unmounting a `PremiumGate` section a few steps before submit. Under contention that re-render was enough. Fix: wait for the navigation explicitly rather than assuming the click commits it.

### 3.4 Actionability failures: motion, overlays and off-screen

Playwright's actionability check requires an element to be **stable** (not animating), visible, enabled, and hit-targetable. Four distinct mechanisms in this corpus:

- **Animation.** A `translateX` ticker kept a link moving through the stability check. Fixed globally by `reducedMotion: 'reduce'` in `playwright.config.ts` `use` (LS-3620) — which only works if the component honours `prefers-reduced-motion`. LS-8995 wired that into Tamagui `Dialog` usages and `Sheet` for WebKit stability; LS-4648 later found the shared `Dialog` primitive had still never picked it up. **If a component animates and does not consult `useReducedMotion`, the global setting does nothing for it.**
- **Overlay interception.** A fixed `MobileBottomBar` (z-index 200) sat over a form's action row; a `ProposeTradeDialog` overlay used `position: absolute` with `inset: 0`, spanning the _document_ rather than the viewport and centring the modal off the current fold (both LS-8501). Both were fixed in the product — they were real phone-width defects.
- **Off-screen by size.** A confirm dialog with a fixed `width={520}` overflowed 375px and pushed its right-aligned button off-screen; a `DateTimePicker` popover ~700px tall could not fit a 667px viewport and could not be scrolled (LS-8501). Again fixed in the product.
- **Genuinely disabled.** See §2.2 — assert `toBeDisabled()`, don't click.

**`{ force: true }` is not on this list.** It skips the actionability check, which means it skips the bug. LS-989 used it for a save button; LS-8501 explicitly refused to.

**LS-9795 triaged all 35 Playwright sites and left 2.** Thirty-three were removed after verification, and the pattern was overwhelmingly the same: _the force outlived the defect it was added for_. `addPlayerForce` still bypassed a `PremiumGate` overlay that LS-7012 had deleted; seven trade-dialog clicks still bypassed the `position: absolute` overlay that LS-8501 had already made `position: fixed`. Two more lessons worth keeping:

- **An ancestor never intercepts the hit test for its own descendant.** A backdrop that _wraps_ the control it is blamed for blocking is not the blocker.
- **`fill()` and `clear()` never hit-test at all** — Playwright gates them on visible/enabled/editable only. `force` on them cannot be bypassing an overlay; it is only hiding those three checks (in one case, a genuine remount race).

A `no-restricted-syntax` rule in `apps/web-e2e/eslint.config.mjs` now bans `force: true` across `apps/web-e2e/src`, with the 2 survivors grandfathered by basename, so the count can only shrink. Adding a new one means adding a basename and naming _which_ actionability condition is suppressed and why.

### 3.5 Listeners registered after the thing they listen for

LS-9410: the LS-8884 WebSocket delivery canary reported _"No `DRAFT_PICK_MADE` frame observed … the deployed WebSocket stack may be down"_ across many unrelated PRs. The stack was fine. `page.on('websocket', …)` fires **once, at socket creation** — it does not retroactively see a socket that already opened. The listeners were registered inside the "Make all draft picks" step, which runs _after_ a step that did a full `page.goto()` (tearing down and recreating each page's socket) and then waited out a render plus a backend poll — 8–30s of head start. `wsFrames` stayed empty regardless of what the server broadcast.

This is the most dangerous shape in the atlas: **a test-instrumentation bug that presents as a production outage.** Before escalating "the deployed stack is down", verify the test could observe the thing at all.

### 3.6 Stacked route handlers

See §1.3. `page.route()` handlers stack LIFO and are never replaced. Re-registering a GraphQL handler and then re-navigating races the old handler's in-flight requests against the new one — each closure holding its own copy of the fixture data. **Call `page.unroute(isGraphQLEndpoint)` before re-registering** (LS-8517).

---

## 4. Mocks, fixtures and the isolation layer

Architecture (3 layers, LIFO, `route.fulfill()` vs `route.fallback()` vs the banned `route.continue()`) is owned by [api-isolation-architecture.md](api-isolation-architecture.md). This section is the failure modes.

> `route.continue()` in `src/tests/` currently has **zero real uses** — all 24 grep hits are doc comments stating it isn't used. That rule is holding; don't be the one to break it.

### 4.1 Unmocked operations — two different failures

An operation that reaches layer 1 behaves differently depending on whether it is in `BASELINE_GRAPHQL_RESPONSES`:

| Case                        | What happens                                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Not** in the baseline map | Returns `{ errors: [...] }` during the test, then the fixture **throws after the test body**: `API isolation caught N unmocked GraphQL request(s)`. Loud. |
| **In** the baseline map     | Silently resolves to the baseline's default — which may be the _permissive_ answer. Silent. See §4.2.                                                     |

The loud case still surprises people, because the operation is often fired by something the spec never meant to exercise:

- `useDraftTimer` fires `NudgeExpiredDraftPick` **when the pick countdown reaches 0:00** — so `mid-draft-trades.spec.ts` failed only when a run happened to be slow enough for the timer to expire (LS-9488).
- A new grid component (`FootballPlayerStatsGrid`) fired on any spec that merely _transited_ the `/players` surface, not just the ones asserting on it — fixed with a baseline entry plus per-spec handlers for the five specs that assert grid content (LS-9366).
- `GetAwardVotingPeriod` produced **five separate tickets** (LS-3587, LS-3588, LS-3589, LS-3591, LS-3592) before someone added the one baseline entry. A sixth (LS-3603) then hardened the spinner assertion the failure had been surfacing through.

**Rule:** any operation a component fires **on mount or on a timer** needs a baseline entry in `fixtures/shared-mocks.ts`. Per-spec mocking only covers the specs you thought of.

### 4.2 The baseline answers permissively

The quiet failure, and the more expensive one — the test passes while asserting nothing.

- **LS-9068**: LS-8645 moved the player-detail-modal gate from `GetUserById.subscriptionTier` to the `MyEntitlements` query. The free-tier test mocked only the former; the unmocked `MyEntitlements` resolved to the baseline's **full premium catalog**, so the "free" user was fully entitled and the modal mounted. The intermittency was a spurious-pass window: `expect(modal).not.toBeVisible()` passes instantly if it runs before the entitlement query resolves.
- **LS-5030 / LS-8010** is the same failure at repo scale. LS-5030 flipped the _baseline value_ of `GetUserById` from `subscriptionTier: null` to `'premium'`. Because `useIsPremium()` sources premium status from that response, **the default e2e user became premium globally**, silently breaking every free-gate verification in the suite. At its worst, 12 of 15 open PRs were red on unrelated diffs. The repair added `userByIdResponse(tier)` / `mockUserTier(page, tier)` so a spec can pin a tier explicitly — and mapped `PremiumGate.tsx` and `useIsPremium.ts` into the surface map so the next gating change actually selects the dependent specs.

**Two rules follow.** First: **a negative assertion about gated content must wait for the gate's data to settle** — LS-9068's fix awaits the `MyEntitlements` response and asserts the gate overlay _is_ visible **and** the modal is closed, which is a strictly stronger assertion than the one it replaced. Second: **changing a baseline mock's value is a repo-wide event**, not a local edit. Grep for the specs that depend on the old value in the same PR.

### 4.3 Mock shape and enum drift

A mock that disagrees with the real schema fails in whichever direction is hardest to see.

- **Fabricated object type around a scalar.** `userTeamIdResponse()` returned `{ userTeamId: { __typename: 'UserTeamId', teamId } }` for a field the schema declares as a plain `Int`. No `UserTeamId` type exists. Every consumer compared `object !== number`, so any test relying on the ambient baseline to signal ownership silently got `isOwner === false` regardless of the intended team (LS-8590).
- **Enum serialization.** `twenty-questions.spec.ts` hand-wrote UPPERCASE GraphQL-convention enum values while the generated TS enums serialize **lowercase** (`TwentyQuestionsStatus.Won = 'won'`). The component was correct and internally consistent; only the mocks were wrong. The test clicked testid `category-POSITION` while the component rendered `category-position`, so the question was never asked and the counter stayed at 0 (LS-7788).
- **Field-name drift.** LS-1570 (wrong field in `processWaiverClaims`), LS-3763 (`autoSelectGames` out of sync), LS-3779 (`LeagueActivityEvent` / `getLeagueMembers`), LS-4503 (a `status` field that does not exist on `pauseDraft`/`resumeDraft`).
- **ID type coercion.** `Matchup.id` arrives as a string and was compared against a number (LS-3742, LS-3605).

**Rule: derive mock values from generated types, never from GraphQL convention.** Check enums against `lib/shared-components/src/api/db/graphql.generated.ts` and field shapes against `lambdas/db/schema.graphql`.

### 4.4 Fixtures that violate a server-side constraint

Hermetic mocks never validate; the live backend does. `full-season` and `season-lifecycle` created leagues with `maxRosterSize: 4` against a server that enforces `[15, 50]` for baseball, failing Phase 1 in the nightly with the server's own message (LS-4939).

**Rule:** integration fixture values must satisfy the server's validation, not just the type. When you shrink a fixture "to make it fast", check the constraint.

### 4.5 An assertion that conflates two conditions

LS-8433: "Switch to Pitchers view" asserted the first `Add <player>` free-agent button. That assertion depends on the filter being applied **and** on page 1 holding a non-taken pitcher whose row finished hydrating — and `LeagueDetailFreeAgentsTab` fetches one server page then filters taken players **client-side**, so under nightly load the taken-player fetch can outrun a 15s wait. The investigation ruled out a seeding bug (~4,754 eligible pitchers) and a resolver bug before concluding the assertion was simply measuring two things.

**Right fix:** assert a signal that is synchronous and unique to the state under test — here the pitcher-only **WHIP** column header, which the Pitchers view renders on toggle and the Hitters view never renders. No timeout bump, no skip; row-level claimability stayed covered by the next phase's real waiver claim.

### 4.6 Substring operation routing sends the wrong payload to the wrong query

Route handlers commonly branch on `postData.includes('someoperation')`. Because operation names nest — `GetDraft` is a substring of `GetDraftPicks`, `GetDraftTeamOrder`, `GetDraftPlayerStats` and six more — a broad branch placed **before** a specific one in the same `else if` chain makes the specific branch unreachable, and answers every nested operation with the broad branch's payload.

The failure mode is the quiet one from [§4.2](#42-the-baseline-answers-permissively): the query **resolves** with wrong-shaped data instead of erroring, so the UI renders an empty or incorrect state and the failure surfaces somewhere unrelated — or not at all.

The review bot flagged this HIGH on PR #7097; LS-9413 fixed it in `waiver-claims.spec.ts` (~17 branches) and the class was never burned down. The LS-9794 audit measured **713 substring-routing sites across 53 files**, of which **143 sites in 33 files** test a substring that matches more than one real operation (`'league'` matches 52 real operations, `'getdraft'` 9, `'getuserleagues'` 3).

Two refinements the original audit missed:

- **The receiver is not always the raw body.** `op.includes('league')` and `opName.includes('getleaguedraft')` are the same bug on the _extracted_ name, and account for ~120 sites. Using `extractOperationName` is not the fix by itself; **exact equality** is. The worst site in the suite, `draft-graphql-integration.spec.ts:42`, uses the helper and then substring-matches `'league'` against 52 operations.

- **`postData.includes('"getleague"')` is a different hazard, not ambiguity.** Embedding the JSON quotes makes the match quote-delimited, so it can only hit an operation named exactly `GetLeague`. No such operation exists — so all 24 sites using that idiom are **dead branches** that never fire, and the operation silently falls through to the baseline instead. Dead branches are tracked separately from ambiguity.

```ts
// ❌ Bad — 'getdraftpicks'.includes('getdraft') is true, so the branch below is dead code
} else if (postData.includes('getdraft')) {
  /* answers GetDraftPicks, GetDraftTeamOrder, GetDraftPlayerStats, … with the draft object */
} else if (postData.includes('getdraftpicks')) {
  /* UNREACHABLE */
}

// ✅ Good — exact match on the parsed operation name (the LS-9413 pattern, used in shared-mocks.ts)
const op = extractOperationName(route).toLowerCase();
if (op === 'getdraftpicks') { … }
```

**Right fix:** exact equality on `extractOperationName(route)`. If a chain must stay substring-based as an interim, order every specific branch before the broad one and guard the broad branch explicitly — `on-this-day.spec.ts:116` does this correctly with `includes('getonthisday') && !includes('events')`.

**Enforcement (LS-9794).** Two guards make this an invariant rather than a burn-down:

- `apps/web-e2e/eslint.config.mjs` bans `postData`/`op`/`opName`/`operationName` `.includes(...)` under `apps/web-e2e/src` via `no-restricted-properties`. Files that already violated it are grandfathered by basename in `ls9794GrandfatheredFiles`; **that list may only shrink** — migrate the file instead of adding to it.
- `apps/web-e2e/src/operation-routing-guard.test.ts` cross-references every tested substring against the operation names in `lib/graphql/src/**/*.graphql` and fails when one matches more than one operation. Its `KNOWN_AMBIGUOUS` baseline is a ratchet: the test also fails on a _stale_ entry, so the list cannot silently stop shrinking. This is what fires when someone adds a new query whose name contains an already-tested substring.

Live instance: **LS-9792** (`full-season-ui.spec.ts:690`). Class burn-down: **LS-9794**.

---

## 5. Identity, auth and sessions

### 5.1 The `switchUser` race

**The most-repeated root cause in the entire corpus: twelve tickets between March and August** — LS-1504, LS-3672, LS-3705, LS-3724, LS-3735, LS-3744, LS-3767, LS-3768, LS-4270, LS-4298, LS-4305, LS-9486.

`switchUser()` swaps a page's auth cookie and `localStorage` in place. The background JWT refresh triggered by the first `page.goto` can dispatch `AUTH_LOGOUT` and clear `localStorage` **after** `page.evaluate()` has set the new profile, so the subsequent reload starts empty and renders the sign-in page instead of the intended route. LS-4127's `LeagueDetailPageV2` added background Apollo activity that widened the window enough to reproduce on every nightly.

The fix was known since March and was written **in the helper's own docstring** (`apps/web-e2e/src/integration/fixtures/ui.ts`): use a dedicated fixture browser context (`managerPage1`/`2`/`3`, `commissionerPage`), whose storage state is set at context-creation time so no window exists.

It recurred twelve times because **every ticket migrated only the phase that happened to fail that night.** LS-9486 (2026-08-23) migrated waiver-processing Phase 9 — Phases 2, 5 and 6 of the same file had been migrated by three earlier tickets in the chain.

**Closed by LS-9790 (2026-09).** The final four call sites are gone and `switchUser` has been deleted from the fixtures; an ESLint rule in `apps/web-e2e/eslint.config.mjs` now fails the build on any re-introduction, with **no grandfather list** — the count reached zero, so every match is a regression.

The burn-down turned out to be two migrations, not four. The two `switchUser` calls that looked like independent survivors were _restores_ — they existed only to undo the swap performed a few lines above them:

| Site                                               | Shape                                                     | Outcome                                                                                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `full-season-ui.integration.spec.ts:919`           | swaps identity **and** navigates to a protected route     | **Migrated** to `managerPage2` — the shape the docstring warned about                                                                                   |
| `full-season-ui.integration.spec.ts:937`           | restore-to-commissioner, but passes a URL so it navigates | **Deleted** — with the swap gone the commissioner page never lost its identity; a `reload()` replaces the navigation the restore performed incidentally |
| `league-scoring-editor-ui.integration.spec.ts:327` | swaps identity **and** navigates to a protected route     | **Migrated** to `managerPage1`                                                                                                                          |
| `league-scoring-editor-ui.integration.spec.ts:344` | `switchUser(page, commissionerJwt)` — no URL              | **Deleted** — see below; not the sanctioned case it appeared to be                                                                                      |

> **Why the last site was not a legitimate keeper.** It was triaged as the docstring's sanctioned "switch back to the commissioner mid-test" case. Two facts overturned that. First, `switchUser` _always_ navigated — `page.goto(url ?? WEB_BASE)` followed by `page.reload()` — so "no URL" never meant "no navigation". Second, every fixture in `fixtures/ui.ts` is **test-scoped**, not worker-scoped: each test gets a fresh `commissionerPage`, and both `test.afterAll` hooks use `apiCommissioner` rather than the page. The restore was therefore repairing an identity that nothing downstream would ever read. Once site 327 moved to `managerPage1`, it was repairing a swap that no longer happened. **Generalisable check:** before granting a helper call an exemption, confirm the state it repairs is actually observed by something after it — fixture scope decides that, and a restore paired with a migrated swap dies with its partner.

> This count was published as "12 call sites across 9 integration specs" in the first cut of this document (LS-9789) and corrected in LS-9796. The original grep excluded `export async function` and JSDoc `*` lines but not `//` comments, and 36 of the 43 `switchUser` mentions under `apps/web-e2e/src` are comments — mostly notes recording that a phase was _already_ migrated. The `grep -rln` that produced "9 files" counted those comment-only files. **The count of tickets in the chain (12) is separate and was re-verified as correct.** The lesson generalises: a grep over a codebase that documents its own history in comments will over-count the history as if it were the present. Filter comments, then read the survivors.

> **Scope note for reviewers.** `switchUser` lives in `apps/web-e2e/src/integration/fixtures/ui.ts` — Playwright fixture code that exists only to drive the live-backend integration suite. It is not imported by `apps/web`, `apps/app` or any lambda, and ships in no application bundle. The race is a **test-reliability** defect (an integration phase lands on the sign-in page and the phase fails), not an application authentication weakness: the `AUTH_LOGOUT`-on-refresh behaviour it collides with is the product working correctly, and no user-facing auth path calls this helper. It is listed here because it is the most-repeated root cause in the fix history, not because it is exploitable.

### 5.2 Cookie / CSRF / storage-state drift

Auth mechanism changes break every helper that fakes auth. LS-775 moved auth from `localStorage` to HttpOnly cookies, which is why the old `localStorage['auth_jwt']` path is now treated as an invalid impersonation attempt and removed. Follow-ons: LS-1547 (integration `switchUser` for cookie auth), LS-3194 (`/refresh-jwt` mock cookie access, seeding `ls_csrf_token` into `storageState`), LS-4268 (an `autoProcessDraftPicks` nudge using broken CSRF, switched to a Bearer JWT), LS-9328 (Mobile Safari reading `ls_jwt` from the cookie jar).

**Rule:** an auth-mechanism change is a suite-wide event. Grep `apps/web-e2e/src` for `storageState`, `ls_jwt`, `ls_csrf_token`, `ls_user_profile` in the same PR.

### 5.3 The wrong tier under test

Beyond §4.2: LS-8257 (a live-search comparison spec asserting on a free user when the surface is premium), LS-8003 (mid-draft-trades AI suggestions needing a premium user after LS-5019 activated a gate), LS-6400 / LS-10740862c (`getMyMockDraftUsage` unmocked so usage gating misfired).

---

## 6. Viewport and the mobile projects

Doctrine and helpers live in [`apps/web-e2e/src/utils/viewport.ts`](../../../../apps/web-e2e/src/utils/viewport.ts) — **read that file**; it is the source of truth and is not restated here. Ordering: fix the locator so it resolves either presentation → pin the viewport → skip (last resort, maintainer authorisation).

### 6.1 Both nav chromes are always in the DOM

`apps/web/src/app/app.tsx` mounts the desktop **and** mobile nav blocks simultaneously, toggled with `display: none` rather than conditional rendering. So `page.getByText(name).first()` resolves the DOM-first (desktop, CSS-hidden) copy **at any width**. This produced LS-8501, LS-8595 (nine `@regression` assertions in one file), LS-9494/9496/9572 and LS-9712.

Fix by scoping to a testid/role container, or by filtering to the visible occurrence (`.filter({ visible: true })`, or the driver-contract `visible()` added in LS-9712). Now ESLint-enforced (LS-9660).

### 6.2 Responsive branches render a different element tree

Not "the same UI, smaller". Below the breakpoint the app renders **different components**:

| Surface         | Narrow-width behaviour                                                                                   | Broke                     |
| --------------- | -------------------------------------------------------------------------------------------------------- | ------------------------- |
| Player stats    | `PlayersCardFeed` replaces the data grid ≤800px — no sortable headers, no column picker, no Share/Export | LS-9326, LS-9493, LS-9660 |
| Pending waivers | `compact={!isCurrent \|\| isNarrow}` → a summary pill with no header, rows or cancel buttons ≤768px      | LS-9408                   |
| League hero     | The hero "Invite" button is hidden below `$xs` (≤660px) by design                                        | LS-8994                   |
| Standings       | T/PF/PA column headers hidden via `$gtSm`/`$gtMd`                                                        | LS-9493                   |
| Draft board     | `CompactLiveDraftBoard` replaces the wide board at ≤`$sm` (640px)                                        | —                         |

The good fixes make the page object viewport-aware — `PlayerStatsSurface.expectStatsSurfaceVisible()` (LS-9326), `waivers.page.ts` `isCompactSurface()` + `compactSummary()` (LS-9408) — and assert **each** surface rather than weakening to pass either way. LS-9408's compact branch asserts that no cancel action is available, matching the design, rather than skipping.

### 6.3 Skipping is a coverage loss that reports green

LS-9712 introduced a `skipOnMobileProject()` helper — and **its own follow-up PR removed it again**, replacing the skips with viewport pins (`ca414b384`, "replace mobile-viewport test skips with viewport pins"). A pinned test still runs under every project and still catches a regression; a skipped one does not. Take the retraction as the lesson: reach for a skip only when no equivalent presentation exists at that width.

Note also the file-level lever: **17 spec files are excluded from the mobile projects entirely** by `DESKTOP_GRID_ONLY_SPECS` in `playwright.config.ts`. That is deliberate (those files assert desktop-grid affordances the card feed never renders) but it is invisible in a green run — check the list before concluding a surface has mobile coverage.

### 6.4 PR CI was blind to all of this until August

`ci-pipeline.yml` hardcoded `--project=chromium`, so LS-9326 and LS-9408 shipped through PR CI and only surfaced at the nightly hours later. LS-9411 added the `e2e-mobile` job, which re-runs the **same** affected selection on Mobile Chrome and is folded into CI Gate. Mobile Safari is deliberately excluded (its own flake history, LS-9328/LS-9409) and stays nightly-only.

---

## 7. Load, contention and the shared backend

Owned by [e2e-determinism.md](e2e-determinism.md#integration-concurrency-ceiling--429-backoff-ls-7866--ls-7867) — the 429 cascade, `INTEGRATION_SHARD_CEILING`, universal `Retry-After` backoff, weight-balanced sharding, and the JWT disk cache. Two additions from the wider history:

- **Cold starts are per-Lambda.** LS-4447's join-league preflight warmed the `validateInviteCode` **query** Lambda; the `JoinLeagueByCode` **mutation** runs on a different Lambda with a separate resolver and deployment and was never warmed. Five prior fixes missed this. Warming one path tells you nothing about the other.
- **Worker count is a suite-level budget** (§1.1), and `--maxWorkers` is not universal: `run-unit-tests` needed it translated to `--test-concurrency` (LS-9115).

---

## 8. State leakage between runs

- **Leaked test users outlive their producer.** `int-${role}-${Date.now()}@test.legacysports.dev` was introduced in March as a login-bug workaround and reverted weeks later (LS-2314) — but the orphan rows it created were never cleaned up and had to be swept by an admin mutation months later (LS-4917). **Reverting the code does not revert the data.**
- **Cleanup must be scoped to the caller.** LS-8238 (mock-draft reset scoped to the caller's own mock leagues), LS-9280 (integration league sweep by manager membership), LS-4442 (age-gated cleanup).
- **Sharding breaks naive teardown.** Global teardown must be skipped in non-first shards (LS-4318, LS-4391) or one shard deletes another's in-flight fixtures.
- **Per-test fixtures, not shared ones** — [e2e-determinism lever 4](e2e-determinism.md#4-no-shared-state-across-tests). The per-spec user pool (LS-4357) is still not implemented, so shared-user contention remains the dominant nightly failure mode.

---

## 9. Coverage that isn't there

Twenty commits in the corpus are skip/unskip churn, and the un-skips found real bugs — LS-4422 un-skipped 15 WebSocket tests by actually wiring WS into `LeagueDetailPageV2`; LS-4423, LS-4426, LS-4427, LS-4424 restored combobox-a11y, draft-board-a11y phases, PremiumGate free-user and matchup roster-recap coverage.

Current state on `main`: **4 `test.skip`/`fixme` in hermetic specs, none with a ticket reference on the same line; 0 in integration; 0 `@flaky` tags.** That is a healthy number, and the way to keep it is [e2e-determinism lever 11](e2e-determinism.md#11-quarantine-dont-disable) — quarantine with a ticket, never a bare skip.

Silent coverage losses are the ones to watch, because none of them show up as a skip:

1. `DESKTOP_GRID_ONLY_SPECS` — 17 files, no mobile projects (§6.3).
2. ESLint grandfather lists — 66 hermetic + 18 integration files exempt from the LS-9660 rules, 43 on the LS-8096 migrated list. **Never add a file to a grandfather list; fix the locator.**
3. Affected-spec under-selection — a spec that never gets selected is a spec that isn't running ([e2e-change-safety §2](e2e-change-safety.md#part-2--affected-spec-selection-will-not-catch-this-for-you), LS-9787).
4. `passWithNoTests` — how nine red `lambdas/db` specs sat on `main` (see [testing/SKILL.md](../SKILL.md#what-gates-merge)).
5. A test that cannot fail — §4.2, and the ESLint-banned `if (await locator.isVisible())` branch (LS-4458), which silently passes when the element is hidden. **20 `isVisible()` uses remain.**

---

## 10. Environment traps that make a local run lie

Every one of these produces a confident, wrong conclusion. None was in the skills docs before this file.

### 10.1 Running without `CI=1` gives you a real Google identity

Without `CI=1` / `E2E_AUTH_MODE=ci`, `global-setup.ts` takes the local device-flow OAuth branch and mints a real JWT for **your** Google account (a real user id) instead of the synthetic hermetic JWT (`id: 1`). The hermetic baseline `GetUserById` always returns `id: 1`, so `useIsPremiumStatus()`'s `dataIsForCurrentUser` guard never matches, treats the mismatch as "still loading" **forever**, freezes `isPremium` at `false`, and renders the real `PremiumGate` paywall for the whole run.

The symptom is indistinguishable from a real regression: deterministic N/N local failures with `toBeVisible` "element(s) not found" on content behind a gate — while CI, which always sets `CI=1`, is green. **Always prefix `CI=1` when locally reproducing a hermetic spec.** Documented in [`apps/web-e2e/README.md`](../../../../apps/web-e2e/README.md) (LS-9436).

### 10.2 A stale preview server serves the old bundle

`playwright.config.ts`'s `webServer` uses `reuseExistingServer: !process.env.CI` and serves the prebuilt `dist/apps/web` via `vite preview --port 4280`. Locally, **once a server is listening on 4280 every subsequent run reuses it**, serving the old bundle even after you rebuild. Rebuild→retest loops then test stale assets, and the change you just made appears not to work.

```bash
# after nx run web:build:production, kill the stale server before re-running
pid=$(netstat -ano | grep ":4280 " | grep LISTENING | awk '{print $5}' | head -1); taskkill //F //PID $pid
```

### 10.3 A stale `dist/apps/web` passes vacuously

LS-9068 nearly died because everything passed locally against a bundle predating the change under test — one with zero `MyEntitlements` references. LS-9069 closed this for the Nx targets (`e2e`, `e2e:ui`, `e2e:headed`, `e2e:debug` now `dependsOn` `web:build`). It is **not** closed if you invoke Playwright directly or via `nx_run_e2e_specs`, which documents `dist/apps/web` as a caller precondition.

### 10.4 Missing local env reproduces a phantom failure

LS-8595's Discord-CTA "mobile bug" was `VITE_DISCORD_CLIENT_ID` being unset locally — the button is gated on it and fails on every viewport without it. Check the CI build step's env before believing a local repro.

### 10.5 The whole suite can be red for reasons that are not your PR

Around 2026-06-13, 12 of 15 open PRs showed `CI: E2E Failure` on unrelated diffs (the LS-5030 baseline flip, §4.2, plus an `oauthProxyUrl` env issue). **Before assuming your change regressed E2E, check `github_pr_dashboard` for a repo-wide pattern** — if the same specs fail identically across unrelated PRs, it is a baseline or environment break with its own ticket. Fix only the specs your diff actually touched, let the repair land, and rebase.

---

## 11. The fix-quality bar

What separates the fixes that held from the ones that came back.

**Reproduce before you fix.** LS-9366: "27 failed / 15 passed before, 42/42 after, plus an 89-test adjacent sweep proving the baseline addition regressed nothing." LS-8399 injected latency to reproduce a CI-only timeout. LS-9457 and LS-8474 dispatched CI when local could not reproduce. LS-9689 reproduced a shadow-audit data point from the run's own S3 coverage fragments _before_ touching anything, to confirm the reproduction was faithful.

**Rule out the misread.** §1. Several of the best fixes in this corpus begin by refuting their own ticket's hypothesis.

**Never weaken an assertion.** LS-9068 _strengthened_ its assertion while fixing it. LS-9408 asserted each surface rather than passing on either. LS-9493 skipped only affordances that genuinely do not exist below the breakpoint, each with a comment naming the source of the gating. An assertion that cannot fail is worse than a deleted test, because it reports coverage it does not have.

**Fix the class, not the instance.** The four recurrence chains below are what happens when you don't:

| Chain                       | Tickets | What finally ended it                                                                    |
| --------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| `switchUser` JWT race       | 12      | **Closed (LS-9790)** — 0 call sites, helper deleted, ESLint ban with no grandfather list |
| "URL stuck on /league/join" | 6       | LS-4447 moved the whole orchestration into `joinLeagueAsManager()`                       |
| `waitForSeasonActive`       | 10      | LS-4344 migrated **every** caller to the backend-poll path after LS-4321 stopped halfway |
| `GetAwardVotingPeriod`      | 5       | One baseline entry in `shared-mocks.ts`                                                  |

Done right: LS-9718 audited every `mockLeague({...})` call site, not just the reported one; LS-9457 stripped `networkidle` from all 16 `waitForURL` calls, not the 2 observed. Done wrong: LS-9077 shipped with its "retargeted specs pass against the dev server" test-plan box **unchecked**, and LS-9366 then had to retarget assertions that asserted UI which does not exist on the canonical route. **An unchecked verification box in a merged PR is a defect, not a formality.**

**Attribute, don't guess.** The [E2E ledger](e2e-ledger.md) records every executed test per SHA in S3 — query it to find the commit where a spec started failing instead of doing `git log` archaeology. Note it also records `flaky` outcomes, which the required CI Gate cannot see once a test passes on retry.

---

## Related

- [e2e-determinism.md](e2e-determinism.md) — the 12 levers, the integration class-of-bug catalogue, the 429/sharding model
- [e2e-change-safety.md](e2e-change-safety.md) — preventing spec drift when you change product code
- [api-isolation-architecture.md](api-isolation-architecture.md) — the 3-layer mock system in full
- [playwright-best-practices.md](playwright-best-practices.md) — locator conventions, page objects, Tamagui pitfalls
- [ci-failure-prevention.md](ci-failure-prevention.md) — GrowthBook flag seeding (the dominant write-time CI failure), Suspense body-text comparison, hydration
- [e2e-ci-and-validation.md](e2e-ci-and-validation.md) · [e2e-ledger.md](e2e-ledger.md) · [`apps/web-e2e/README.md`](../../../../apps/web-e2e/README.md)
- [`apps/web-e2e/src/utils/viewport.ts`](../../../../apps/web-e2e/src/utils/viewport.ts) · [`apps/web-e2e/eslint.config.mjs`](../../../../apps/web-e2e/eslint.config.mjs)
- [fix-integration-tests](../../fix-integration-tests/SKILL.md) · [nightly-green-campaign](../../nightly-green-campaign/SKILL.md)

## Provenance and maintenance

Built from all 412 E2E fix commits merged 2026-02 → 2026-08 (LS-9789), extending the Jul–Aug-only evaluation in LS-9788, and corrected in LS-9796 after a full-suite review re-derived the figures. Counts in "Where the failures actually are" come from subject-line classification and are indicative, not exact; the per-entry claims each cite a specific commit or ticket and are exact.

**Every census command here filters comment lines.** The `switchUser` count in the first cut of this document did not, and over-reported by 3× — this suite documents its own history in comments, so an unfiltered grep counts the past as the present:

```bash
# the filter is the important part, not the pattern
nocomment() { grep -vE ':[0-9]+: *(\*|//|/\*)'; }

grep -rn "switchUser(" apps/web-e2e/src --include=*.ts | nocomment \
  | grep -v 'export async function' | grep -v ':import'   # -> 4
grep -rn "force: true"  apps/web-e2e/src --include=*.ts | nocomment | wc -l   # -> 5 after LS-9795
# ...of which 3 are fs.rmSync(dir, { recursive: true, force: true }), not Playwright.
# Only 2 are real Playwright suppressions, and both are lint-grandfathered.
grep -rn "networkidle"  apps/web-e2e/src --include=*.ts | nocomment | wc -l   # -> 92 (was 283 before LS-9793; 86 grandfathered + 6 guard internals)
```

Suite-debt figures were censused on `main` @ `04af1b463`. Re-census before quoting them, and **read the survivors before reporting a number** — of the pattern matches this document's own audit produced, five whole classes were rejected on inspection (correct LIFO route layering, a correctly-placed WebSocket listener, safe `expect.poll` bodies, conditional capability skips, and a guarded broad match branch). A grep hit is a candidate, not a finding.
