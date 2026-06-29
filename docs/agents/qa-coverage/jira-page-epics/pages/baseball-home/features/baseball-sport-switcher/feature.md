# Feature: Sport Switcher Entry (Baseball)

**Jira:** LS-5336
**Page:** `baseball-home` (Epic LS-5258)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Entering the baseball context from the home page via the sport-selection cards.
The `HomeScreen` component renders a `SportCard` for each available sport in two
distinct sections depending on whether the user has existing leagues:

- **Returning user** ("Your Sports" section) — compact `SportCard` rendered inside
  an `XStack` grid beneath the league list. Clicking "View Leagues" calls
  `onViewSport('baseball')` which navigates to `/baseball`.
- **New user** ("Choose your sport" section) — full-size `SportCard` (`full` prop)
  rendered in the getting-started flow. Clicking "View Leagues" calls the same
  `onViewSport('baseball')` callback.

The baseball card is always marked `available: true`; football is `available:
false` ("Coming Soon") with its action buttons disabled. Only the baseball card
triggers live navigation.

## Source

Extracted from: `docs/agents/pages/home.md` + `docs/agents/pages/baseball/leagues.md`

## Implementation

### Shared component

**File:** `lib/shared-components/src/features/home/HomeScreen.tsx`

`SportCard` is an internal component that accepts a `SportConfig` object and an
`onView` callback. The sport registry is:

```typescript
const SPORTS: SportConfig[] = [
  { key: 'baseball', icon: 'baseball', title: 'Baseball', available: true, ... },
  { key: 'football', icon: 'football', title: 'Football', available: false, ... },
];
```

When `sport.available` is `true`, the card renders two enabled `ActionButton`
elements: `"Create League"` (gold) and `"View Leagues"` (outline). When
`available` is `false`, both buttons are rendered disabled. Clicking "View
Leagues" on the baseball card fires `onView`, which the parent page maps to
`onViewSport('baseball')`.

The card title has `testID={`sport-card-title-${sport.key}`}` for deterministic
E2E selection, avoiding the hidden SVG `<title>Baseball</title>` that precedes
the visible text in DOM order (LS-4264).

### Web

**File:** `apps/web/src/pages/home/HomePage.tsx`

```typescript
onViewSport={(sport) =>
  navigate(sport === 'football' ? '/football' : '/baseball')
}
```

Uses `react-router-dom`'s `useNavigate` to push `/baseball`.

### Android (React Native / Expo Router)

**File:** `apps/app/src/app/(app)/(tabs)/home.tsx`

```typescript
onViewSport={(sport) =>
  router.navigate(sport === 'football' ? '/football' : '/baseball')
}
```

Uses Expo Router's `useRouter` to navigate to `/baseball`.

## Test Coverage

### Unit tests

**File:** `lib/shared-components/src/features/home/HomeScreen.spec.tsx`

`describe('HomeScreen — getting started (no leagues)')`:

- `'renders the getting-started hero and both sport cards'`
  — asserts `getByText('Choose your sport')` and both sport card titles are present

### E2E tests (hermetic)

**File:** `apps/web-e2e/src/tests/homepage.spec.ts`

`describe('Homepage @smoke')`:

- `'displays the Baseball sport card'`
  — asserts `getByTestId('sport-card-title-baseball')` is visible

### Coverage gaps

The following journeys are not yet covered by a hermetic E2E test:

- Clicking "View Leagues" on the baseball `SportCard` navigates to `/baseball`
  (both returning-user compact card and new-user full card).
- Football card buttons are disabled / non-navigating when `available: false`.

## Related

- **Epic:** LS-5258 — QA — Page: Baseball Home
- **Implementation ref (web):** `apps/web/src/pages/home/HomePage.tsx`
- **Implementation ref (android):** `apps/app/src/app/(app)/(tabs)/home.tsx`
- **Shared component:** `lib/shared-components/src/features/home/HomeScreen.tsx`
- **Home page reference:** `docs/agents/pages/home.md`
