# Feature: Football Stats Columns

**Jira:** LS-5440
**Page:** `football-players-list` (Epic LS-5271)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Per-position career stat columns displayed on each player card in the Football
Players List. The card adapts to the player's position group and renders only
the stat categories for which the server returned data, so multi-category
players (e.g. dual-threat QBs, pass-catching RBs) show every populated row
rather than just the one mapped to their nominal position.

Six rendering paths exist:

| Position group     | Stats shown                                                   |
| ------------------ | ------------------------------------------------------------- |
| **QB / pocket**    | Pass: YDS · Pass TD · INT · RTG                               |
| **QB / dual**      | Pass: YDS · Pass TD · Rush TD · INT · RTG; Rush: YDS          |
| **RB / WR / TE**   | Rush: YDS · TD (if present); Rec: REC · YDS · TD (if present) |
| **K**              | Kick: FGM/FGA · FG%                                           |
| **DST**            | Sacks · INT · Pts Allowed/G                                   |
| **IDP (DL/LB/DB)** | Solo · Sacks · INT · FF                                       |

All paths append a **Career FPts** line (gold text) when
`careerStats.fantasyPoints` is non-null. Fantasy points are computed
server-side from career totals using the `@legacy-sports/scoring` package;
the card reads and formats the pre-computed value.

## Source

Extracted from: `docs/agents/pages/football/players.md`

## Implementation

**Card component:** `lib/shared-components/src/features/football/FootballPlayerCard.tsx`

**GraphQL fragment:** `FootballPlayerHeader` in
`apps/web/src/api/db/football/FootballPlayers.graphql`

**Web page:** `apps/web/src/pages/football/FootballPlayersPage.tsx`

### Stat rendering logic

Three internal sub-components gate on the `isDst` flag and the `isIdp`
(position in `{ DL, LB, DB }`) flag, evaluated in `FootballPlayerCard`:

```
isDst  → DstStats
isIdp  → IdpStats
else   → OffenseStats
```

`OffenseStats` renders category rows based on **data presence**, not position
label (LS-6242). Each `passing`, `rushing`, `receiving`, and `kicking` object
is rendered only when non-null. This stops populated categories from being
silently skipped when a player crosses position boundaries.

### QB dual-threat rendering (LS-6472)

For QB players with both `passing` and `rushing` data present:

- The passing TD label becomes **"Pass TD"** (instead of "TD").
- A **"Rush TD"** chip is inlined in the Pass row, showing `rushing.td`.
- The Rush row retains **YDS** but omits TD to avoid duplication.

For non-QB positions, "TD" is used without qualification and the Rush row
always includes TD.

### Kicking FG% (LS-6244)

`kicking.fgPct` is provided by the server (a single source of truth) — the
card reads it directly and does not recompute it from `fgm / fga`. Formatted
via `fmtFloat` (one decimal) with a `%` suffix.

### Fantasy points display

Shown as a separate `Career FPts` row below all stat categories when
`careerStats.fantasyPoints != null`. Rendered in `BRAND_GOLD` (`#C5A55A`) to
visually distinguish it from standard stat values. Formatted to one decimal
place.

### GraphQL fields queried (list view)

```
careerStats {
  fantasyPoints
  passing { yds  td  int  rating }
  rushing { yds  td }
  receiving { rec  yds  td }
  kicking { fgm  fga  fgPct }
  defense { sacks  int  ptsAllowedPerG }
  idp { soloTkl  astTkl  sacks  int  ff }
}
```

## Test Coverage

### Unit tests

**File:** `lib/shared-components/src/features/football/FootballPlayerCard.spec.tsx`

`describe('FootballPlayerCard')`:

- renders the player name and position badge
- fires `onNavigateToPlayer` with the player id when pressed
- renders DST stats for a defense without offense rows

`describe('LS-6242 — multi-category players render every populated category')`:

- renders both passing and rushing rows for a dual-threat QB
- renders both rushing and receiving rows for a pass-catching RB
- renders only the populated category for a single-category QB
- shows "No stats available" when `careerStats` is null

`describe('LS-6472 — QB rushing TDs shown prominently alongside passing TDs')`:

- labels passing TDs as "Pass TD" for a QB with rushing data
- shows "Rush TD" inline in the passing section for a dual-threat QB
- still shows the Rush row with rushing yards for a dual-threat QB
- uses "Pass TD" label even for a single-category pocket QB
- uses generic "TD" label for a non-QB player with rushing stats

`describe('LS-6460 — selectable state for player comparison')`:

- fires `onSelect` with the numeric id (not `onNavigateToPlayer`) when selectable and pressed
- renders a checkmark when selected
- does not render a checkmark when selectable but not selected

### E2E tests

No dedicated E2E spec exists for per-position stat column rendering. The
`apps/web-e2e/src/tests/football-players-position-url.spec.ts` file covers
position filter URL state, not stat column content. Adding a hermetic spec
that asserts stat labels and values per position group is an open coverage
gap.

## Related

- **Epic:** LS-5271 — QA — Page: Football Players List
- **Implementation ref:** `lib/shared-components/src/features/football/FootballPlayerCard.tsx`
- **GraphQL fragment:** `FootballPlayerHeader` in `apps/web/src/api/db/football/FootballPlayers.graphql`
- **Multi-category rendering:** LS-6242
- **QB dual-threat Rush TD fix:** LS-6472
- **Kicking FG% server-side:** LS-6244
- **Fantasy points on player cards:** LS-6469
- **Selectable state (compare):** LS-6460
