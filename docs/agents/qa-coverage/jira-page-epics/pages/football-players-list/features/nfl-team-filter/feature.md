# Feature: NFL Team Filter

**Jira:** LS-5443
**Page:** `football-players-list` (Epic LS-5271)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Dropdown filter that narrows the Football Players list by NFL team or conference.
The filter appears below the position pills in the sticky filter bar and updates
results without a page reload.

## Source

Extracted from: `docs/agents/pages/football/players.md`

## Implementation

### Web

**Components:**

- `apps/web/src/components/football/FootballTeamFilter.tsx` — standalone Tamagui
  `Select` component used by the page
- `apps/web/src/pages/football/FootballPlayersPage.tsx` — owns the `teamFilter`
  state (`useState<TeamFilter>('All')`, line 352) and passes it to both the
  component and the GraphQL query

**Dropdown options (top-to-bottom):**

| Value                 | Label                 | GraphQL mapping                         |
| --------------------- | --------------------- | --------------------------------------- |
| `All`                 | All Teams             | neither `nflTeam` nor `conference` sent |
| `AFC`                 | AFC                   | `conference: "AFC"`                     |
| `NFC`                 | NFC                   | `conference: "NFC"`                     |
| `KC` … `SEA` (all 32) | `<abbr> — <fullName>` | `nflTeam: "<abbr>"`                     |

A divider separates the three header options (All / AFC / NFC) from the 32 team
entries. The trigger button displays the team's `fullName` for individual teams,
the conference abbreviation for AFC/NFC, and "All Teams" when reset.

**Filter state persistence:** team filter uses local React state only; it is
NOT persisted to the URL (unlike the position filter which uses `?position=`).

**Query variables (`FootballPlayers.graphql`):**

```graphql
query FootballPlayers(
  $position: String
  $nflTeam: String
  $conference: String
  $search: String
  $after: String
) { … }
```

When the filter changes, the cursor is reset to `undefined` and `allNodes` is
cleared so the paginated list replaces rather than appends.

### Mobile (Android / mobile-web)

**File:** `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/football/players.tsx`

Identical filtering logic: `useState('All')` → `isConference` check →
`nflTeam` / `conference` query vars. The mobile `Select` component reuses the
same Tamagui primitives. Team options are built from
`NFL_TEAMS` (`@legacy-sports/shared-components`).

### Shared data

**NFL team constants:** `lib/shared-components/src/constants/nflTeams.ts`
exports `NFL_TEAMS` — all 32 teams keyed by abbreviation with `fullName`,
`conference`, `division`, and brand colours.

## Test Coverage

### Unit tests (mobile)

File: `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/football/players.spec.tsx`

The existing `describe('FootballPlayers')` suite covers adjacent features (position
filter, search, navigation) but does not yet have a dedicated `describe` block for
the team filter. The filter's query-variable routing is indirectly exercised through
the GraphQL mock in every test.

## Related

- **Epic:** LS-5271 — QA — Page: Football Players List
- **Position filter:** LS-5439 — `FootballPositionFilter`
- **Player search:** LS-5442 — search input and debounce
- **Gap audit:** LS-7599 — feature-discovery-gaps for this page
- **Web component:** `apps/web/src/components/football/FootballTeamFilter.tsx`
- **Mobile screen:** `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/football/players.tsx`
