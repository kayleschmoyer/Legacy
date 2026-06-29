# Feature: Football Position Filter

**Jira:** LS-5439
**Page:** `football-players-list` (Epic LS-5271)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Horizontally-scrollable pill row that filters the Football Players list by position.
Positions available: QB, RB, WR, TE, FLEX, K, DST, DL, LB, DB. Each pill is
color-coded by position using `FOOTBALL_POSITION_COLORS` from
`apps/web/src/constants/colors.ts`. An "All" pill (no color accent) clears the
selection. The filter supports **multi-select** (LS-6464): multiple positions may
be active simultaneously; the active set is passed as `positions: [String!]` to the
GraphQL query.

## Source

Extracted from: `docs/agents/pages/football/players.md`

## Implementation

### Web

**Component:** `apps/web/src/components/football/FootballPositionFilter.tsx`

**Page:** `apps/web/src/pages/football/FootballPlayersPage.tsx`

#### Position pills

Pills are rendered as `role="button"` elements with `aria-pressed` inside a
`role="group" aria-label="Filter by position"` container. The pill row lives in
a horizontally-scrollable `ScrollView` with a right-edge fade mask so off-screen
pills are discoverable.

Position display order:

| Index   | Label | Active accent color                |
| ------- | ----- | ---------------------------------- |
| 0 (All) | All   | `BRAND_NAVY`                       |
| 1       | QB    | `FOOTBALL_POSITION_COLORS['QB']`   |
| 2       | RB    | `FOOTBALL_POSITION_COLORS['RB']`   |
| 3       | WR    | `FOOTBALL_POSITION_COLORS['WR']`   |
| 4       | TE    | `FOOTBALL_POSITION_COLORS['TE']`   |
| 5       | FLEX  | `FOOTBALL_POSITION_COLORS['FLEX']` |
| 6       | K     | `FOOTBALL_POSITION_COLORS['K']`    |
| 7       | DST   | `FOOTBALL_POSITION_COLORS['DST']`  |
| 8       | DL    | `FOOTBALL_POSITION_COLORS['DL']`   |
| 9       | LB    | `FOOTBALL_POSITION_COLORS['LB']`   |
| 10      | DB    | `FOOTBALL_POSITION_COLORS['DB']`   |

An active pill gets `backgroundColor: withAlpha(accentColor, 0.3)`,
`borderColor: accentColor`, and `textDecoration: 'underline'`. The "All" pill
uses `color: TEXT_PRIMARY` when active (no colored text); position pills use the
accent color as their text color when active.

#### Keyboard navigation (roving tabindex)

Only one pill is in the tab order at a time (`tabIndex=0`); all others use
`tabIndex=-1`. Arrow keys (Left/Right/Up/Down) move focus cyclically. Space or
Enter toggles the focused pill. Implemented via a `focusIndex` state and a
`pillRefs` ref array (LS-6466).

#### Multi-select state (LS-6464)

`FootballPositionFilter` is intent-based: it emits `onToggle(pos)` or `onClear()`
instead of the full new array. `FootballPlayersPage` resolves the new set against a
`positionsRef` (synchronous ref) to avoid stale-closure races during rapid toggles.

```typescript
// FootballPlayersPage.tsx (simplified)
const togglePosition = useCallback((pos: FootballPosition) => {
  const current = positionsRef.current;
  const next = current.includes(pos)
    ? current.filter((p) => p !== pos)
    : [...current, pos];
  positionsRef.current = next;
  setPositionsState(next);
  // sync to URL
  params.set('position', next.join(','));
  setSearchParams(params, { replace: true });
}, []);

const clearPositions = useCallback(() => {
  positionsRef.current = [];
  setPositionsState([]);
  params.delete('position');
  setSearchParams(params, { replace: true });
}, []);
```

#### URL persistence (LS-6465)

The active positions are encoded in the `?position=` search param as a
comma-separated list (e.g. `?position=QB,RB`). Deep links pre-select the
specified positions on load. Browser back/forward restores the filter via a
`useEffect` that watches `searchParams`. Invalid position values are silently
filtered out by `parsePositions()`.

#### Query variables

```graphql
query FootballPlayers(
  $positions: [String!]
  $nflTeam: String
  $conference: String
  $search: String
  $after: String
  ...
) {
  footballPlayers(positions: $positions, ...) { ... }
}
```

When the position selection changes, the pagination cursor is reset to `undefined`
and `allNodes` is cleared so the list replaces rather than appends.

### Mobile (Android / mobile-web)

**File:** `apps/app/src/app/(app)/football/players.tsx`

Position pills are rendered with `testID="position-pill-<pos>"` for automation
targeting (LS-6481). State is `useState<FootballPosition[]>([])` (empty = All).
Multi-select toggle/clear logic mirrors the web implementation. Effective positions
merge the pills state with any positions parsed from the search input's inline
position shorthand (e.g. typing `"QB:"` in the search box).

```typescript
const effectivePositions = [...new Set([...positions, ...parsed.positions])];
// passed as: positions: effectivePositions.length > 0 ? effectivePositions : undefined
```

### Shared constants

**File:** `apps/web/src/constants/colors.ts`

```typescript
export const FOOTBALL_POSITION_COLORS: Record<string, string> = {
  QB: POS_QB,
  RB: POS_RB,
  WR: POS_WR,
  TE: POS_TE,
  FLEX: POS_FLEX,
  K: POS_K,
  DST: POS_DST,
  DL: POS_DL,
  LB: POS_LB,
  DB: POS_DB,
};

export function getFootballPositionColor(
  pos: string | null | undefined,
): string {
  return (pos && FOOTBALL_POSITION_COLORS[pos]) ?? BRAND_NAVY;
}
```

## Test Coverage

### Unit tests (mobile)

**File:** `apps/app/src/app/(app)/football/players.spec.tsx`

`describe('position filter')`:

- `'position pills render with testID for automation targeting (LS-6481)'`
  — `position-pill-All` and `position-pill-QB` are present in the DOM
- `'passes selected position to query when a pill is pressed'`
  — pressing QB pill sends `variables.positions = ['QB']`
- `'passes undefined positions when "All" pill is selected'`
  — pressing QB then All sends `variables.positions = undefined`
- `'accumulates multiple positions for multi-select (LS-6464)'`
  — pressing QB then WR sends `variables.positions = ['QB', 'WR']`
- `'toggles a position off when its pill is pressed again'`
  — pressing QB twice sends `variables.positions = undefined`

### E2E tests (hermetic)

**File:** `apps/web-e2e/src/tests/football-position-filter-a11y.spec.ts`

`describe('FootballPositionFilter — toggle group ARIA @regression')`:

- `'pill container has role=group with accessible label'`
- `'every pill is a role=button toggle'`
- `'"All" pill is pressed and in tab order by default'`
- `'position pills are unpressed and out of tab order by default'`

`describe('FootballPositionFilter — multi-select @regression')`:

- `'clicking a position selects it and deselects "All"'`
- `'multiple positions can be selected at once (QB + RB)'`
- `'clicking a selected position toggles it back off'`
- `'"All" clears the current multi-selection'`

`describe('FootballPositionFilter — keyboard navigation @regression')`:

- `'ArrowRight moves roving focus from All → QB'`
- `'ArrowLeft wraps roving focus from All → DB (last item)'`
- `'Space toggles the focused pill without moving selection'`
- `'only the focused pill has tabindex=0 after keyboard navigation'`

**File:** `apps/web-e2e/src/tests/football-players-position-url.spec.ts`

`describe('FootballPlayers — URL position persistence @regression')`:

- `'deep-link ?position=QB pre-selects the QB pill'`
- `'deep-link ?position=FLEX pre-selects the FLEX pill'`
- `'invalid ?position= param falls back to All being selected'`
- `'selecting a position writes ?position= to the URL'`
- `'selecting All clears the ?position= param from the URL'`
- `'position is restored after navigating to player detail and pressing back'`

## Related

- **Epic:** LS-5271 — QA — Page: Football Players List
- **Multi-select promotion:** LS-6464
- **URL persistence:** LS-6465
- **Keyboard a11y:** LS-6466
- **Mobile testID:** LS-6481
- **Web component:** `apps/web/src/components/football/FootballPositionFilter.tsx`
- **Web page:** `apps/web/src/pages/football/FootballPlayersPage.tsx`
- **Mobile screen:** `apps/app/src/app/(app)/football/players.tsx`
- **Color constants:** `apps/web/src/constants/colors.ts`
- **NFL team filter:** LS-5443
- **Player search:** LS-5442
- **Gap audit:** LS-7599
