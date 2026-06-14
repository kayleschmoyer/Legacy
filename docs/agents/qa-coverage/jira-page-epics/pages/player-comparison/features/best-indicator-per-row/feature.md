# Feature: BEST Indicator on Highest Value

**Jira:** LS-5568
**Page:** `player-comparison` (Epic LS-5286)
**Platforms:** web, mobile-web, android
**Entitlement:** premium

## Description

Upward triangle (▲) + "BEST" label shown in gold on the column with the highest value
per comparison row. Applies to every stat group in the comparison table: Fantasy Scoring
Projections, Career Batting, Career Pitching, and Career Achievements.

For stats where a lower value is better (ERA, Losses, Walks in the pitching section),
the indicator highlights the column with the _lowest_ value. When two or more players
share the same best value in a row (a tie), no indicator is shown in that row.

## Source

Extracted from: `docs/agents/pages/players/compare.md`

## Implementation

**Component:** `lib/shared-components/src/features/players/PlayerComparison.tsx`

The `bestIndex` helper (exported for unit testing) determines the winning column index
for a stat row:

- Accepts an array of numeric values and an optional `lowerIsBetter` flag.
- Returns `null` when fewer than 2 non-null values exist, or when the best value is tied.
- Otherwise returns the 0-based index of the winning column.

The `ComparisonTable` sub-component calls `bestIndex` per `StatRow` and, when a winner
is found (`isBest === true`), renders two additional `Text` nodes inside the winning cell:

1. `"▲"` — gold upward triangle (fontSize 9, color `BRAND_GOLD`)
2. `"BEST"` — gold badge with a subtle gold background (fontSize 9, borderRadius 3)

Both nodes are omitted for every other cell in the same row. The numeric value in the
winning cell is also rendered in `BRAND_GOLD_LIGHT` instead of white.

## Test Coverage

### Unit tests

File: `lib/shared-components/src/features/players/PlayerComparison.spec.tsx`

`describe('bestIndex')`:

- Returns null when fewer than two non-null values are present
- Returns the index of the highest value by default
- Returns the index of the lowest value when `lowerIsBetter`
- Returns null on a tie (no single leader)
- Ignores nullish values when picking the leader

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/player-comparison-best-indicator.spec.ts`

`describe('Player Comparison – BEST indicator @regression')`:

- "BEST" badge is visible in the comparison table when 2 players are added
- Upward triangle ▲ is visible alongside the "BEST" badge
- All-Star Selections row shows BEST for the player with more selections (Judge 5 > Ohtani 4)
- All-Star Selections row shows exactly one BEST badge (not two)
- MVP Awards row shows no BEST when both players are tied (both have 2)
- Cy Young Awards row shows no BEST when both players have 0 (tie at zero)
- Silver Sluggers row shows BEST for the leading player (Judge 3 > Ohtani 2)
- World Series Rings row shows BEST for the leading player (Judge 1 > Ohtani 0)
- Fantasy Score row shows BEST for the player with the higher score (Ohtani 960 > Judge 850)
- Stolen Bases row shows BEST for the player with more (Ohtani 50 > Judge 10)

`describe('Player Comparison – BEST indicator lowerIsBetter @regression')`:

- ERA row shows BEST for the pitcher with the lower ERA when two pitchers are compared

## Related

- **Epic:** LS-5286 — QA - Page: Player Comparison
- **Implementation ref:** `docs/agents/pages/players/compare.md`
- **Unit test helper:** `bestIndex` exported from `lib/shared-components/src/features/players/PlayerComparison.tsx`
- **Existing partial coverage:** `apps/web-e2e/src/tests/player-comparison-stats-charts.spec.ts` — "stat values & best highlighting" describe block contains a basic visibility smoke test
