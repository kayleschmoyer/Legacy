# Test Architecture — Semantic Page Objects (ADR-0015) and Test DI (ADR-0016)

> Loaded from [testing SKILL](../SKILL.md). Authoring rules for page objects, the ESLint-enforced selector/wait bans, the `AppDriver` platform seam, and the dual-mode backend seam.

## Semantic Page Object Model (ADR-0015)

Hermetic Playwright specs under `apps/web-e2e/src/tests/` use a **three-layer semantic Page Object Model** (ADR-0015). Selectors live in the page object layer; specs call semantic verbs.

| Layer          | Location                       | Owns                                                            |
| -------------- | ------------------------------ | --------------------------------------------------------------- |
| **Base**       | `apps/web-e2e/src/base/`       | Shared primitives — `BasePage`, `BaseComponent` building blocks |
| **Components** | `apps/web-e2e/src/components/` | Reusable UI surfaces (`NavHeader`, `PremiumGate`, `Toast`, ...) |
| **Pages**      | `apps/web-e2e/src/pages/`      | Route-scoped objects (`DraftPage`, `LeaguePage`, `PlayersPage`) |
| **Spec**       | `apps/web-e2e/src/tests/`      | Calls semantic verbs on the page object — **no raw selectors**  |

**Selector ban in spec files (LS-8096 — ESLint enforced):**

The `apps/web-e2e/eslint.config.mjs` `no-restricted-syntax` rule bans these calls in migrated `*.spec.ts` files (selectors must move into the page object layer):

- `getByTestId(...)`
- `getByRole(...)`
- `getByPlaceholder(...)`
- `getByText(...)`
- `locator(...)`

The rule is currently scoped to the migrated specs by basename — see the final override in `apps/web-e2e/eslint.config.mjs` for the list. When migrating a new spec to the semantic POM, **add its basename** to that override; once every spec under `src/tests/` is migrated, widen `files` to `src/tests/**/*.spec.ts` and delete the per-file list.

> **Why basename globs + extended LAST:** ESLint config objects do not merge `no-restricted-syntax` — the later matching object replaces the rule list entirely (LS-7947 clobber hazard). The LS-8096 override uses **basename globs** to form a distinct override key, lands **last** in the array so it wins on matched files, and **re-spreads the LS-4458 spec rules** so those checks remain active.

**Positional selection on text locators (LS-9660 — ESLint enforced suite-wide):**

`.first()` / `.nth()` / `.last()` chained directly on a **text-derived locator** — `getByText`, `getByLabel`, `getByTitle`, `getByAltText` — is banned across ALL of `apps/web-e2e/src`, page objects included. `apps/web/src/app/app.tsx` mounts desktop AND mobile copies of the nav chrome (both always in the DOM, one `display:none`), so `page.getByText(name).first()` resolves the DOM-first (desktop) copy regardless of viewport — a deterministic Mobile-Chrome-only failure class (LS-9494/LS-9496/LS-9572).

The fix is never positional narrowing; make the match unique instead:

- **Scope to a testid/role container first**: `page.getByTestId('league-switcher-chip').getByText(name)` — the container pins which copy of the chrome (or which region of the page) you mean.
- **Prefer a role-based locator with an accessible name**: `page.getByRole('button', { name: 'QB' })` — role + name is usually unique where bare text is not.
- If the text genuinely repeats inside one container (a list of identical labels), assert the collection (`expectCount`) or key the locator on the row's testid instead of picking an index.

Files that predate the rule are grandfathered by basename (`ls9660GrandfatheredSpecFiles` / `ls9660GrandfatheredIntegrationFiles` in `apps/web-e2e/eslint.config.mjs`). Do **not** add new files to those lists — fix the locator; delete a file's entry when it is cleaned up.

**Hard waits in hermetic specs (LS-9660 — ESLint enforced):**

`page.waitForTimeout()`, `waitForLoadState('networkidle')`, and `waitUntil: 'networkidle'` are banned in hermetic specs under `src/tests/` (they were already banned in page objects and helpers by LS-4456 — this extends the ban to the spec layer). Both are flake generators: a fixed sleep bakes a race into the test, and `networkidle` never settles reliably with Apollo polling/WebSockets. Gate on a stable signal instead: `expect(testid).toBeVisible()`, `page.waitForResponse(operationName)`, or `expect.poll`. The same grandfather list applies.

**`networkidle` as a bare token (LS-9793 — ESLint enforced, everywhere under `apps/web-e2e/src/`):**

The LS-4456 / LS-9660 selectors match the _syntax_ of a call site, so they only fire when `'networkidle'` is a literal argument to `waitForLoadState` or a literal `waitUntil:` property. A page object that takes the value as a **parameter** routed around both:

```ts
// apps/web-e2e/src/pages/players.page.ts — the shape that slipped through
async gotoDetail(playerId: number, waitUntil = 'load') {
  await page.waitForLoadState(waitUntil); // Identifier, not Literal → no rule fired
}
await playersPage.gotoDetail(1, 'networkidle'); // …and no rule fired here either
```

191 spec call sites used that hole. LS-9793 closed it three ways, and all three are now enforced:

1. `gotoDetail` / `gotoBrefId` take `'load' | 'domcontentloaded'` — `'networkidle'` is a **typecheck** error at every call site.
2. ESLint bans the bare `'networkidle'` token as an argument to **any** call, as **any** property value, and in a **type position** (so the signature cannot be re-widened).
3. `apps/web-e2e/src/hermetic-determinism-guards.test.ts` file-scans `src/tests/` for the token, independent of lint-override composition, with a self-checking LS-9676 burn-down allowlist (an entry that no longer has a violation fails the test).

Do not add a wrapper, alias, or variable to pass the string through — fix the wait. The right replacement is nearly always the assertion the spec was already about to make (`expectOpen()`, `expectNotLoading()`). Where the spec asserts an **absence**, do not simply delete the wait: gate on a positive signal first (e.g. `playersPage.premiumGate.expectVisible()` before asserting premium columns are absent), or the assertion can pass against a DOM that has not rendered yet.

**Writing a new spec under the semantic POM:**

```ts
// spec file — no selectors, only semantic verbs from the page object
import { expect, test } from '../fixtures/pages';

test('player can be added to compare', async ({ playersPage }) => {
  await playersPage.goto();
  await playersPage.search('mike trout');
  await playersPage.addToCompare('Mike Trout');
  await expect(playersPage.compareTray).toContainPlayer('Mike Trout');
});
```

```ts
// pages/players.page.ts — selectors live here, behind verbs
export class PlayersPage extends BasePage {
  async search(query: string) {
    await this.page.getByTestId('player-search-input').fill(query);
  }
  async addToCompare(name: string) {
    await this.page
      .getByRole('row', { name })
      .getByRole('button', { name: /compare/i })
      .click();
  }
}
```

If a spec needs a one-off selector that does not yet belong on the page object, the right move is to add the verb to the page object — not to suppress the lint rule.

## Test Dependency Injection (ADR-0016)

Two DI seams sit on top of the semantic POM — both selected by **Playwright projects**, both documented in [`docs/decisions/0016-test-dependency-injection.md`](../../../../docs/decisions/0016-test-dependency-injection.md):

### Platform seam — `AppDriver`

Migrated test objects are written against the platform-neutral `AppDriver`/`UIElement` interfaces (`apps/web-e2e/src/driver/`) instead of Playwright's `Page`/`Locator`. The two object kinds migrate differently: **page objects (screens)** extend `BaseScreen` and take an `AppDriver`; **component objects** take a `UIElement` root (instead of `BaseComponent`'s `Locator` root), so a migrated screen composes them by passing a driver element for the widget's region. On web the driver is `PlaywrightWebDriver` (injected by `fixtures/pages.ts` / `fixtures/dual.ts`); the interface is the seam where an Appium native driver plugs in later. Rules:

- **New page objects take an `AppDriver`** (`BaseScreen`) and **new components take a `UIElement` root**, unless they genuinely need web-only surfaces (CSS assertions, `dispatchEvent` workarounds) — document that need in the object's doc comment and keep extending `BasePage` / `BaseComponent`.
- The driver's `expect*` methods are the retrying assertion surface — never sample `isVisible()` where you mean `expectVisible()`. Runner-level `expect.poll` over driver reads is fine.
- Capability-dependent behavior gates on `driver.capabilities.<cap>` (`networkMock`, `clock`, `trace`, `hover`, `multiWindow`) via `test.skip`, never by failing at runtime.
- Reference migration: `pages/draft.page.ts` (screen) + `components/player-search-box.component.ts` (component).

### Backend seam — dual-mode specs (`src/tests/shared/`)

A spec whose flow deserves both hermetic PR coverage and a live check is written ONCE under `apps/web-e2e/src/tests/shared/` (named `*.dual.spec.ts`), importing `test` from `fixtures/dual.ts` and speaking only page-object verbs + the `TestData` seam (`fixtures/test-data.ts`):

| Where it runs           | Config / project                                           | `backend` | Data preconditions                  |
| ----------------------- | ---------------------------------------------------------- | --------- | ----------------------------------- |
| PR CI + local           | `playwright.config.ts` (existing browser projects)         | `mock`    | `MockTestData` → `route.fulfill()`  |
| Live (local / dispatch) | `playwright.integration.config.ts` → `shared-live` project | `live`    | `LiveTestData` → real backend state |

```bash
# mocked (hermetic — runs in PR CI automatically)
pnpm exec playwright test --project=chromium --config=apps/web-e2e/playwright.config.ts src/tests/shared

# live (needs integration credentials, like any integration run)
pnpm exec playwright test --project=shared-live --config=apps/web-e2e/playwright.integration.config.ts
```

Rules for dual-mode specs: no `page.route()`, no mock payload imports, no identity setup — preconditions go through `TestData` (grow it verb-by-verb; a verb one backend cannot satisfy must throw, not no-op). **`shared-live` runs every file under `src/tests/shared/`** (no `testIgnore`), so a test calling a verb `LiveTestData` throws a `*_LIVE_UNSUPPORTED_REASON` for must open with `test.skip(testData.mode === 'live', '… <REASON_CONSTANT> …')` — a header comment saying "not registered on shared-live" enforces nothing (LS-10217). `src/dual-spec-live-skip-guard.test.ts` (part of `web-e2e:test`) fails if the skip is missing; precedent: `season-renewal-dialog.dual.spec.ts`. Assert only on handles `TestData` returned, never on mock-specific incidentals. The nightly integration shard partition does not include `shared-live` yet — wiring it in is an ADR-0016 rollout follow-up.

Reference dual-mode spec: `src/tests/shared/player-stats-search.dual.spec.ts`.

### Dual-mode by default for new UI-flow specs

**A new spec covering a UI flow is dual-mode by default** — write it under `src/tests/shared/` against
`fixtures/dual.ts` + the `TestData` seam, not as a new `*.integration.spec.ts`. Write it live-only
(under `src/integration/tests/`) only when the flow genuinely needs infra a mock cannot emulate: a real
OAuth handshake, a real Stripe checkout, a real websocket push whose _delivery_ (not just its payload)
is the thing under test, a real async Lambda race, or a real external dataset (e.g. live game logs). "It
touches multiple users" or "it needs a seeded league" is **not** by itself a reason to go live-only — it
means `TestData` needs a new verb (grow it verb-by-verb, per the seam's existing contract), not that the
flow belongs in the live-only suite. See [LS-9674's migration matrix](../../../../docs/dev-process/e2e-dual-mode-migration-matrix.md)
for the reasoning worked through against the 24 pre-existing integration specs, including the cases that
correctly stay live-only (real WebSocket delivery canaries, real read-replica lag races, real
priority-resolution/business-logic correctness) versus the much larger set that only _looked_
live-only because the seam hadn't grown the verbs yet.

Review-checklist addition: a new spec under `src/integration/tests/` should name, in its own header
comment or PR description, which specific assertion needs live infra. "No particular reason, that's
where similar specs live" is not sufficient — that reasoning is exactly how a 24-spec, zero-PR-coverage
backlog accumulates.
