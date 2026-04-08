# Commissioner Matchup Management

**Audience**: League commissioners and admins
**Last Updated**: April 7, 2026

This guide is for commissioners running a league with the matchup system.
It covers the lifecycle of a season's matchups, the controls you have for
schedule, scoring, lineups, playoffs, and tiebreakers, and how to recover
when something goes wrong. For team-owner-facing content see
[Matchup System Guide](matchup-system-guide.md).

---

## Lifecycle at a glance

```
Draft completes
   └─► Generate schedule (createAllMatchups)
         └─► Weekly: lineups → games selected → stats loaded → scores totalled
               └─► autoAdvanceMatchups closes the week, opens the next
                     └─► End of regular season: playoff bracket created
                           └─► Champion crowned, trophy recorded
```

You can manage every step of this from the **Commissioner Tools** panel
on the league page. The panel is rendered by
`apps/web/src/pages/baseball/LeagueDetailPage.tsx` and the week-advancement
control itself lives in
`apps/web/src/features/commissioner/NextStepControl.tsx` (alongside other
commissioner controls under `apps/web/src/features/commissioner/` and
`apps/web/src/components/commissioner/`). Each step is also driven by the
GraphQL mutations listed in [Matchup API](../api/matchup-api.md).

---

## Generating the season schedule

The full season schedule is **generated automatically** when your league
draft completes. You usually don't need to click anything in the
Commissioner Tools UI for that full-season generation step:
`createAllMatchupsForLeague` is triggered by the backend draft/setup
flows described below. However, `NextStepControl` does more than just
week advancement: the UI can also trigger game selection
(`autoSelectGames`), initialize draft-related progression, and create or
open week 1 after a completed draft when no matchups exist (via the
`createWeek1` path, which may call `autoAdvanceMatchups`).

The schedule is created via `createAllMatchupsForLeague` from
`@legacy-sports/db-client`, which is invoked from several places in the
backend:

- **Live drafts** — `lambdas/draft-processor/src/index.ts` and
  `lambdas/db/src/schema/drafts/mutations/make-draft-pick.ts` trigger
  schedule generation as soon as the final pick is made.
- **Commissioner picks** — `commissioner-pick.ts` does the same when a
  commissioner finishes a draft on behalf of the league.
- **League mutations** — `lambdas/db/src/schema/leagues/mutations.ts`
  triggers it from league setup flows.
- **Manual / admin path** — the `createAllMatchups(leagueId: Int!)`
  GraphQL mutation can be called directly by an admin or by league
  users with commissioner access (`commissioner`, `general manager`,
  or `assistant manager`) and returns an `AdvanceLeagueWeekResponse`
  with the generated matchups and the new `currentMatchupId`. Use
  this when you need to recreate the schedule for a league that
  didn't get one automatically.

Whichever path runs, the system creates one matchup row per
(week, team1, team2), populates each matchup's roster snapshot, and
seeds the per-player season selections for the entire season.

Schedule configuration values come from the league record:

- `gamesPerMatchup` — number of game days per hitter per week.
- `spStartsPerMatchup` — number of starting pitcher starts allowed per
  week.
- `totalMatchups` — total regular-season weeks.

Adjust these on the league before generating; once matchups exist they are
locked into each row.

### Regenerating mid-season

If something goes wrong with the schedule (a team withdraws, a draft is
re-run, etc.), an admin can call
`adminRegenerateLeagueSchedule(leagueId: Int!)`. This is **admin-only** —
non-admin commissioners cannot trigger it. It regenerates future
`scheduled` matchups for the league rather than touching matchups that
are already `in_progress` or `completed`. **Future-week matchups and any
manual lineup presets on them will be regenerated and lost** — only do
this if you really mean it.

### Creating a one-off matchup

For ad-hoc / preseason / exhibition matchups use `createMatchup` with a
`CreateMatchupInput`:

```graphql
mutation {
  createMatchup(
    input: {
      leagueId: 12
      weekNumber: 1
      team1Id: 41
      team2Id: 42
      gamesPerMatchup: 5
      startTime: "2026-04-08T17:00:00Z"
      endTime: "2026-04-15T05:00:00Z"
    }
  ) {
    id
    status
  }
}
```

---

## Configuring scoring

Scoring is per-league, versioned, and audited. The relevant tables are
`league_scoring_profiles`, `league_scoring_profile_entries`, and
`league_scoring_change_log` — see
[Database Schema → Scoring System](../architecture/database-schema.md#scoring-system).

From the **League Scoring Editor** UI
(`apps/web/src/features/baseball/LeagueScoringEditor.tsx`):

1. Pick the active profile (every league has exactly one with
   `is_default = true`).
2. Adjust per-stat multipliers — HR, RBI, IP, K, etc. The catalog of
   stats lives in `scoring_stat_definitions`; you can only assign
   multipliers to defined stats.
3. Add a **change reason**. The reason is required and is recorded in
   `league_scoring_change_log` along with the previous and new
   multipliers, your user ID, and a timestamp.
4. Save. **The system recomputes all completed matchup scores** for the
   league against the new profile because per-game scores are not
   persisted — only the multipliers and the resulting team totals are.

> **Versioning**: you can keep multiple profiles per league (e.g., one
> for the regular season and one for playoffs) and flip the default
> between them. The change-log entries record the action so you can audit
> retroactively.

---

## Managing lineups and games

Most lineup management is done by the team owners themselves. As
commissioner you have two overrides:

- **Edit any team's lineup** — the same `updateMatchupPlayerPosition` /
  `swapMatchupPlayerPositions` mutations work for you on any team in
  your league.
- **Adjust per-day game selections** — you can manually override the
  games chosen by `autoSelectGames`. Use this when MLB schedule changes
  invalidate the auto-pick.

The `manually_edited` flag on `matchup_players` protects intentional
edits from being clobbered when team membership changes (e.g., trades or
roster moves). If you ever want to **force re-propagation**, you'll need
to clear that flag in the database — see the maintenance section below.

---

## Updating scores manually

> **Admin-only.** `updateMatchupScore` and `updateMatchupStatus` are
> guarded by `context.isSystemRequest || context.user.isAdmin` — a
> regular league commissioner without the platform admin role cannot
> call them. If you need a manual score correction and you're not an
> admin, ask one of the platform admins (or the on-call) to apply it
> for you, or use the SQL escape hatches in
> [Maintenance commands](#maintenance-commands).

If you do have admin, the mutation is:

```graphql
mutation {
  updateMatchupScore(matchupId: 1234, team1Score: 142.5, team2Score: 138.0) {
    id
    team1Score
    team2Score
  }
}
```

This bypasses the scoring engine and writes the values straight to the
matchup row. Use it sparingly — it's an escape hatch, not the main flow.

To force a status change (e.g., manually mark a stalled matchup
`completed`), use `updateMatchupStatus` (also admin-only). The status
enum is `scheduled | in_progress | completed | cancelled`.

---

## The weekly advancement job

Every week, an EventBridge cron triggers `autoAdvanceMatchups`
([`scheduled-mutations.ts:303`](../../lambdas/db/src/schema/matchups/scheduled-mutations.ts#L303)):

1. Marks the prior week's matchups `completed`.
2. Updates each league's `current_week`.
3. Triggers the Discord weekly recap.
4. Checks playoff entry conditions.
5. Resolves any tied matchups via the league's tiebreaker rules.

If you need to manually trigger this — for example, to advance a stalled
test league — call the mutation as an admin. In production it's wired up
to system auth so it can run unattended.

The nightly `autoSelectGames` job picks per-day games for each matchup
player and writes `matchup_player_games`. It runs even before the week
starts so users see selected games when they open lineups in the
morning.

---

## Playoffs

When the regular season ends, configure your bracket via the
`playoff-service` API:

```ts
PlayoffService.createBracket(db, {
  leagueId,
  season,
  format: '6-team', // '4-team' | '6-team' | '8-team'
  startWeek: 24,
  multiWeekMatchups: true,
});
```

This:

1. Creates a `playoff_brackets` row.
2. Snapshots the top N teams from current standings into `playoff_seeds`.
3. Generates `playoff_matchups` rows for every round.

For a 6-team bracket the rounds are:

- **Wildcards**: 3v6 and 4v5
- **Semifinals**: 1 vs winner(4v5), 2 vs winner(3v6)
- **Final**: winners of the semifinals

When the championship matchup completes, the winner is recorded in
`champion_trophies` (unique per `(league_id, season)`) — this becomes the
team's permanent trophy.

---

## Tiebreaker rules

Configure tiebreakers per league via the
**Tiebreaker Configuration UI** (LS-39). Each league has one
`tiebreaker_rules` row with up to three methods:

| Field                         | Value                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `primary_method`              | First method tried                                                              |
| `secondary_method`            | Used when primary doesn't break the tie                                         |
| `tertiary_method`             | Last resort                                                                     |
| `allow_commissioner_override` | If true, you can manually pick the winner                                       |
| `config`                      | JSONB for method-specific options (e.g., which category for `highest_category`) |

Available methods: `highest_category`, `total_season_points`,
`head_to_head_record`, `random`, `co_champion`.

Every resolution is logged in `tiebreaker_history` with the applied
method, whether it was a commissioner override, and the resulting winner.
This is your audit trail — never delete it.

### Manually overriding a tiebreaker

If `allow_commissioner_override = true`, you can resolve a tied matchup
yourself from the matchup detail page. The override is captured in
`tiebreaker_history` with `was_commissioner_override = true` and your
user ID, so the league can see exactly what happened.

---

## Chat moderation

Trash-talk lives in `matchup_messages`. As commissioner you can:

- **Pin messages** — for league-wide highlights.
- **Soft-delete messages** — they stay in the moderation log but are no
  longer rendered.
- **Block users** — at the **matchup**, **league**, or **global** scope,
  with optional expiration. League and matchup blocks are commissioner
  scope; global blocks require platform mods.
- **Resolve reports** — `matchup_message_reports.status` moves
  `pending → reviewing → resolved | dismissed`. Add notes when you
  resolve a report.

Profanity is auto-flagged; obvious spam can be auto-hidden, but you'll
still want to review the report queue weekly during the season.

---

## Troubleshooting

### A matchup is stuck in `loading` for hours

The stats lambda is async and retries with backoff. Check
`statsLoadingStatus` — if it's `failed` or `retry`, look at CloudWatch
logs for the stats lambda. Once stats arrive, the score is recomputed
and the matchup advances.

### A team's score looks wrong after I changed the scoring profile

This is expected — changing the profile recomputes from raw stats. If
the new value is _still_ wrong, the issue is in the underlying stat
data, not the multipliers. Use the change log
(`league_scoring_change_log`) to confirm what changed.

### A player's lineup edit got overwritten

Check `matchup_players.manually_edited`. If it's `false`, roster
propagation reset the row. The fix is to re-set the position in the
lineup editor (which sets `manually_edited = true` again) before the
next propagation runs.

### The week didn't advance automatically

Confirm the EventBridge `autoAdvanceMatchups` rule is enabled and check
the lambda's CloudWatch logs. As an admin you can manually call the
mutation from the GraphQL console to unstick the league.

### The Discord recap didn't post

Check that your league has a configured Discord webhook and that the
EventBridge `discord-weekly-recaps` rule fired for the week. Logs go to
the same lambda as the matchup mutations.

---

## Maintenance commands

When the UI doesn't cover something, here are the SQL escape hatches.
**Always run these against the `public` schema explicitly** — the
database has both `public` and `app_internal` schemas (see
[Database Schema](../architecture/database-schema.md#critical-database-query-guide)).

```sql
-- Force re-propagation of a player's lineup
UPDATE public.matchup_players
SET manually_edited = false
WHERE id = <matchup_player_id>;

-- Reset a stuck stats-loading status
UPDATE public.matchups
SET stats_loading_status = 'not_started'
WHERE id = <matchup_id>;

-- Mark a matchup completed (use sparingly)
UPDATE public.matchups
SET status = 'completed'
WHERE id = <matchup_id>;

-- Look up the most recent scoring profile change for a league
SELECT *
FROM public.league_scoring_change_log
WHERE league_id = <league_id>
ORDER BY changed_at DESC
LIMIT 10;
```

---

## See also

- [Matchup System Guide (members)](matchup-system-guide.md)
- [Matchup System Architecture](../architecture/matchup-system.md)
- [Matchup API Reference](../api/matchup-api.md)
- [Database Schema](../architecture/database-schema.md)
- [League Flow Complete Guide](league-flow-complete-guide.md)
