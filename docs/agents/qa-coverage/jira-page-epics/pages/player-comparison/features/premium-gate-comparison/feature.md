# Feature: Premium Gate for Player Comparison

**Jira:** LS-5575
**Page:** `player-comparison` (Epic LS-5286)
**Platforms:** web, mobile-web, android
**Entitlement:** `premium`

## Description

The entire comparison experience is access-gated. The viewer falls into one of
three mutually exclusive access states, each with distinct chrome and copy:

1. **Anonymous visitor** (not signed in) — a full-page sign-in prompt with a
   "Create a free account…" pitch and a "Get Started Free" CTA. No premium gate
   is shown; the visitor is asked to authenticate first.
2. **Authenticated free user** — the full comparison page is legible (no blur
   overlay, per LS-7012) with an inline `PremiumBanner` whose "Upgrade" pill
   opens the `UpgradeModal`. Premium-only rows (career pitching, BEST
   indicators) stay hidden.
3. **Premium subscriber** — the full feature is unlocked and the inline banner
   shows a non-interactive "Subscribed" pill.

## Source

Extracted from: `docs/agents/pages/players/compare.md`

## Implementation

**Web page:** `apps/web/src/pages/players/PlayerComparisonPage.tsx`
**Shared component:** `lib/shared-components/src/features/players/PlayerComparison.tsx`

The web page resolves auth via `useAuth()` and entitlement via
`useHasEntitlement(ENTITLEMENTS.player_comparison)`, then injects `isAuthenticated`,
`isPremium`, `onSignIn`, and `onUpgrade` into the cross-platform `PlayerComparison`
component. The component branches on those props to render the correct access state.

### Access-state variants

| Variant              | Trigger                              | Rendered by                                          | User-facing chrome                                                                                                                                   |
| -------------------- | ------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anonymous-visitor`  | `!authLoading && !isAuthenticated`   | `SignInPrompt` (`PlayerComparison.tsx`)              | Lock icon, heading "Sign in to compare players", body "Create a free account to compare up to 4 players…", "Get Started Free" CTA → navigates to `/` |
| `authenticated-free` | authenticated, `isPremium === false` | `PremiumBanner` + `UpgradeModal` (full page legible) | Inline gold banner "Premium · Player Comparison" with an "Upgrade" pill that opens the upgrade modal                                                 |
| `premium`            | authenticated, `isPremium === true`  | `PremiumBanner` (Subscribed) + full feature          | Inline banner shows a disabled "Subscribed" pill; career pitching rows and per-row BEST/TIE indicators are unlocked                                  |

**Anonymous-visitor copy (single source of truth):** the body text reuses the
sub-clause of `PLAYER_COMPARISON_FEATURE_DESCRIPTION` ("…compare up to 4 players
side-by-side with career stats, scoring projections, and season breakdowns.")
prefixed with the "Create a free account to" call to action. The CTA button is
labelled "Get Started Free" (`aria-label="Get Started Free"`) and invokes the
`onSignIn` callback, which the web page wires to `navigate('/')`.

> **Why `anonymous-visitor` is a distinct variant:** an unauthenticated viewer
> never reaches the premium gate — they are short-circuited to `SignInPrompt`
> before any premium chrome renders. The copy, CTA, and navigation target all
> differ from the authenticated-free upgrade path, so the journey must be
> covered independently rather than folded into the free-vs-premium split.

## Test Coverage

### E2E tests (hermetic)

**File:** `apps/web-e2e/src/tests/player-comparison.spec.ts`

- `describe('Player Comparison – unauthenticated visitor @regression')` — covers
  the **`anonymous-visitor`** variant:
  - `'does not show the player comparison tool when not authenticated'` —
    asserts the "Compare up to four" masthead heading is not visible.
  - the `'"Get Started Free" CTA is visible and navigates to /'` case asserts
    the "Get Started Free" button is visible and enabled, and that clicking it
    navigates to `/`.
- `describe('Player Comparison – premium gate @regression')` (`freeUserTest`) —
  covers the **`authenticated-free`** variant, including
  `'shows inline premium upgrade CTA for non-premium users (LS-7012)'` and
  `'shows Upgrade button in the inline premium banner (LS-7012)'`.
- `describe('Player Comparison – page structure (premium) @smoke')` — covers the
  **`premium`** variant with a premium-tier `getUserById` mock.

## Related

- **Epic:** LS-5286 — QA — Page: Player Comparison
- **Feature Discovery Gaps bucket:** LS-7606
- **GAP-001 (anonymous-visitor variant):** LS-7655 —
  `docs/agents/qa-coverage/jira-page-epics/pages/player-comparison/features/feature-discovery-gaps/variants/non-premium/findings/GAP-001.md`
- **Implementation ref:** `docs/agents/pages/players/compare.md`
- **Web page:** `apps/web/src/pages/players/PlayerComparisonPage.tsx`
- **Shared component:** `lib/shared-components/src/features/players/PlayerComparison.tsx`
- **Base E2E tests:** `apps/web-e2e/src/tests/player-comparison.spec.ts`
