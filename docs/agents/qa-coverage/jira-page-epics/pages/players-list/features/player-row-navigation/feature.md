# Feature: Player Row Navigation to Detail

**Jira:** LS-5604
**Page:** `players-list` (Epic LS-5289)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Tapping a player row on the Players List page navigates to that player's detail
page, which displays full stats and career data.

## Source

Extracted from: `inferred from docs/agents/pages/football/players.md`

## Implementation

### Web — Table View

**Component:** `apps/web/src/pages/football/FootballPlayersPage.tsx`

When `viewMode === 'table'`, each player is rendered as a `TableRow`. The row's
outer `XStack` carries an `onPress` handler that calls
`navigate('/football/players/${id}')` via react-router's `useNavigate`:

```typescript
onPress={() => player?.id != null && onNavigate(String(player.id))}
```

`onNavigate` is wired to `(id) => navigate('/football/players/${id}')` at the
page level.

### Web — Card View

**Component:** `apps/web/src/pages/football/FootballPlayersPage.tsx`

In card view (`viewMode === 'cards'`), `FootballPlayerCard` is rendered with
`isSelectable={true}` so clicking the card toggles the player into the compare
selection rather than navigating. Navigation in card mode is therefore available
only through the player detail deep-link (e.g. `/football/players/:id`).

### Android (React Native)

**Component:** `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/football/players.tsx`

Uses expo-router's `router.push` to navigate to the player detail screen when a
player row is pressed.

### Player Detail Page

**Component:** `apps/web/src/pages/football/FootballPlayerDetailPage.tsx`

Receives the player `id` from the URL param (`useParams`), fetches via
`useFootballPlayerQuery({ variables: { id: playerId } })`, and renders
`FootballPlayerDetail` (from `lib/shared-components`), which in turn renders
`FootballPlayerHeader` showing the player's name as an `h1`-level heading.

## Test Coverage

### E2E tests (hermetic)

**File:** `apps/web-e2e/src/tests/football-player-row-navigation.spec.ts`

`describe('Player row navigation to detail @regression')`:

- `'clicking a player row in table view navigates to the player detail page'`
  — mocks `FootballPlayers` list response with a single player (Patrick Mahomes,
  id=1), clicks the player name cell in the default table view, asserts
  `page.url()` ends at `/football/players/1`, and asserts the player detail
  heading renders "Patrick Mahomes".

## Related

- **Epic:** LS-5289 — QA — Page: Players List / Search
- **List page:** `apps/web/src/pages/football/FootballPlayersPage.tsx`
- **Detail page:** `apps/web/src/pages/football/FootballPlayerDetailPage.tsx`
- **Shared header component:** `lib/shared-components/src/features/football/FootballPlayerHeader.tsx`
