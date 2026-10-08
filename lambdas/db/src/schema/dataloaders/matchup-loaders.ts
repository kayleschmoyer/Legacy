/**
 * Matchup DataLoaders — matchup players, matchups, games, messages, seasons, playoffs
 */

import DataLoader from 'dataloader';
import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';
import {
  type GenericDatabase,
  getLatestScoringChangeAtByLeague,
  getScoringChangeLogByLeague,
  getSelectedGamesCountBatch,
  PublicSchema,
  type ScoringChangeLogEntry,
  withPoolTimeoutRetry,
} from '@legacy-sports/db-client';
import { type FootballScoringSettings } from '@legacy-sports/scoring';
import { getFootballScoringSettingsForLeague } from '@legacy-sports/scoring/server';
import { withTransientRetry } from '../leagues/delete-resilience';
import {
  type FootballSeasonToDateShape,
  loadFootballSeasonToDate,
} from '../matchups/football-season-to-date';

/**
 * DataLoader for locked team members by leagueId (LS-5955).
 *
 * Key: leagueId (number)
 * Returns: Set of "playerId:teamId" strings that are locked in the league's
 *   active matchup week — i.e. every roster member of a team whose matchup
 *   is no longer `scheduled` (`in_progress` or `completed`).
 *
 * This must stay aligned with the mutation-time authority,
 * `checkPlayersNotLocked` (authorization.ts): both key off matchup status
 * rather than `matchupPlayerGames` existence. The two used to disagree —
 * this loader locked on stats-row existence while the mutation locked on
 * matchup status — so a matchup could flip to `in_progress` before its
 * first stats row landed, leaving the client's `isLocked` field (and the
 * UI it disables) stale for that window while the server already rejected
 * the swap (LS-9405, LS-9351).
 *
 * Batches all leagueIds in a single request into four queries — one for
 * current-week resolution, one for legacy matchup FK fallback, one for
 * started matchups, and one for the actual roster member lock check —
 * instead of N×4 queries (one set per TeamMember).
 */
export const createLockedTeamMembersLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<number, Set<string>>(async (keys) => {
    const leagueIds = [...new Set(keys)] as number[];

    // Step 1: Resolve current week for each league.
    const leagueRows = await db
      .select({
        id: PublicSchema.leagues.id,
        currentWeek: PublicSchema.leagues.currentWeek,
        currentMatchup: PublicSchema.leagues.currentMatchup,
      })
      .from(PublicSchema.leagues)
      .where(inArray(PublicSchema.leagues.id, leagueIds));

    // Step 2: For leagues whose currentWeek is null, fall back to the legacy
    //   currentMatchup FK to resolve the week number.
    const legacyMatchupIds = leagueRows
      .filter((l) => l.currentWeek == null && l.currentMatchup != null)
      .map((l) => l.currentMatchup as number);

    const matchupWeekMap = new Map<number, number>();
    if (legacyMatchupIds.length > 0) {
      const matchupRows = await db
        .select({
          id: PublicSchema.matchups.id,
          weekNumber: PublicSchema.matchups.weekNumber,
        })
        .from(PublicSchema.matchups)
        .where(inArray(PublicSchema.matchups.id, legacyMatchupIds));
      for (const m of matchupRows) {
        if (m.weekNumber != null) matchupWeekMap.set(m.id, m.weekNumber);
      }
    }

    // Build (leagueId → weekNumber) map, skipping leagues with no active week.
    const leagueWeekMap = new Map<number, number>();
    for (const l of leagueRows) {
      const week =
        l.currentWeek ??
        (l.currentMatchup != null
          ? (matchupWeekMap.get(l.currentMatchup) ?? null)
          : null);
      if (week != null) leagueWeekMap.set(l.id, week);
    }

    // Step 3: Find every team whose matchup has started (status !== 'scheduled')
    //   for its league's active week, then lock every roster member of those
    //   teams — the same authoritative signal `checkPlayersNotLocked` enforces.
    const lockedSets = new Map<number, Set<string>>();
    for (const leagueId of leagueIds) {
      lockedSets.set(leagueId, new Set<string>());
    }

    const activeLeagues = [...leagueWeekMap.entries()];
    if (activeLeagues.length > 0) {
      const orClauses = activeLeagues.map(([leagueId, weekNumber]) =>
        and(
          eq(PublicSchema.matchups.leagueId, leagueId),
          eq(PublicSchema.matchups.weekNumber, weekNumber),
        ),
      );

      const startedMatchups = await db
        .select({
          leagueId: PublicSchema.matchups.leagueId,
          team1Id: PublicSchema.matchups.team1Id,
          team2Id: PublicSchema.matchups.team2Id,
        })
        .from(PublicSchema.matchups)
        .where(
          and(or(...orClauses), ne(PublicSchema.matchups.status, 'scheduled')),
        );

      const lockedTeamIdsByLeague = new Map<number, Set<number>>();
      for (const m of startedMatchups) {
        if (m.leagueId == null) continue;
        const teamIds =
          lockedTeamIdsByLeague.get(m.leagueId) ?? new Set<number>();
        if (m.team1Id != null) teamIds.add(m.team1Id);
        if (m.team2Id != null) teamIds.add(m.team2Id);
        lockedTeamIdsByLeague.set(m.leagueId, teamIds);
      }

      const allLockedTeamIds = [
        ...new Set([...lockedTeamIdsByLeague.values()].flatMap((s) => [...s])),
      ];

      if (allLockedTeamIds.length > 0) {
        const memberRows = await db
          .select({
            teamId: PublicSchema.teamMembers.teamId,
            playerId: PublicSchema.teamMembers.playerId,
          })
          .from(PublicSchema.teamMembers)
          .where(inArray(PublicSchema.teamMembers.teamId, allLockedTeamIds));

        for (const [leagueId, teamIds] of lockedTeamIdsByLeague) {
          const lockedSet = lockedSets.get(leagueId);
          if (!lockedSet) continue;
          for (const row of memberRows) {
            if (row.teamId != null && teamIds.has(row.teamId)) {
              lockedSet.add(`${row.playerId}:${row.teamId}`);
            }
          }
        }
      }
    }

    return keys.map(
      (leagueId) => lockedSets.get(leagueId) ?? new Set<string>(),
    );
  });

/**
 * DataLoader for matchup player games
 * Key: matchupPlayerId (number)
 * Returns: Array of games for that matchup player
 *
 * Wrapped in withTransientRetry (LS-8477): this batch query fires alongside
 * every other per-request DataLoader against a 3-connection Lambda pool, so a
 * burst of concurrent nested-field resolution can transiently exhaust it
 * (`timeout exceeded when trying to connect`) even though each loader itself
 * issues a single batched query.
 */
export const createMatchupPlayerGamesLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<
    number,
    Array<typeof PublicSchema.matchupPlayerGames.$inferSelect>
  >(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const allGames = await withTransientRetry(() =>
      db
        .select()
        .from(PublicSchema.matchupPlayerGames)
        .where(inArray(PublicSchema.matchupPlayerGames.matchupPlayerId, ids)),
    );

    const gamesMap = new Map<
      number,
      Array<typeof PublicSchema.matchupPlayerGames.$inferSelect>
    >();
    for (const game of allGames) {
      let arr = gamesMap.get(game.matchupPlayerId);
      if (!arr) {
        arr = [];
        gamesMap.set(game.matchupPlayerId, arr);
      }
      arr.push(game);
    }

    return keys.map((key) => gamesMap.get(key) ?? []);
  });

/**
 * DataLoader for matchup players (resolves matchupPlayerId → { playerId, matchupId })
 * Used by MatchupPlayerGame resolvers to avoid per-item MP lookups.
 * Key: matchupPlayerId (number)
 */
export const createMatchupPlayersLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<number, { playerId: number; matchupId: number } | null>(
    async (keys) => {
      const ids = [...new Set(keys)] as number[];
      const rows = await db
        .select({
          id: PublicSchema.matchupPlayers.id,
          playerId: PublicSchema.matchupPlayers.playerId,
          matchupId: PublicSchema.matchupPlayers.matchupId,
        })
        .from(PublicSchema.matchupPlayers)
        .where(inArray(PublicSchema.matchupPlayers.id, ids));

      const mpMap = new Map<number, { playerId: number; matchupId: number }>();
      for (const row of rows) {
        mpMap.set(row.id, {
          playerId: row.playerId,
          matchupId: row.matchupId,
        });
      }
      return keys.map((key) => mpMap.get(key) ?? null);
    },
  );

/**
 * DataLoader for matchups (resolves matchupId → { leagueId, weekNumber })
 * Used by MatchupPlayerGame resolvers to avoid per-item matchup lookups.
 * Key: matchupId (number)
 */
export const createMatchupsLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<
    number,
    {
      leagueId: number;
      weekNumber: number;
      gamesPerMatchup: number | null;
      pitcherStartsPerMatchup: number | null;
    } | null
  >(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const rows = await db
      .select({
        id: PublicSchema.matchups.id,
        leagueId: PublicSchema.matchups.leagueId,
        weekNumber: PublicSchema.matchups.weekNumber,
        gamesPerMatchup: PublicSchema.matchups.gamesPerMatchup,
        pitcherStartsPerMatchup: PublicSchema.matchups.pitcherStartsPerMatchup,
      })
      .from(PublicSchema.matchups)
      .where(inArray(PublicSchema.matchups.id, ids));

    const mMap = new Map<
      number,
      {
        leagueId: number;
        weekNumber: number;
        gamesPerMatchup: number | null;
        pitcherStartsPerMatchup: number | null;
      }
    >();
    for (const row of rows) {
      mMap.set(row.id, {
        leagueId: row.leagueId,
        weekNumber: row.weekNumber,
        gamesPerMatchup: row.gamesPerMatchup,
        pitcherStartsPerMatchup: row.pitcherStartsPerMatchup,
      });
    }
    return keys.map((key) => mMap.get(key) ?? null);
  });

/**
 * DataLoader for league-week-player seasons
 * Key: "leagueId-weekNumber-playerId"
 * Returns: season number or null
 */
export const createLeagueWeekPlayerSeasonsLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<string, number | null>(async (keys) => {
    const lookups = keys.map((key) => {
      const [leagueId, weekNumber, playerId] = key.split('-').map(Number);
      return { leagueId, weekNumber, playerId };
    });

    // Deduplicate (leagueId, weekNumber) pairs and fetch all player seasons in
    // a single query. We OR-together per-pair AND clauses rather than using
    // PostgreSQL's tuple-IN syntax (`(col_a, col_b) IN (VALUES (a, b))`) — that
    // syntax fails inside node-postgres prepared statements when the VALUES
    // list contains parameters, because pg can't infer column types from
    // unanchored bind parameters and rejects the comparison. The OR pattern is
    // a single round-trip and still lets PostgreSQL use the composite index on
    // (league_id, week_number).
    const pairs = [
      ...new Map(
        lookups.map((l) => [
          `${l.leagueId}-${l.weekNumber}`,
          { leagueId: l.leagueId, weekNumber: l.weekNumber },
        ]),
      ).values(),
    ];
    // Wrapped in withPoolTimeoutRetry (LS-10258): one batched query, but it
    // fires alongside every other per-request loader against the small Lambda
    // pool, so a burst can outwait connectionTimeoutMillis (Rollbar #289).
    const allRows = pairs.length
      ? await withPoolTimeoutRetry(() =>
          db
            .select({
              leagueId: PublicSchema.leagueWeekPlayerSeasons.leagueId,
              weekNumber: PublicSchema.leagueWeekPlayerSeasons.weekNumber,
              playerId: PublicSchema.leagueWeekPlayerSeasons.playerId,
              season: PublicSchema.leagueWeekPlayerSeasons.season,
            })
            .from(PublicSchema.leagueWeekPlayerSeasons)
            .where(
              or(
                ...pairs.map(({ leagueId, weekNumber }) =>
                  and(
                    eq(PublicSchema.leagueWeekPlayerSeasons.leagueId, leagueId),
                    eq(
                      PublicSchema.leagueWeekPlayerSeasons.weekNumber,
                      weekNumber,
                    ),
                  ),
                ),
              ),
            ),
        )
      : [];

    const seasonMap = new Map<string, number>();
    for (const row of allRows) {
      seasonMap.set(
        `${row.leagueId}-${row.weekNumber}-${row.playerId}`,
        row.season,
      );
    }

    return keys.map((key) => seasonMap.get(key) ?? null);
  });

/**
 * DataLoader for selectedGamesCount per matchup
 * Key: matchupId (number)
 * Returns: the minimum per-player count of resolved game slots — the same
 * definition the autoAdvanceMatchups / autoSelectGames gates use
 * (getSelectedGamesCountBatch). A matchup-wide COUNT(DISTINCT game_num)
 * reported "1 of 1" as soon as any one player had a row, so Next Step
 * enabled Advance League Week while the backend gate still saw 0 resolved
 * slots and skipped the league (LS-10795).
 */
export const createSelectedGamesCountLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<number, number>(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    // Wrapped in withPoolTimeoutRetry (LS-8478 pattern): this loader is on
    // the same Matchup.winProbability fan-out path as the other loaders hit
    // by the LS-10037 cluster. See LS-10043.
    const countMap = await withPoolTimeoutRetry(() =>
      getSelectedGamesCountBatch(db, ids),
    );
    return keys.map((key) => countMap.get(key) ?? 0);
  });

/**
 * DataLoader for matchup messages
 * Key: messageId (number)
 * Returns: matchup message record (for replyToMessage lookups)
 */
export const createMatchupMessagesLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<
    number,
    | (typeof PublicSchema.matchupMessages.$inferSelect & {
        metadata: Record<string, unknown>;
      })
    | null
  >(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const rows = await db
      .select()
      .from(PublicSchema.matchupMessages)
      .where(inArray(PublicSchema.matchupMessages.id, ids));

    const messagesMap = new Map<
      number,
      typeof PublicSchema.matchupMessages.$inferSelect & {
        metadata: Record<string, unknown>;
      }
    >();
    for (const row of rows) {
      messagesMap.set(row.id, {
        ...row,
        metadata: row.metadata as Record<string, unknown>,
      });
    }
    return keys.map((key) => messagesMap.get(key) ?? null);
  });

/**
 * DataLoader for a league's football scoring settings (LS-6385).
 * Key: leagueId (number)
 * Returns: FootballScoringSettings, merged from the league's active scoring
 *   profile via getFootballScoringSettingsForLeague.
 *
 * Every player row in a given matchup roster shares the same leagueId, so
 * batching collapses what would otherwise be one profile lookup per player
 * into a single settings resolution per league.
 *
 * A league missing its scoring profile (LS-6395) throws
 * `MissingScoringProfileError` rather than silently defaulting — caught here
 * per-key so one bad league in a batch fails only its own `.load(leagueId)`
 * callers instead of poisoning every other league resolved in the same tick.
 */
export const createFootballScoringSettingsLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<number, FootballScoringSettings>(async (keys) => {
    const leagueIds = [...new Set(keys)] as number[];
    const settingsByLeagueId = new Map<number, FootballScoringSettings | Error>(
      await Promise.all(
        leagueIds.map(async (leagueId) => {
          try {
            return [
              leagueId,
              await getFootballScoringSettingsForLeague(db, leagueId),
            ] as const;
          } catch (err) {
            return [leagueId, err as Error] as const;
          }
        }),
      ),
    );
    return keys.map(
      (key) =>
        settingsByLeagueId.get(key) ??
        new Error(`No scoring settings resolved for league ${key}`),
    );
  });

/**
 * DataLoader for football season-to-date totals (LS-10823).
 * Key: `${leagueId}:${weekNum}` (string)
 * Returns: season-to-date totals by player id for every player who started
 *   in that league across weeks 1..weekNum.
 *
 * Every `FootballMatchupPlayer.seasonToDate` in one `matchupScores` response
 * shares the same key, so the field runs one league-wide aggregation per
 * request instead of one per player, and only when a client selects it.
 * Failures are caught per key, as in `createFootballScoringSettingsLoader`.
 */
export const createFootballSeasonToDateLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<string, Map<number, FootballSeasonToDateShape>>(async (keys) =>
    Promise.all(
      keys.map(async (key) => {
        const [leagueId, weekNum] = key.split(':').map(Number);
        try {
          return await loadFootballSeasonToDate(db, leagueId, weekNum);
        } catch (err) {
          return err as Error;
        }
      }),
    ),
  );

/**
 * DataLoader for playoff matchups by bracket
 * Key: bracketId (number)
 * Returns: Array of playoff matchups for that bracket (sorted by round, matchupNumber)
 */
export const createPlayoffMatchupsByBracketLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<
    number,
    Array<typeof PublicSchema.playoffMatchups.$inferSelect>
  >(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const rows = await db
      .select()
      .from(PublicSchema.playoffMatchups)
      .where(inArray(PublicSchema.playoffMatchups.bracketId, ids))
      .orderBy(
        sql`${PublicSchema.playoffMatchups.bracketId}`,
        sql`${PublicSchema.playoffMatchups.round}`,
        sql`${PublicSchema.playoffMatchups.matchupNumber}`,
      );

    const matchupsMap = new Map<
      number,
      Array<typeof PublicSchema.playoffMatchups.$inferSelect>
    >();
    for (const row of rows) {
      let arr = matchupsMap.get(row.bracketId);
      if (!arr) {
        arr = [];
        matchupsMap.set(row.bracketId, arr);
      }
      arr.push(row);
    }

    return keys.map((key) => matchupsMap.get(key) ?? []);
  });

/**
 * DataLoader for the latest scoring-settings change per league (LS-9665).
 *
 * Key: leagueId (number)
 * Returns: the most recent `league_scoring_change_log.changed_at` for the
 *   league's active scoring profile, or null if its scoring has never changed.
 *
 * Backs `Matchup.scoringIsStale`. Keyed by league rather than by matchup so a
 * week of matchups — or a whole season page — costs one query for the leagues
 * involved instead of one per matchup.
 */
export const createLatestScoringChangeAtLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<number, Date | null>(async (keys) => {
    const leagueIds = [...new Set(keys)] as number[];
    // Wrapped in withPoolTimeoutRetry (LS-10258): same Matchup fan-out as the
    // other loaders, and the one query here was the Rollbar #274 failure site.
    const changeAtByLeague = await withPoolTimeoutRetry(() =>
      getLatestScoringChangeAtByLeague(db, leagueIds),
    );
    return keys.map((key) => changeAtByLeague.get(key) ?? null);
  });

/**
 * DataLoader for a league's scoring change history (LS-9667).
 *
 * Key: leagueId (number)
 * Returns: the league's `league_scoring_change_log` rows (active profile
 *   only, newest first), joined out to display-ready fields.
 *
 * Backs `Matchup.scoringChangeLog` — the "what changed and when" interaction
 * on the stale-scoring indicator. Keyed by league, same batching rationale as
 * `createLatestScoringChangeAtLoader` above; the resolver filters the
 * league's list down to entries relevant to one matchup's `scoredAt`.
 */
export const createScoringChangeLogLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<number, ScoringChangeLogEntry[]>(async (keys) => {
    const leagueIds = [...new Set(keys)] as number[];
    // LS-10258: sibling of createLatestScoringChangeAtLoader on the same path.
    const changeLogByLeague = await withPoolTimeoutRetry(() =>
      getScoringChangeLogByLeague(db, leagueIds),
    );
    return keys.map((key) => changeLogByLeague.get(key) ?? []);
  });

/**
 * DataLoader for every matchup_players row of a matchup (LS-10307).
 *
 * Key: matchupId (number)
 * Returns: all matchup_players rows for that matchup (starters and bench).
 *
 * `Matchup.winProbability` used to run one direct `matchup_players` select
 * per matchup, so resolving it across a league (GetMatchupsForLeague) issued
 * one query per matchup against the Lambda's small connection pool. Batching
 * by matchupId collapses that to a single `IN (...)` query per request.
 */
export const createMatchupPlayersByMatchupIdLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<
    number,
    Array<typeof PublicSchema.matchupPlayers.$inferSelect>
  >(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const rows = await withPoolTimeoutRetry(() =>
      db
        .select()
        .from(PublicSchema.matchupPlayers)
        .where(inArray(PublicSchema.matchupPlayers.matchupId, ids)),
    );

    const byMatchup = new Map<
      number,
      Array<typeof PublicSchema.matchupPlayers.$inferSelect>
    >();
    for (const row of rows) {
      const list = byMatchup.get(row.matchupId);
      if (list) list.push(row);
      else byMatchup.set(row.matchupId, [row]);
    }
    return keys.map((key) => byMatchup.get(key) ?? []);
  });

/** Per-league inputs to `computeRosterLockTime` (LS-10307). */
export interface LeagueRosterLockInputs {
  rosterLockTiming: string;
  lockRules: {
    customLockTime: string | null;
    lockHoursBeforeMatchup: number | null;
  } | null;
}

/**
 * DataLoader for a league's roster-lock inputs (LS-10307).
 *
 * Key: leagueId (number)
 * Returns: the league's `rosterLockTiming` plus its `roster_lock_rules` row,
 *   or null when the league does not exist.
 *
 * `Matchup.lockTime` used to select both per matchup — identical rows for
 * every matchup in a league — which, alongside `Matchup.winProbability`,
 * exhausted the pool on league-wide matchup queries (25s+ invocations in
 * nightly runs 36342761127 / 36899444053). One batch per request instead.
 */
export const createLeagueRosterLockInputsLoader = (
  db: GenericDatabase<typeof PublicSchema>,
) =>
  new DataLoader<number, LeagueRosterLockInputs | null>(async (keys) => {
    const ids = [...new Set(keys)] as number[];
    const [leagues, rules] = await Promise.all([
      withPoolTimeoutRetry(() =>
        db
          .select({
            id: PublicSchema.leagues.id,
            rosterLockTiming: PublicSchema.leagues.rosterLockTiming,
          })
          .from(PublicSchema.leagues)
          .where(inArray(PublicSchema.leagues.id, ids)),
      ),
      withPoolTimeoutRetry(() =>
        db
          .select({
            leagueId: PublicSchema.rosterLockRules.leagueId,
            customLockTime: PublicSchema.rosterLockRules.customLockTime,
            lockHoursBeforeMatchup:
              PublicSchema.rosterLockRules.lockHoursBeforeMatchup,
          })
          .from(PublicSchema.rosterLockRules)
          .where(inArray(PublicSchema.rosterLockRules.leagueId, ids)),
      ),
    ]);

    // First rule row per league wins, matching the previous `.limit(1)` read.
    const rulesByLeague = new Map<
      number,
      LeagueRosterLockInputs['lockRules']
    >();
    for (const rule of rules) {
      if (!rulesByLeague.has(rule.leagueId)) {
        rulesByLeague.set(rule.leagueId, {
          customLockTime: rule.customLockTime,
          lockHoursBeforeMatchup: rule.lockHoursBeforeMatchup,
        });
      }
    }

    const byLeague = new Map<number, LeagueRosterLockInputs>();
    for (const league of leagues) {
      byLeague.set(league.id, {
        rosterLockTiming: league.rosterLockTiming,
        lockRules: rulesByLeague.get(league.id) ?? null,
      });
    }
    return keys.map((key) => byLeague.get(key) ?? null);
  });
