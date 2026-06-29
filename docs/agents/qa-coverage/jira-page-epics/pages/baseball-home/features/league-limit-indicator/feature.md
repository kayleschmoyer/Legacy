# Feature: League Limit / Slots Indicator

**Jira:** LS-5339
**Page:** `baseball-home` (Epic LS-5258)
**Platforms:** web, mobile-web, android
**Entitlement:** mixed (free users see count + upgrade prompt at cap; premium users see no cap UI)

## Description

Communicates remaining league slots to free-tier users. Shows a `"Your leagues: X/Y"` counter
and — when the user has reached their limit — an `"— Upgrade to add more"` inline link that
navigates to the subscription upgrade screen.

For free users the "Create" button is also disabled when `atLimit: true`, enforcing the cap
at the UI layer. Premium users see an "Unlimited leagues" badge instead (LS-5870) — passed
via the `isPremium` prop on `MLBHome`; the free-tier count/limit row is hidden.

The free-tier cap is **3 active leagues** (`FREE_TIER_LEAGUE_LIMIT = 3` in
`apps/app/src/features/subscription/constants.ts`), mirroring the server-enforced limit in
`lambdas/db/src/schema/subscriptions.ts`.

## Source

Extracted from: `inferred from docs/agents/pages/my-leagues-overview.md`

## Implementation

**Shared component:** `lib/shared-components/src/features/baseball/MLBHome.tsx`

The cap indicator renders from the optional `leagueCap?: MLBHomeLeagueCap` prop (lines 559–577):

```tsx
{leagueCap ? (
  <XStack alignItems="center" flexWrap="wrap" gap="$2">
    <Text color="$gray11" fontSize="$4">
      Your leagues: {leagueCap.count}/{leagueCap.limit}
    </Text>
    {leagueCap.atLimit ? (
      <Text color={BRAND_GOLD} … onPress={leagueCap.onUpgrade}>
        — Upgrade to add more
      </Text>
    ) : null}
  </XStack>
) : null}
```

`MLBHomeLeagueCap` shape:

| Field       | Type         | Description                                  |
| ----------- | ------------ | -------------------------------------------- |
| `count`     | `number`     | Current number of active (non-mock) leagues  |
| `limit`     | `number`     | Free-tier ceiling (`FREE_TIER_LEAGUE_LIMIT`) |
| `atLimit`   | `boolean`    | `count >= limit`                             |
| `onUpgrade` | `() => void` | Navigate to subscription upgrade screen      |

**Mobile wrapper (android / mobile-web):** `apps/app/src/app/(app)/baseball/index.tsx`

Passes `leagueCap` when the user is free-tier and leagues have loaded:

```ts
leagueCap={
  showLeagueCap
    ? { count: rawLeagues.length, limit: FREE_TIER_LEAGUE_LIMIT,
        atLimit: atFreeLeagueLimit, onUpgrade: goToUpgrade }
    : undefined
}
```

**Web wrapper (web):** `apps/web/src/components/baseball/BaseballScreen.tsx`

The web wrapper passes `leagueCap` for authenticated users and `isPremium` for premium users.
The `Create` button on web is never disabled by the free-tier cap (atLimit is only enforced
on mobile). Premium users see the "Unlimited leagues" badge via `isPremium` (LS-5870).

## Test Coverage

### Unit tests

File: `lib/shared-components/src/features/baseball/MLBHome.spec.tsx`

`describe('MLBHome')`:

- Renders the league-cap indicator and disables Create at the cap
  — passes `leagueCap={{ count: 3, limit: 3, atLimit: true, onUpgrade }}`,
  asserts `"Your leagues: 3/3"` text and that the Create button is `disabled`,
  and that clicking `"— Upgrade to add more"` fires `onUpgrade`

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/league-limit-indicator.spec.ts`

`describe('Baseball Home — league slots context @regression')`:

- Baseball hub renders with three mocked leagues for a free-tier user
- "Your Leagues" section lists all three leagues
- Create League button is present and enabled (cap indicator is web-only gap — web wrapper
  does not pass leagueCap, so the button is never disabled by the cap on this platform)
- Create League button is present and enabled for a premium user with three leagues
- Premium user sees "Unlimited leagues" badge (LS-5870)

## Related

- **Epic:** LS-5258 — QA — Page: Baseball Home
- **Shared component:** `lib/shared-components/src/features/baseball/MLBHome.tsx`
- **Mobile data wrapper:** `apps/app/src/app/(app)/baseball/index.tsx`
- **Web data wrapper:** `apps/web/src/components/baseball/BaseballScreen.tsx`
- **Free-tier limit constant:** `apps/app/src/features/subscription/constants.ts`
- **Server enforcement:** `lambdas/db/src/schema/subscriptions.ts`
