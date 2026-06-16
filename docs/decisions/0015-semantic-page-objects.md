# 0015. Semantic Page Object Model for Playwright e2e tests

Date: 2026-06-16

## Status

Proposed

## Context

The hermetic Playwright suite (`apps/web-e2e/src/tests/`) and the live-backend
integration suite (`apps/web-e2e/src/integration/tests/`) already share a
Page Object Model under `apps/web-e2e/src/pages/` (`DraftPage`, `LeaguePage`,
`NavigationPage`, `PlayersPage`). The bones are good — class-per-route,
`constructor(page)`, testid-gated navigation waits (`goto*` gates on a test id
rather than `networkidle`, which is defeated by the draft WebSocket and league
long-poll), and a re-export barrel.

The problem is **encapsulation**. Every locator is a `public readonly Locator`
field, so specs reach into the page object and drive the DOM themselves:

```ts
// today — the spec owns the mechanism
await draftPage.playerSearch.fill('Mike Trout');
await draftPage.draftPlayerButton.click();
await expect(draftPage.draftQueue).toContainText('Mike Trout');

// leagueCard() returns a raw Locator; the spec does the filtering + clicking
await leaguePage
  .leagueCard('My League')
  .getByRole('button', { name: /join/i })
  .click();
```

Because the _mechanism_ of an action lives in the spec, any change to how a
feature is exercised — a Draft button becoming drag-to-slot, a search input
moving, a confirm dialog being added — forces edits across **every spec that
touches it**, not just the page object. That is the opposite of what a Page
Object Model is supposed to buy. This repo already pays a recurring tax for it:
UI changes routinely require touching many specs at once (see the e2e-baseline
churn in LS-5030, LS-8010, LS-8012), and the role/testid drift bugs
(Tamagui dropping `data-testid`, LS-7878 roster/compare locators) land as
spec-by-spec fixes rather than one page-object fix.

Three further gaps:

1. **No component layer.** `NavigationPage` is really a reusable header widget,
   not a route. The `[data-testid^="league-card-"]` filter, the player search
   box, the premium-gate overlay (premium-gated `/players/compare`, `/roster` —
   LS-7878), confirm dialogs, and toasts recur across pages as copy-pasted
   locators with no shared home.
2. **No read/query surface.** Specs scrape values off raw locators ad hoc;
   there is no semantic way to ask "what round is the draft on?" or "which
   players are drafted?".
3. **No dependency injection.** Specs `new DraftPage(page)` themselves, so
   there is no single place to compose page objects or enforce their use.

Forces in tension:

- **Decoupling vs. retry safety.** A read that returns a plain value
  (`await draft.currentRound()`) is ergonomic but is a point-in-time snapshot
  with no auto-retry. Playwright's web-first assertions
  (`expect(locator).toHaveText(...)`) retry, which is what kills flake. We want
  both, without leaking a `Locator` to the spec to get the retry.
- **One driver, two suites.** The same page object should drive both the
  hermetic and the live integration suite. That only holds if page objects
  contain **no mocking and no data setup** — those belong to fixtures
  (`auth-enhanced.ts`, `shared-mocks.ts`) and `page.route()` handlers, which
  differ per suite.
- **Enforcement vs. migration friction.** A lint rule that bans selectors in
  specs is the only durable guarantee of the boundary, but it cannot be turned
  on globally until enough specs are migrated.

### Alternatives considered

1. **Keep public locators, add more helper methods.** Rejected: helpers
   alongside public locators do not stop specs from reaching past them; the
   coupling remains and the "change the object, not the test" promise is not
   enforceable.
2. **Plain functions instead of classes** (`draftPlayer(page, name)`).
   Rejected: loses the natural home for a private locator set and component
   composition, and diverges from the established class-per-route idiom.
3. **A custom assertion/value DSL returning wrapped locators.** Rejected as
   over-engineered; Playwright's built-in web-first assertions already provide
   retry — we wrap them, we do not replace them.
4. **Convention-only enforcement** (document the rule, catch in review).
   Rejected as the durable mechanism: review misses are exactly how the current
   coupling accumulated. Used only as the _interim_ state during migration
   (see Rollout).

## Decision

We will **evolve the existing Page Object Model into a semantic layer with
private locators and three public surfaces, add a reusable component layer,
inject page objects via fixtures, and enforce a "no selectors in specs"
boundary with ESLint.**

### 1. Three public surfaces; locators are private

Every page and component object exposes only:

- **Actions** — semantic verbs (`draftPlayer(name)`, `joinLeague(name)`)
  returning `Promise<void>`, or the next page object for navigational flows.
  An action encapsulates the _whole_ mechanism: locate → interact → wait for
  the settled state.
- **Reads** — semantic getters returning **plain data**
  (`currentRound(): Promise<number>`, `draftedPlayers(): Promise<string[]>`,
  `isPlayerAvailable(name): Promise<boolean>`). For branching and logging.
- **Assertions** — thin wrappers over Playwright web-first assertions
  (`expectRound(3)`, `expectBoardVisible()`) for "wait until" semantics, so
  retry safety is preserved without exposing a `Locator`.

Locator fields become private (`#field`). The DOM — testids, roles,
placeholders — is an implementation detail of the object.

```ts
// after — the spec states intent; the object owns the mechanism
await draftPage.goto(leagueId);
await draftPage.draftPlayer('Mike Trout');
expect(await draftPage.draftedPlayers()).toContain('Mike Trout');
expect(await draftPage.isPlayerAvailable('Mike Trout')).toBe(false);
```

### 2. Component layer

Reusable widgets live in `apps/web-e2e/src/components/*.component.ts`, scoped to
a **root `Locator`** rather than a route, and exposing the same three surfaces.
Page objects compose them. Initial set, all extracted from existing duplication:
`NavHeader` (from `NavigationPage`), `LeagueCard` (the `league-card-*` filter),
`PlayerSearchBox` (the debounced draft/players search), `PremiumGate`,
`ConfirmDialog`, `Toast`.

### 3. Identity is a fixture dimension; capabilities compose, not inherit

Auth/entitlement identity — admin, authenticated, premium, free, unauthenticated
— is **not** modeled as a page-object hierarchy (`AdminDraftPage extends
DraftPage`). Identity × route is a combinatorial explosion, and the same
`DraftPage` must be drivable by any identity. Identity is already a **fixture**
concern and stays there: `adminTest` / `unauthTest` / `createCustomAuthTest`
(`auth-enhanced.ts`) set the JWT/storage state, and `useTier('premium' | 'free'
| 'admin')` (`shared-mocks.ts`) sets the entitlement mock. A spec selects an
identity by importing the right fixture; the page object is unchanged.

```ts
import { adminTest } from '../fixtures/auth-enhanced';
adminTest('admin sees the console', async ({ draftPage }) => {
  /* same DraftPage */
});
```

Cross-cutting _page capabilities_ (a page guarded by a premium gate, a page with
the nav header, a page that raises toasts) are modeled by **component
composition** — the page holds a `premiumGate: PremiumGate` field — not by
inheritance or mixins. Composition keeps each capability's locators in one
component, avoids the diamond/`super` ordering problems of multiple inheritance,
and matches the component layer (§2).

A TypeScript **mixin** (`PremiumGated(BasePage)`) is reserved for the narrow case
where a capability's methods must read as _first-class methods on the page's own
surface_ (e.g. `await draftPage.expectGated()` rather than
`await draftPage.premiumGate.expectVisible()`) across many pages. Default to
composition; reach for a mixin only when the inlined API materially improves
spec readability. Single-level `extends BasePage` (§4) remains the only true
inheritance.

### 4. Base classes

`apps/web-e2e/src/base/base.page.ts` and `base.component.ts` hold the shared
primitives only (page handle, root locator, testid-gated `waitReady`, `goto`
helper) — no app knowledge.

### 5. Fixture injection

Page objects are provided to specs via a `test.extend` fixture
(`apps/web-e2e/src/fixtures/pages.ts`), composed on top of the existing
`auth-enhanced` fixtures. Specs receive `{ draftPage, leaguePage, ... }` and
never call `new`.

### 6. Boundary: page objects are pure UI drivers

Page and component objects contain **no `page.route()`, no mock data, no JWT or
identity setup**. Mocking (hermetic) and identity/seed (integration) stay in
fixtures and route handlers. This is what lets the same object drive both
suites.

### 7. Lint-enforced "no selectors in specs"

An ESLint `no-restricted-syntax` rule bans `getByTestId`, `getByRole`,
`getByPlaceholder`, `getByText`, and `locator(` in `apps/web-e2e/src/**/*.spec.ts`.
Selectors are permitted only in `base/`, `components/`, and `pages/`. Per the
ESLint override-clobber hazard (LS-7947), the rule is added under a **distinct
override key** with basename globs, extended last, rather than merged into an
existing `no-restricted-syntax` block.

## Rollout

Migration is incremental; the lint gate is the _last_ step, not the first:

1. Land `base/`, `fixtures/pages.ts`, and one component (`PlayerSearchBox` or
   `NavHeader`).
2. Refactor **one** page object end-to-end (`DraftPage` → private locators +
   three surfaces) and migrate its specs as the reference implementation.
3. Convert the remaining page objects opportunistically as their specs are
   touched.
4. Once a majority comply, enable the ESLint rule — initially scoped to
   migrated spec files (an `overrides` glob list), widening to all
   `*.spec.ts` when migration completes. Until then the boundary is
   convention + review.

The pattern and conventions are documented in
`.agents/skills/testing/SKILL.md`.

## Consequences

### Easier

- A UI mechanism change (button → drag, added confirm dialog, moved input,
  testid/role drift) is a **one-object edit**, not a spec-wide sweep — directly
  addressing the recurring multi-spec churn (LS-5030, LS-8010, LS-8012) and
  locator-drift fixes (LS-7878, Tamagui testid loss).
- Specs read as intent (`draftPlayer`, `joinLeague`, `draftedPlayers`) and are
  legible to non-authors.
- The same page object drives both the hermetic and integration suites, since
  it carries no mocking — one UI vocabulary across both tiers.
- Duplicated locators (league cards, search boxes, premium gate) collapse into
  shared components.

### Harder

- Up-front refactor cost: every migrated page object and its specs must be
  rewritten, and locators must be re-homed into objects/components.
- An extra indirection — a developer debugging a failing spec reads the page
  object to see the actual selectors rather than seeing them inline.
- Two read styles to choose between (plain-value reads vs. retrying
  assertions); authors must pick the right one (snapshot vs. "wait until").

### Now constrained

- **New specs may not contain selectors.** `getByTestId`/`getByRole`/`locator(`
  etc. in a `*.spec.ts` is an ESLint error once the rule is live; element access
  goes through a page or component object.
- **New locators live in `base/`, `components/`, or `pages/` only**, behind the
  three-surface API — locator fields are private.
- **Page/component objects may not mock or seed data.** Any `page.route()`,
  mock payload, or identity setup in a page object breaks the both-suites
  contract and belongs in a fixture or route handler.
- New reusable widgets are added as components scoped to a root locator, not as
  ad-hoc locators duplicated across page objects.
