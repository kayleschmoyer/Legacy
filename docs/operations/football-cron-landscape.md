# Football Cron Landscape

This document describes all scheduled EventBridge jobs that run football-specific work, their season windows, and how to reason about them operationally.

## Season Window Constants

NFL season dates are defined in [`lib/utils/src/lib/season-constants.ts`](../../lib/utils/src/lib/season-constants.ts):

| Constant                 | Value | Meaning                               |
| ------------------------ | ----- | ------------------------------------- |
| `NFL_SEASON_START_MONTH` | 9     | September — regular season kickoff    |
| `NFL_SEASON_START_DAY`   | 1     | September 1                           |
| `NFL_SEASON_END_MONTH`   | 2     | February — post-Super Bowl            |
| `NFL_SEASON_END_DAY`     | 15    | February 15 (buffer after Super Bowl) |

The helper `isNflSeason(date?)` returns `true` when the given date falls within this window. **Update these constants at the start of each season** if the NFL schedule shifts (e.g. an expanded playoff format pushes the Super Bowl later).

## Scheduled Jobs

### `football-weekly-season-refresh`

| Field            | Value                                      |
| ---------------- | ------------------------------------------ |
| EventBridge rule | `${env}-football-weekly-season-refresh`    |
| Schedule         | Every Tuesday at 07:00 UTC (2am EST)       |
| Target mutation  | `refreshFootballWeeklySeasonStats`         |
| Season-aware     | Yes — lambda-side guard (`isNflSeason()`)  |
| Depends on       | LS-253 (football handlers in stats-lambda) |

**Purpose:** Pulls the latest PFR (Pro Football Reference) season-totals for players on active football leagues after all box scores for the week are final (Tuesday morning, after Monday Night Football).

**Out-of-season behavior:** The EventBridge rule fires year-round, but `refreshFootballWeeklySeasonStats` checks `isNflSeason()` at invocation time. Outside the window (February 16 – August 31) the mutation returns `{ triggered: false, reason: "Outside NFL season window (Sept 1 – Feb 15)" }` and logs a single INFO line. Cost is negligible (~$0.04/month for the invocations).

**Implementation status:** The stats-lambda football handler is gated on LS-253. Until that ships, the mutation returns `triggered: false` with a "not yet implemented" reason even during the season window.

**Manual trigger:**

```graphql
mutation {
  refreshFootballWeeklySeasonStats {
    triggered
    reason
    errors
  }
}
```

---

### `football-career-refresh`

| Field            | Value                                      |
| ---------------- | ------------------------------------------ |
| EventBridge rule | `${env}-football-career-refresh`           |
| Schedule         | March 1 at 06:00 UTC (once per year)       |
| Target mutation  | `refreshFootballCareerStats`               |
| Season-aware     | N/A — March 1 is always post-Super Bowl    |
| Depends on       | LS-253 (football handlers in stats-lambda) |

**Purpose:** Refreshes PFR career stats for all football players after the NFL season has fully concluded. March 1 is chosen because it is always after the Super Bowl and gives the PFR database time to finalize season aggregates.

**Out-of-season behavior:** No lambda-side guard is needed — the rule fires once per year on a date that is definitionally outside the active season.

**Implementation status:** The stats-lambda football handler is gated on LS-253. Until that ships, the mutation returns `triggered: false` with a "not yet implemented" reason.

**Manual trigger:**

```graphql
mutation {
  refreshFootballCareerStats {
    triggered
    reason
    errors
  }
}
```

---

## Existing Year-Round Rules That Touch Football

The following rules fire year-round and are sport-agnostic at the EventBridge level. When football leagues become active these rules will naturally apply to them:

| Rule                       | Schedule           | Notes                                                                                 |
| -------------------------- | ------------------ | ------------------------------------------------------------------------------------- |
| `auto-select-games`        | Daily midnight EST | Sport-routed in the consuming lambda; football no-op until game selection is wired up |
| `auto-advance-matchups`    | Sundays 3am EST    | Sport-agnostic; advances any league with all games complete                           |
| `process-waiver-claims`    | Daily 2am EST      | Sport-agnostic                                                                        |
| `discord-score-alerts`     | Every 4 hours      | Short-circuits when no active matchups with webhooks                                  |
| `discord-lineup-reminders` | Hourly             | Short-circuits when no upcoming locks                                                 |
| `discord-weekly-recaps`    | Sundays 10am EST   | Short-circuits when no leagues with webhooks                                          |

## Updating Season Dates Annually

1. Open [`lib/utils/src/lib/season-constants.ts`](../../lib/utils/src/lib/season-constants.ts).
2. Update `NFL_SEASON_END_DAY`/`NFL_SEASON_END_MONTH` if the Super Bowl date shifts.
3. Run `make pc` to ensure typecheck and tests pass.
4. Open a PR — no Terraform changes are needed (the EventBridge rules are date-agnostic; the guard lives in the lambda).
