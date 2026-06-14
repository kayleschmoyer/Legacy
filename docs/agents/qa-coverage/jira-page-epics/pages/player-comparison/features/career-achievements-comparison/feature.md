# Feature: Career Achievements Comparison

**Jira:** LS-5569
**Page:** `player-comparison` (Epic LS-5286)
**Platforms:** web, mobile-web, android
**Entitlement:** premium

## Description

Compares All-Star Selections, MVP Awards, Cy Young Awards, Gold Gloves, Silver
Sluggers, and World Series Rings across selected players in the side-by-side
Career Achievements section of the Player Comparison page.

## Source

Extracted from: `docs/agents/pages/players/compare.md`

## Implementation

### Web

**Component:** `lib/shared-components/src/features/players/PlayerComparison.tsx`

The `achievementRows` memo (line 1683) derives six `StatRow` entries from each
active player's `careerAchievements` field:

| Row label           | Field                                  |
| ------------------- | -------------------------------------- |
| All-Star Selections | `careerAchievements.allStarSelections` |
| MVP Awards          | `careerAchievements.mvpAwards`         |
| Cy Young Awards     | `careerAchievements.cyYoungAwards`     |
| Gold Gloves         | `careerAchievements.goldGloves`        |
| Silver Sluggers     | `careerAchievements.silverSluggers`    |
| World Series Rings  | `careerAchievements.worldSeriesRings`  |

Values are rendered as plain integers via `String(n)` (no decimal places).
A `"BEST"` badge is shown on the column with the strictly highest value for
each row (`bestIndex` helper, line 113). When two or more players share the top
value, `bestIndex` returns `null` and no badge is shown (tied rows have no
leader).

The Career Achievements group is always appended last in `statGroups` (after
Fantasy Scoring Projections, Career Batting, and optionally Career Pitching).

## Test Coverage

### E2E tests (hermetic)

**File:** `apps/web-e2e/src/tests/player-comparison-career-achievements.spec.ts`

`describe('Player Comparison – career achievements row labels @regression')`:

- `'shows All-Star Selections row'`
- `'shows MVP Awards row'`
- `'shows Cy Young Awards row'`
- `'shows Gold Gloves row'`
- `'shows Silver Sluggers row'`
- `'shows World Series Rings row'`

`describe('Player Comparison – career achievements stat values @regression')`:

- `'All-Star Selections row shows correct values (5 and 4)'` — Judge=5, Ohtani=4
- `'MVP Awards row shows correct values (2 and 2)'` — both players at 2
- `'Silver Sluggers row shows correct values (3 and 2)'` — Judge=3, Ohtani=2
- `'World Series Rings row shows correct values (1 and 0)'` — Judge=1, Ohtani=0
- `'Cy Young Awards row shows correct values (0 and 0)'`
- `'Gold Gloves row shows correct values (0 and 0)'`

`describe('Player Comparison – career achievements BEST indicator @regression')`:

- `'All-Star Selections: BEST indicator shown for the leader'` — Judge=5 beats Ohtani=4
- `'Silver Sluggers: BEST indicator shown for the leader'` — Judge=3 beats Ohtani=2
- `'World Series Rings: BEST indicator shown for the leader'` — Judge=1 beats Ohtani=0
- `'MVP Awards: no BEST indicator when tied (2 vs 2)'`
- `'Cy Young Awards: no BEST indicator when tied (0 vs 0)'`
- `'Gold Gloves: no BEST indicator when tied (0 vs 0)'`

`describe('Player Comparison – career achievements three-player comparison @regression')`:

- `'All-Star Selections: BEST shown for Betts (6 > 5, 4)'`
- `'Gold Gloves: BEST shown for Betts (5 > 0, 0)'`
- `'Silver Sluggers: BEST shown for Betts (4 > 3, 2)'`
- `'World Series Rings: BEST shown for Betts (2 > 1, 0)'`
- `'MVP Awards: no BEST when top two are tied (Judge=2, Ohtani=2)'`

## Related

- **Epic:** LS-5286 — QA — Page: Player Comparison
- **Component:** `lib/shared-components/src/features/players/PlayerComparison.tsx`
- **Comparison page:** `apps/web/src/pages/players/PlayerComparisonPage.tsx`
- **Base E2E tests:** `apps/web-e2e/src/tests/player-comparison.spec.ts`
- **Stats/charts E2E tests:** `apps/web-e2e/src/tests/player-comparison-stats-charts.spec.ts`
