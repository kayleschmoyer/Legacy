# Feature: Roster & Schedule Section

**Jira:** LS-5371
**Page:** `create-league-baseball` (Epic LS-5262)
**Platforms:** web, mobile-web, android
**Entitlement:** `all`

## Description

Collapsed-by-default section (`id="roster-schedule"`) on the Create League — Baseball
form that governs how the season schedule is generated and what a team's roster
looks like:

- **Scheduling Strategy** — `Divisional` / `Round Robin` / `Random` (`schedulingStrategy`)
- **Max Roster Size** — button group of preset sizes (baseball: `20`–`40`, validated
  range `15`–`50`) with a "Legacy Sports standard" hint (`maxRosterSize`)
- **Player Pool** — `All MLB` / `National League` / `American League` (`playerPool`)
- **Games Per Matchup** — numeric input, sport-specific max (`gamesPerMatchup`)

The section's collapsed summary line reflects the current scheduling strategy,
roster size, and player pool selections. All four fields are free (`all`
entitlement) — none require a premium upgrade.

## Source

Extracted from: `docs/agents/pages/baseball/league/create.md`

## Implementation

**File:** `apps/web/src/pages/baseball/LeagueCreatePage.tsx`

| Concern                     | Reference                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| Section render              | `<CollapsibleSection id="roster-schedule" ...>` (~L1674)                                                 |
| Scheduling strategy options | `SCHEDULING_STRATEGY_OPTIONS` (~L226)                                                                    |
| Roster size range + presets | `ROSTER_RANGE_BY_SPORT`, `ROSTER_SIZE_OPTIONS_BY_SPORT` (~L196)                                          |
| Player pool options         | `PLAYER_POOL_OPTIONS_BY_SPORT`                                                                           |
| Validation                  | roster size clamped to `ROSTER_RANGE_BY_SPORT[sport]` (~L329)                                            |
| Mutation input              | `schedulingStrategy`, `playerPool`, `maxRosterSize` passed to `useCreateLeagueAndTeamsMutation` (~L1209) |

## Test Coverage

### E2E tests (hermetic)

**`apps/web-e2e/src/tests/league-creation-advanced.spec.ts`**

`describe('League Creation — Advanced Settings @regression')`:

- Roster Size:
  - Displays all preset roster sizes + hint text
  - Selecting a roster size (`30`) and submitting creates the league
- Player Pool:
  - Displays All MLB / National League / American League options + hint text
  - Selecting National League and submitting creates the league
- Scheduling Strategy:
  - Displays Divisional / Round Robin / Random options + hint text
  - Selecting Round Robin and submitting creates the league (LS-5371)

## Related

- **Epic:** LS-5262 — QA — Page: Create League — Baseball
- **Page doc:** `docs/agents/pages/baseball/league/create.md`
- **Form:** `apps/web/src/pages/baseball/LeagueCreatePage.tsx`
