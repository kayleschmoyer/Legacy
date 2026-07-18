/**
 * Draft domain — query fields
 */

import {
  buildEligibilityConditions,
  PublicSchema,
} from '@legacy-sports/db-client';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { GraphQLError } from 'graphql';
import { LOGGER } from '@legacy-sports/logging';

import {
  countRecentMockDrafts,
  eligibleStatPositionsForUnfilledSlots,
  getCurrentDraftPickInfo,
  getUnfilledPositionTypes,
  MOCK_DRAFT_FREE_WEEKLY_LIMIT,
} from './helpers';
import {
  CurrentDraftPick,
  Draft,
  DraftPick,
  DraftPlayer,
  DraftQueueEntry,
  DraftRecommendation,
  DraftTeamAutoPickStatus,
  DraftTeamOrderEntry,
  MockDraftUsage,
} from './types';
import {
  describeDbError,
  formatDbError,
  withTransientRetry,
} from '../leagues/delete-resilience';
import {
  hasEntitlement,
  isCommissionerOrOwner,
  type LeagueMembership,
  requireEntitlement,
  verifyLeagueMembership,
} from '../authorization';
import { ENTITLEMENTS } from '../entitlements';
import { builder } from '../builder';
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from '../graphql-errors';

/**
 * Query: Get draft by ID
 */
builder.queryField('getDraft', (t) =>
  t.field({
    type: Draft,
    nullable: true,
    args: {
      draftId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const [draft] = await context.db
        .select()
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, args.draftId))
        .limit(1);

      if (!draft) return null;

      // Verify user is a member of the league that owns this draft
      await verifyLeagueMembership(context.db, draft.leagueId, context.user.id);

      return draft;
    },
  }),
);

/**
 * Query: Get draft for a league
 */
builder.queryField('getLeagueDraft', (t) =>
  t.field({
    type: Draft,
    nullable: true,
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      // Verify user is a member of this league
      await verifyLeagueMembership(context.db, args.leagueId, context.user.id);

      const [draft] = await context.db
        .select()
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.leagueId, args.leagueId))
        .orderBy(desc(PublicSchema.drafts.createdAt))
        .limit(1);

      return draft || null;
    },
  }),
);

/**
 * Query: Get current draft pick information
 */
builder.queryField('getCurrentDraftPick', (t) =>
  t.field({
    type: CurrentDraftPick,
    nullable: true,
    args: {
      draftId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      // Verify user is a member of the league owning this draft
      const [draft] = await context.db
        .select({ leagueId: PublicSchema.drafts.leagueId })
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, args.draftId))
        .limit(1);

      if (!draft) return null;

      await verifyLeagueMembership(context.db, draft.leagueId, context.user.id);

      return getCurrentDraftPickInfo(context.db, args.draftId);
    },
  }),
);

/**
 * Query: Get all picks for a draft
 */
builder.queryField('getDraftPicks', (t) =>
  t.field({
    type: [DraftPick],
    args: {
      draftId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { draftId } = args;
      const userId = context.user.id;

      try {
        // This query refetches after every pick event on the live draft
        // board, so it races the concurrent makeDraftPick write to
        // draft_picks. Wrap the reads in a bounded retry so a transient
        // Postgres failure (deadlock / serialization / lock-timeout)
        // recovers silently instead of surfacing a generic error toast to
        // drafting users (LS-8397, mirroring getDraftTeamAutoPickStatuses
        // from LS-8287).
        const [draft] = await withTransientRetry(
          () =>
            context.db
              .select({ leagueId: PublicSchema.drafts.leagueId })
              .from(PublicSchema.drafts)
              .where(eq(PublicSchema.drafts.id, draftId))
              .limit(1),
          {
            onRetry: (attempt, detail) =>
              LOGGER.warn('Retrying draft lookup after transient DB error', {
                draftId,
                attempt,
                dbError: formatDbError(detail),
              }),
          },
        );

        if (!draft) {
          throw UserInputError('Draft not found');
        }

        await verifyLeagueMembership(context.db, draft.leagueId, userId);

        const picks = await withTransientRetry(
          () =>
            context.db
              .select()
              .from(PublicSchema.draftPicks)
              .where(eq(PublicSchema.draftPicks.draftId, draftId))
              .orderBy(asc(PublicSchema.draftPicks.overallPick)),
          {
            onRetry: (attempt, detail) =>
              LOGGER.warn(
                'Retrying draft picks read after transient DB error',
                { draftId, attempt, dbError: formatDbError(detail) },
              ),
          },
        );

        return picks;
      } catch (error) {
        // Preserve typed client-facing errors (UNAUTHENTICATED / BAD_USER_INPUT
        // / FORBIDDEN) so the client still receives the intended code.
        if (error instanceof GraphQLError) {
          throw error;
        }
        // A DB failure that survived the bounded retry above (e.g. a
        // connection drop or statement timeout) would otherwise be masked
        // by the formatter as a generic "Internal server error", diagnosable
        // only via a manual CloudWatch hunt (LS-8397, mirroring LS-8287).
        // Log the real cause for Rollbar/CloudWatch and re-throw with a
        // stable, client-facing code carrying the SQLSTATE so the
        // browser-side Rollbar occurrence is self-diagnosing.
        const detail = describeDbError(error);
        const err = error instanceof Error ? error : new Error(String(error));
        LOGGER.error('Failed to load draft picks', err, {
          draftId,
          userId,
          dbError: formatDbError(detail),
        });
        throw new GraphQLError(
          detail.code
            ? `Failed to load draft picks (database error ${detail.code})`
            : 'Failed to load draft picks',
          { extensions: { code: 'DRAFT_PICKS_LOAD_FAILED' } },
        );
      }
    },
  }),
);

/**
 * Query: Get available (un-drafted) players for a draft
 * Returns all players not yet picked in this draft, optionally
 * filtered by a name search term. Respects the league's player pool setting.
 */
builder.queryField('getAvailableDraftPlayers', (t) =>
  t.field({
    type: [DraftPlayer],
    args: {
      draftId: t.arg.int({ required: true }),
      search: t.arg.string({ required: false }),
      position: t.arg.string({ required: false }),
      orderBy: t.arg.string({ required: false }),
      limit: t.arg.int({ required: false }),
      offset: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const {
        draftId,
        search,
        position,
        orderBy,
        limit: resultLimit,
        offset: resultOffset,
      } = args;

      // Verify draft exists and get league info for player pool filtering
      const [draft] = await context.db
        .select({ leagueId: PublicSchema.drafts.leagueId })
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, draftId))
        .limit(1);

      if (!draft) {
        throw UserInputError('Draft not found');
      }

      // Verify user is a member of this league (and capture the caller's team
      // so we can filter the board by their remaining roster requirements).
      // The explicit LeagueMembership annotation pins the contract to the
      // authorization helper (which returns the membership incl. teamId) so the
      // build fails if this is ever swapped for a void-returning namesake.
      const membership: LeagueMembership = await verifyLeagueMembership(
        context.db,
        draft.leagueId,
        context.user.id,
      );

      // Get league's player pool setting, career minimums, eligibility filters,
      // and matchup schedule
      const [league] = await context.db
        .select({
          sport: PublicSchema.leagues.sport,
          playerPool: PublicSchema.leagues.playerPool,
          minCareerGames: PublicSchema.leagues.minCareerGames,
          minCareerSeasons: PublicSchema.leagues.minCareerSeasons,
          gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
          pitcherStartsPerMatchup: PublicSchema.leagues.pitcherStartsPerMatchup,
          baseballHofOnly: PublicSchema.leagues.baseballHofOnly,
          baseballEraFilter: PublicSchema.leagues.baseballEraFilter,
          customEraStartYear: PublicSchema.leagues.customEraStartYear,
          customEraEndYear: PublicSchema.leagues.customEraEndYear,
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, draft.leagueId))
        .limit(1);

      // ---- Build raw SQL conditions (all reference table alias 'p') ----
      const sqlConditions: ReturnType<typeof sql>[] = [];

      // Exclude already-drafted players via NOT EXISTS (avoids growing literal list)
      sqlConditions.push(sql`NOT EXISTS (
        SELECT 1 FROM public.draft_picks dp
        WHERE dp.draft_id = ${draftId} AND dp.player_id = p.id
      )`);

      // Apply optional name filter
      if (search && search.trim().length > 0) {
        // Escape LIKE metacharacters (%, _, and \) to prevent wildcard injection
        // that could cause unexpected pattern matches or performance issues.
        const escaped = search
          .trim()
          .toLowerCase()
          .replace(/[%_\\]/g, '\\$&');
        const term = `%${escaped}%`;
        sqlConditions.push(
          sql`(LOWER(p.first_name || ' ' || p.last_name) LIKE ${term} ESCAPE '\\')`,
        );
      }

      // Apply optional position filter (server-side)
      if (position && position.trim().length > 0) {
        const pos = position.trim().toUpperCase();
        if (pos === 'P') {
          sqlConditions.push(
            sql`EXISTS (
              SELECT 1 FROM public.player_eligible_positions pep
              WHERE pep.player_id = p.id AND pep.position IN ('SP', 'RP')
            )`,
          );
        } else if (pos === 'OF') {
          sqlConditions.push(
            sql`EXISTS (
              SELECT 1 FROM public.player_eligible_positions pep
              WHERE pep.player_id = p.id AND pep.position IN ('LF', 'CF', 'RF')
            )`,
          );
        } else {
          sqlConditions.push(
            sql`EXISTS (
              SELECT 1 FROM public.player_eligible_positions pep
              WHERE pep.player_id = p.id AND pep.position = ${pos}
            )`,
          );
        }
      }

      // Apply the league's static eligibility predicates (player pool, career
      // games/seasons, Hall-of-Fame, era) via the SAME shared builder the pick
      // endpoints use (LS-8071). The board layers its undrafted/search/position
      // filters on top of this set, so it can only ever narrow the pool — never
      // show a player the pick endpoints would reject. Career minimums default
      // to 50 games / 3 seasons when the league has no explicit setting.
      const eligibilityConditions = buildEligibilityConditions({
        sport: league?.sport ?? 'baseball',
        playerPool: league?.playerPool ?? 'all',
        minCareerGames: league?.minCareerGames ?? 50,
        minCareerSeasons: league?.minCareerSeasons ?? 3,
        baseballHofOnly: league?.baseballHofOnly ?? false,
        baseballEraFilter: league?.baseballEraFilter ?? undefined,
        customEraStartYear: league?.customEraStartYear ?? null,
        customEraEndYear: league?.customEraEndYear ?? null,
      });
      for (const { condition } of eligibilityConditions) {
        sqlConditions.push(condition);
      }

      // Hide players who don't meet a still-open roster position requirement
      // for the caller's team (LS-8065). Auto-pick already refuses to draft a
      // player who can't fill an unfilled slot via getUnfilledPositionTypes;
      // the manual board, however, used to show every eligible player, so a
      // caller who (for example) only had a pitcher slot left still saw — and
      // could draft — hitters that meet no requirement. We mirror the auto-pick
      // constraint here so the board can only ever narrow the pool.
      //
      // When the caller has no team (spectator/commissioner without a roster),
      // the league defines no position requirements, or every slot is already
      // filled, getUnfilledPositionTypes returns an empty list, the eligible
      // stat-position set is empty, and no positional predicate is added —
      // preserving the prior unfiltered behaviour.
      if (membership.teamId != null) {
        const unfilledPositionTypes = await getUnfilledPositionTypes(
          context.db,
          draftId,
          membership.teamId,
          draft.leagueId,
        );
        const eligibleStatPositions = eligibleStatPositionsForUnfilledSlots(
          unfilledPositionTypes,
        );
        if (eligibleStatPositions.length > 0) {
          const positionValues = sql.join(
            eligibleStatPositions.map((pos) => sql`${pos}`),
            sql`, `,
          );
          sqlConditions.push(sql`EXISTS (
            SELECT 1 FROM public.player_eligible_positions pep
            WHERE pep.player_id = p.id AND pep.position IN (${positionValues})
          )`);
        }
      }

      const whereClause =
        sqlConditions.length > 0
          ? sql`WHERE ${sql.join(sqlConditions, sql` AND `)}`
          : sql``;
      // Clamp LIMIT (1–1000) and OFFSET (≥0) to prevent DoS via unbounded queries.
      // Use plain integers so Drizzle sends them as bind parameters, not raw SQL.
      const limitVal = Math.min(Math.max(1, resultLimit ?? 50), 1000);
      const offsetVal = Math.max(0, resultOffset ?? 0);

      // ---- Build SELECT fragments ----
      // Matchup schedule settings for projected points calculation.
      // sql.raw is safe: gpm and spm are integers sourced from our own DB, not user input.
      const gpm = league?.gamesPerMatchup ?? 5;
      const spm = league?.pitcherStartsPerMatchup ?? 1;
      const projMatchupExpr = sql.raw(
        `COALESCE(cs.hitter_avg_ppg, 0) * ${gpm} + COALESCE(cs.pitching_avg_ppg, 0) * ${spm}`,
      );

      // Base SELECT — no scoring join (used for non-scoring sorts).
      const basePlayerSelect = sql`
        SELECT
          p.id, p.first_name, p.last_name, p.bref_id,
          p.stats_last_fetched_at, p.all_star_selections, p.gold_gloves,
          p.silver_sluggers, p.mvp_awards, p.cy_young_awards,
          p.world_series_rings, p.hall_of_fame, p.rookie_of_the_year
        FROM public.players p
      `;

      // Scoring-joined SELECT: joins only the default (NULL league) scoring cache (LS-3115).
      // Reads pre-computed per-game rates from player_scoring_cache (LS-4688) so the
      // SELECT is a column read instead of per-row arithmetic.
      const basePlayerSelectWithScoring = sql`
        SELECT
          p.id, p.first_name, p.last_name, p.bref_id,
          p.stats_last_fetched_at, p.all_star_selections, p.gold_gloves,
          p.silver_sluggers, p.mvp_awards, p.cy_young_awards,
          p.world_series_rings, p.hall_of_fame, p.rookie_of_the_year,
          COALESCE(cs.hitter_avg_ppg, 0) AS hitter_avg_ppg,
          COALESCE(cs.pitching_avg_ppg, 0) AS pitching_avg_ppg,
          ${projMatchupExpr} AS projected_matchup_pts
        FROM public.players p
        LEFT JOIN public.player_scoring_cache cs
          ON cs.player_id = p.id AND cs.league_id IS NULL
      `;

      type RawPlayerRow = {
        id: number;
        first_name: string;
        last_name: string;
        bref_id: string;
        stats_last_fetched_at: string | null;
        all_star_selections: number;
        gold_gloves: number;
        silver_sluggers: number;
        mvp_awards: number;
        cy_young_awards: number;
        world_series_rings: number;
        hall_of_fame: boolean;
        rookie_of_the_year: boolean;
        // Present only for scoring-joined queries
        hitter_avg_ppg?: string | null;
        pitching_avg_ppg?: string | null;
        projected_matchup_pts?: string | null;
      };

      const mapRow = (row: RawPlayerRow) => ({
        id: row.id,
        firstName: row.first_name ?? '',
        lastName: row.last_name ?? '',
        brefId: row.bref_id ?? '',
        statsLastFetchedAt: row.stats_last_fetched_at
          ? new Date(row.stats_last_fetched_at)
          : null,
        allStarSelections: row.all_star_selections ?? 0,
        goldGloves: row.gold_gloves ?? 0,
        silverSluggers: row.silver_sluggers ?? 0,
        mvpAwards: row.mvp_awards ?? 0,
        cyYoungAwards: row.cy_young_awards ?? 0,
        worldSeriesRings: row.world_series_rings ?? 0,
        hallOfFame: row.hall_of_fame ?? false,
        rookieOfTheYear: row.rookie_of_the_year ?? false,
        hitterAvgPointsPerGame:
          row.hitter_avg_ppg != null ? Number(row.hitter_avg_ppg) : null,
        pitchingAvgPointsPerGame:
          row.pitching_avg_ppg != null ? Number(row.pitching_avg_ppg) : null,
        projectedMatchupPoints:
          row.projected_matchup_pts != null
            ? Number(row.projected_matchup_pts)
            : null,
      });

      const orderByKey = orderBy ?? 'hitterAvgPointsPerGame';

      if (orderByKey === 'careerOffensiveWAR') {
        // Sort by lWAR via LEFT JOIN to career_batting view
        const rawQuery = sql`
          ${basePlayerSelect}
          LEFT JOIN public.career_batting cb ON p.id = cb.player_id
          ${whereClause}
          ORDER BY COALESCE(cb.offensive_war, 0) DESC
          LIMIT ${limitVal} OFFSET ${offsetVal}
        `;
        const result = await context.db.execute(rawQuery);
        return (result.rows as unknown as RawPlayerRow[]).map(mapRow);
      }

      if (orderByKey === 'lastName') {
        // Alphabetical sort — no scoring join needed
        const rawQuery = sql`
          ${basePlayerSelect}
          ${whereClause}
          ORDER BY p.last_name ASC, p.first_name ASC
          LIMIT ${limitVal} OFFSET ${offsetVal}
        `;
        const result = await context.db.execute(rawQuery);
        return (result.rows as unknown as RawPlayerRow[]).map(mapRow);
      }

      if (orderByKey === 'projectedMatchupPoints') {
        // Sort by the SAME expression that produces the displayed projected_matchup_pts
        // column (projMatchupExpr) so the board order always matches the value shown on
        // each card. Using a different formula here would let players sort in an order
        // that contradicts their displayed Pts/Matchup value.
        const rawQuery = sql`
          ${basePlayerSelectWithScoring}
          ${whereClause}
          ORDER BY ${projMatchupExpr} DESC
          LIMIT ${limitVal} OFFSET ${offsetVal}
        `;
        try {
          const result = await context.db.execute(rawQuery);
          return (result.rows as unknown as RawPlayerRow[]).map(mapRow);
        } catch (err) {
          // Fall back to hitterAvgPointsPerGame if the scoring-cache columns are
          // unavailable (e.g. player_scoring_cache not yet populated).
          LOGGER.error(
            '[Draft] projectedMatchupPoints sort failed — falling back to hitterAvgPointsPerGame',
            err instanceof Error ? err : new Error(String(err)),
            { draftId, leagueId: draft.leagueId },
          );
          // Fall through to default scoring sort below
        }
      }

      // ---- Determine ORDER BY strategy ----
      // Scoring ORDER BY expressions reference the 'cs' alias (default scoring cache,
      // league_id IS NULL). The draft board always uses default scoring settings (LS-3115)
      // so players sort consistently regardless of league-specific profile customisation.
      // hitterAvgPointsPerGame = (batting_score + fielding_score) / career_games
      // pitchingAvgPointsPerGame = pitching_score / career_games
      // Both divide by career_games (consistent with the DraftPlayer field descriptions).
      const scoringColMap: Record<string, string> = {
        hitterScore:
          'COALESCE(cs.batting_score, 0) + COALESCE(cs.fielding_score, 0)',
        pitchingScore: 'COALESCE(cs.pitching_score, 0)',
        battingScore: 'COALESCE(cs.batting_score, 0)',
        fieldingScore: 'COALESCE(cs.fielding_score, 0)',
        totalScore: 'COALESCE(cs.total_score, 0)',
        careerGames: 'COALESCE(cs.career_games, 0)',
        avgPointsPerGame: 'COALESCE(cs.avg_ppg, 0)',
        // Reference cs.* directly (the player_scoring_cache stored columns
        // added in LS-4688), not the SELECT-list aliases — PostgreSQL does
        // not resolve output aliases inside the COALESCE wrapper in the
        // ORDER BY clause below.
        hitterAvgPointsPerGame: 'cs.hitter_avg_ppg',
        pitchingAvgPointsPerGame: 'cs.pitching_avg_ppg',
      };

      // Scoring sorts: join player_scoring_cache (LS-696 — replaces compute_career_scores)
      // Validate orderByKey against the explicit allowlist before calling sql.raw().
      // sql.raw() is necessary here because column expressions cannot be parameterized,
      // but the value is always sourced from the hardcoded scoringColMap — never user input.
      const safeOrderByKey = Object.prototype.hasOwnProperty.call(
        scoringColMap,
        orderByKey,
      )
        ? orderByKey
        : 'hitterAvgPointsPerGame';
      const scoringCol = sql.raw(scoringColMap[safeOrderByKey]);
      const rawQuery = sql`
        ${basePlayerSelectWithScoring}
        ${whereClause}
        ORDER BY COALESCE(${scoringCol}, 0) DESC
        LIMIT ${limitVal} OFFSET ${offsetVal}
      `;
      const result = await context.db.execute(rawQuery);
      return (result.rows as unknown as RawPlayerRow[]).map(mapRow);
    },
  }),
);

/**
 * Query: Get draft team order
 * Returns the ordered list of teams assigned to draft slots, sorted by draftOrder.
 * Requires user is a league member.
 */
builder.queryField('getDraftTeamOrder', (t) =>
  t.field({
    type: [DraftTeamOrderEntry],
    args: {
      draftId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { draftId } = args;

      // Verify draft exists and user is a league member
      const [draft] = await context.db
        .select({ leagueId: PublicSchema.drafts.leagueId })
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, draftId))
        .limit(1);

      if (!draft) {
        throw UserInputError('Draft not found');
      }

      await verifyLeagueMembership(context.db, draft.leagueId, context.user.id);

      // Fetch draft_teams joined with team name, sorted by draftOrder
      const rows = await context.db
        .select({
          teamId: PublicSchema.draftTeams.teamId,
          draftOrder: PublicSchema.draftTeams.draftOrder,
          teamName: PublicSchema.teams.name,
        })
        .from(PublicSchema.draftTeams)
        .innerJoin(
          PublicSchema.teams,
          eq(PublicSchema.draftTeams.teamId, PublicSchema.teams.id),
        )
        .where(eq(PublicSchema.draftTeams.draftId, draftId))
        .orderBy(asc(PublicSchema.draftTeams.draftOrder));

      return rows.map((row) => ({
        teamId: row.teamId,
        teamName: row.teamName,
        draftOrder: row.draftOrder,
      }));
    },
  }),
);

/**
 * Query: Get auto-pick status for the current user's team in a draft (LS-427)
 *
 * Returns true if the user's team has auto-pick enabled for the given draft,
 * false if disabled, or null if the user has no team in this draft.
 */
builder.queryField('getMyDraftTeamAutoPick', (t) =>
  t.field({
    type: 'Boolean',
    nullable: true,
    args: {
      draftId: t.arg.int({ required: true }),
    },
    description:
      "Returns the auto-pick status for the current user's team in the given draft, or null if the user has no team in this draft.",
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { draftId } = args;

      // Get the draft to resolve leagueId
      const [draft] = await context.db
        .select({ leagueId: PublicSchema.drafts.leagueId })
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, draftId))
        .limit(1);

      if (!draft) return null;

      // Resolve the user's team in this league
      const [membership] = await context.db
        .select({ teamId: PublicSchema.leagueMembers.teamId })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, draft.leagueId),
            eq(PublicSchema.leagueMembers.userId, context.user.id),
          ),
        )
        .limit(1);

      if (!membership?.teamId) return null;

      // Fetch auto-pick flag from draft_teams
      const [draftTeamEntry] = await context.db
        .select({ autoPick: PublicSchema.draftTeams.autoPick })
        .from(PublicSchema.draftTeams)
        .where(
          and(
            eq(PublicSchema.draftTeams.draftId, draftId),
            eq(PublicSchema.draftTeams.teamId, membership.teamId),
          ),
        )
        .limit(1);

      return draftTeamEntry?.autoPick ?? null;
    },
  }),
);

/**
 * Query: Get auto-pick status for all teams in a draft (LS-439)
 *
 * Returns a list of { teamId, autoPick } for every team registered in the
 * given draft.  Any authenticated league member may call this — the information
 * is not sensitive and is needed to render the autopick icon on the board tab.
 */
builder.queryField('getDraftTeamAutoPickStatuses', (t) =>
  t.field({
    type: [DraftTeamAutoPickStatus],
    args: {
      draftId: t.arg.int({ required: true }),
    },
    description:
      'Returns the auto-pick status for every team registered in the given draft.',
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { draftId } = args;
      const userId = context.user.id;

      try {
        // This query refetches after every pick/auto-pick event on the live
        // draft board, so it races concurrent writes to draft_teams (e.g. a
        // makeDraftPick / toggleAutoPick mutation firing off the same event).
        // Wrap the two reads in a bounded retry so a transient Postgres failure
        // (deadlock / serialization / lock-timeout) recovers silently instead
        // of surfacing a generic error toast to drafting users (LS-8287).
        const [draft] = await withTransientRetry(
          () =>
            context.db
              .select({ leagueId: PublicSchema.drafts.leagueId })
              .from(PublicSchema.drafts)
              .where(eq(PublicSchema.drafts.id, draftId))
              .limit(1),
          {
            onRetry: (attempt, detail) =>
              LOGGER.warn('Retrying draft lookup after transient DB error', {
                draftId,
                attempt,
                dbError: formatDbError(detail),
              }),
          },
        );

        if (!draft) {
          throw UserInputError('Draft not found');
        }

        await verifyLeagueMembership(context.db, draft.leagueId, userId);

        const rows = await withTransientRetry(
          () =>
            context.db
              .select({
                teamId: PublicSchema.draftTeams.teamId,
                autoPick: PublicSchema.draftTeams.autoPick,
              })
              .from(PublicSchema.draftTeams)
              .where(eq(PublicSchema.draftTeams.draftId, draftId)),
          {
            onRetry: (attempt, detail) =>
              LOGGER.warn(
                'Retrying draft-team auto-pick read after transient DB error',
                { draftId, attempt, dbError: formatDbError(detail) },
              ),
          },
        );

        return rows.map((row) => ({
          teamId: row.teamId,
          autoPick: row.autoPick,
        }));
      } catch (error) {
        // Preserve typed client-facing errors (UNAUTHENTICATED / BAD_USER_INPUT
        // / FORBIDDEN) so the client still receives the intended code.
        if (error instanceof GraphQLError) {
          throw error;
        }
        // A DB failure that survived the bounded retry above (e.g. a connection
        // drop or statement timeout) would otherwise be masked by the formatter
        // as a generic "Internal server error", diagnosable only via a manual
        // CloudWatch hunt (LS-8287, mirroring the startDraft fix in LS-8239).
        // Log the real cause for Rollbar/CloudWatch and re-throw with a stable,
        // client-facing code carrying the SQLSTATE so the browser-side Rollbar
        // occurrence is self-diagnosing instead of a generic 500.
        const detail = describeDbError(error);
        const err = error instanceof Error ? error : new Error(String(error));
        LOGGER.error('Failed to load draft auto-pick statuses', err, {
          draftId,
          userId,
          dbError: formatDbError(detail),
        });
        throw new GraphQLError(
          detail.code
            ? `Failed to load auto-pick statuses (database error ${detail.code})`
            : 'Failed to load auto-pick statuses',
          { extensions: { code: 'DRAFT_AUTO_PICK_STATUS_FAILED' } },
        );
      }
    },
  }),
);

/**
 * Query: Get draft intelligence recommendations for a team (LS-467)
 *
 * Returns the top 5 player recommendations for the given team using the same
 * multi-factor algorithm powering the Draft Intelligence UI panel:
 *   Stat Value 50% + Positional Need 30% + Scarcity 20%
 */
builder.queryField('getDraftRecommendations', (t) =>
  t.field({
    type: [DraftRecommendation],
    description:
      'Returns top-5 draft pick recommendations for a team using the Draft Intelligence algorithm (stat value 50% + positional need 30% + scarcity 20%).',
    args: {
      draftId: t.arg.int({ required: true }),
      teamId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();
      // Draft recommendations are a Premium feature
      // (ENTITLEMENTS.draft_recommendations).
      await requireEntitlement(context, ENTITLEMENTS.draft_recommendations);
      const { draftId, teamId } = args;

      // Verify draft exists and caller is a league member
      const [draft] = await context.db
        .select({ leagueId: PublicSchema.drafts.leagueId })
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, draftId))
        .limit(1);
      if (!draft) throw UserInputError('Draft not found');
      const membership = await verifyLeagueMembership(
        context.db,
        draft.leagueId,
        context.user.id,
      );

      // Recommendations expose a team's projected draft strategy and positional
      // needs. Only the team's own member — or a league commissioner/owner —
      // may view them; otherwise any league member could poll for every
      // opposing team during the draft (LS-2495).
      if (membership.teamId !== teamId && !isCommissionerOrOwner(membership)) {
        throw ForbiddenError(
          'Cannot view draft recommendations for another team',
        );
      }

      // All picks for this draft G�� tells us who's been picked and what the
      // requesting team already has on their roster.
      const allPicks = await context.db
        .select({
          playerId: PublicSchema.draftPicks.playerId,
          teamId: PublicSchema.draftPicks.teamId,
        })
        .from(PublicSchema.draftPicks)
        .where(eq(PublicSchema.draftPicks.draftId, draftId));

      const teamPickedIds = allPicks
        .filter((p) => p.teamId === teamId)
        .map((p) => p.playerId);

      // --- Normalize position (LF/CF/RF G�� OF) ---
      const normPos = (pos: string): string => {
        const u = pos.toUpperCase();
        if (u === 'LF' || u === 'CF' || u === 'RF') return 'OF';
        return u;
      };

      // --- Min-max normalizer factory ---
      const minMaxNorm =
        (values: number[]) =>
        (v: number): number => {
          const min = Math.min(...values);
          const max = Math.max(...values);
          const range = max - min;
          if (range === 0) return 0.5;
          return (v - min) / range;
        };

      // --- Fetch available players with career stats ---
      type PlayerRow = {
        player_id: number;
        first_name: string;
        last_name: string;
        primary_position: string | null;
        hr: number | null;
        rbi: number | null;
        sb: number | null;
        batting_h: number | null;
        batting_ab: number | null;
        batting_tb: number | null;
        batting_bb: number | null;
        batting_hbp: number | null;
        batting_sh: number | null;
        pitcher_wins: number | null;
        pitcher_saves: number | null;
        pitcher_strikeouts: number | null;
        pitcher_er: number | null;
        pitcher_outs: number | null;
        pitcher_bb: number | null;
        pitcher_h: number | null;
        pitcher_era: string | null;
      };

      const excludeClause = sql`AND NOT EXISTS (
        SELECT 1 FROM public.draft_picks dp
        WHERE dp.draft_id = ${draftId} AND dp.player_id = p.id
      )`;

      const statsResult = await context.db.execute(sql`
        SELECT
          p.id           AS player_id,
          p.first_name,
          p.last_name,
          (
            SELECT pep.position
            FROM public.player_eligible_positions pep
            WHERE pep.player_id = p.id
            ORDER BY pep.games DESC
            LIMIT 1
          )              AS primary_position,
          cb.hr,
          cb.rbi,
          cb.sb,
          cb.h           AS batting_h,
          cb.ab          AS batting_ab,
          cb.tb          AS batting_tb,
          cb.bb          AS batting_bb,
          cb.hbp         AS batting_hbp,
          cb.sh          AS batting_sh,
          cp.w           AS pitcher_wins,
          cp.sv          AS pitcher_saves,
          cp.so          AS pitcher_strikeouts,
          cp.er          AS pitcher_er,
          cp.outs_recorded AS pitcher_outs,
          cp.bb          AS pitcher_bb,
          cp.h           AS pitcher_h,
          cp.era         AS pitcher_era
        FROM public.players p
        LEFT JOIN public.career_batting   cb ON cb.player_id = p.id
        LEFT JOIN public.career_pitching  cp ON cp.player_id = p.id
        WHERE EXISTS (
          SELECT 1
          FROM public.player_eligible_positions pep2
          WHERE pep2.player_id = p.id
        )
        ${excludeClause}
        ORDER BY p.id
        LIMIT 500
      `);

      // --- Fetch primary position of team's already-drafted players for positional need ---
      const positionCount: Record<string, number> = {};
      if (teamPickedIds.length > 0) {
        // Parameterize the IN list to prevent injection if teamPickedIds ever
        // receives non-integer values in future refactors.
        const pickedIdParams = sql.join(
          teamPickedIds.map((id) => sql`${id}`),
          sql`, `,
        );
        const rosterPositionsResult = await context.db.execute(sql`
          SELECT DISTINCT ON (pep.player_id) pep.player_id, pep.position
          FROM public.player_eligible_positions pep
          WHERE pep.player_id IN (${pickedIdParams})
          ORDER BY pep.player_id, pep.games DESC
        `);
        for (const row of rosterPositionsResult.rows as {
          player_id: number;
          position: string;
        }[]) {
          const pos = normPos(row.position);
          positionCount[pos] = (positionCount[pos] ?? 0) + 1;
        }
      }

      // --- Build typed player data ---
      type PlayerData = {
        id: number;
        name: string;
        position: string;
        isPitcher: boolean;
        hr: number;
        rbi: number;
        sb: number;
        avg: number;
        obp: number;
        slg: number;
        wins: number;
        saves: number;
        strikeouts: number;
        era: number;
        whip: number;
      };

      const players: PlayerData[] = [];
      for (const row of statsResult.rows as unknown as PlayerRow[]) {
        if (!row.primary_position) continue;
        const pos = normPos(row.primary_position);
        const isPitcher = pos === 'SP' || pos === 'RP' || pos === 'P';

        if (isPitcher) {
          const outs = row.pitcher_outs ?? 0;
          const innings = outs / 3;
          const era =
            row.pitcher_era != null ? parseFloat(row.pitcher_era) : 99;
          const whip =
            innings > 0
              ? ((row.pitcher_bb ?? 0) + (row.pitcher_h ?? 0)) / innings
              : 99;
          players.push({
            id: row.player_id,
            name: `${row.first_name} ${row.last_name}`.trim(),
            position: pos === 'P' ? 'SP' : pos,
            isPitcher: true,
            hr: 0,
            rbi: 0,
            sb: 0,
            avg: 0,
            obp: 0,
            slg: 0,
            wins: row.pitcher_wins ?? 0,
            saves: row.pitcher_saves ?? 0,
            strikeouts: row.pitcher_strikeouts ?? 0,
            era,
            whip,
          });
        } else {
          const h = row.batting_h ?? 0;
          const ab = Math.max(row.batting_ab ?? 0, 1);
          const tb = row.batting_tb ?? 0;
          const bb = row.batting_bb ?? 0;
          const hbp = row.batting_hbp ?? 0;
          const sh = row.batting_sh ?? 0;
          const avg = h / ab;
          const obpDen = ab + bb + hbp + sh;
          const obp = obpDen > 0 ? (h + bb + hbp) / obpDen : 0;
          const slg = tb / ab;
          players.push({
            id: row.player_id,
            name: `${row.first_name} ${row.last_name}`.trim(),
            position: pos,
            isPitcher: false,
            hr: row.hr ?? 0,
            rbi: row.rbi ?? 0,
            sb: row.sb ?? 0,
            avg,
            obp,
            slg,
            wins: 0,
            saves: 0,
            strikeouts: 0,
            era: 99,
            whip: 99,
          });
        }
      }

      if (players.length === 0) return [];

      // --- Scoring algorithm (mirrors client-side computeDraftIntelligence) ---
      const ROSTER_SLOTS: Record<string, number> = {
        C: 1,
        '1B': 1,
        '2B': 1,
        '3B': 1,
        SS: 1,
        OF: 3,
        SP: 2,
        RP: 1,
      };

      const getPositionalNeed = (position: string): number => {
        const quota = ROSTER_SLOTS[position] ?? 1;
        const have = positionCount[position] ?? 0;
        if (have === 0) return 1.0;
        if (have < quota) return 0.5;
        return 0.0;
      };

      const availableByPos: Record<string, number> = {};
      for (const p of players) {
        availableByPos[p.position] = (availableByPos[p.position] ?? 0) + 1;
      }
      const maxCountAnyPos = Math.max(...Object.values(availableByPos), 1);

      const getScarcity = (position: string): number => {
        const count = availableByPos[position] ?? 0;
        return 1 - count / maxCountAnyPos;
      };

      const hitters = players.filter((p) => !p.isPitcher);
      const pitchers = players.filter((p) => p.isPitcher);

      type Scored = { player: PlayerData; statScore: number };
      const scored: Scored[] = [];

      if (hitters.length > 0) {
        const normHr = minMaxNorm(hitters.map((p) => p.hr));
        const normRbi = minMaxNorm(hitters.map((p) => p.rbi));
        const normAvg = minMaxNorm(hitters.map((p) => p.avg));
        const normSb = minMaxNorm(hitters.map((p) => p.sb));
        const normObp = minMaxNorm(hitters.map((p) => p.obp));
        const normSlg = minMaxNorm(hitters.map((p) => p.slg));
        for (const p of hitters) {
          const statScore =
            normHr(p.hr) * 0.25 +
            normRbi(p.rbi) * 0.2 +
            normAvg(p.avg) * 0.2 +
            normSb(p.sb) * 0.15 +
            normObp(p.obp) * 0.1 +
            normSlg(p.slg) * 0.1;
          scored.push({ player: p, statScore });
        }
      }

      if (pitchers.length > 0) {
        const normK = minMaxNorm(pitchers.map((p) => p.strikeouts));
        const normW = minMaxNorm(pitchers.map((p) => p.wins));
        const normSv = minMaxNorm(pitchers.map((p) => p.saves));
        const normEra = minMaxNorm(pitchers.map((p) => p.era));
        const normWhip = minMaxNorm(pitchers.map((p) => p.whip));
        for (const p of pitchers) {
          const statScore =
            normK(p.strikeouts) * 0.25 +
            (1 - normEra(p.era)) * 0.25 +
            normW(p.wins) * 0.2 +
            normSv(p.saves) * 0.15 +
            (1 - normWhip(p.whip)) * 0.15;
          scored.push({ player: p, statScore });
        }
      }

      return scored
        .map(({ player, statScore }) => {
          const posNeed = getPositionalNeed(player.position);
          const scarcity = getScarcity(player.position);
          const score = statScore * 0.5 + posNeed * 0.3 + scarcity * 0.2;

          const topStats = player.isPitcher
            ? [
                { label: 'ERA', value: player.era.toFixed(2) },
                { label: 'K', value: String(player.strikeouts) },
              ]
            : [
                { label: 'AVG', value: player.avg.toFixed(3) },
                { label: 'HR', value: String(player.hr) },
              ];

          let reason: string;
          if (posNeed === 1.0) {
            reason = `Fills your empty ${player.position} slot`;
          } else if (posNeed === 0.5) {
            reason = `Adds depth at ${player.position}`;
          } else if (scarcity > 0.7) {
            reason = `Only ${availableByPos[player.position] ?? 0} ${player.position}s left`;
          } else {
            reason = `Top rated ${player.position} available`;
          }

          return {
            playerId: player.id,
            playerName: player.name,
            position: player.position,
            score,
            reason,
            topStats,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    },
  }),
);

/**
 * Query: Get the current user's draft queue for a draft (LS-473)
 *
 * Returns entries ordered by priority ASC. Only visible to the league's
 * general manager — draft queues reveal strategic pick order and must stay
 * private even from other co-managers / assistant roles in the same league
 * (LS-2501).
 */
builder.queryField('getMyDraftQueue', (t) =>
  t.field({
    type: [DraftQueueEntry],
    args: {
      draftId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();

      const { draftId } = args;

      const [draft] = await context.db
        .select({ leagueId: PublicSchema.drafts.leagueId })
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, draftId))
        .limit(1);
      if (!draft) throw UserInputError('Draft not found');

      const [membership] = await context.db
        .select({
          teamId: PublicSchema.leagueMembers.teamId,
          permissionLevel: PublicSchema.leagueMembers.permissionLevel,
        })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, draft.leagueId),
            eq(PublicSchema.leagueMembers.userId, context.user.id),
          ),
        )
        .limit(1);
      if (!membership?.teamId)
        throw ForbiddenError('You are not in this league');
      if (membership.permissionLevel !== 'general_manager') {
        throw ForbiddenError(
          'Only the team general manager can view this draft queue',
        );
      }

      const rows = await context.db
        .select()
        .from(PublicSchema.draftQueue)
        .where(
          and(
            eq(PublicSchema.draftQueue.draftId, draftId),
            eq(PublicSchema.draftQueue.teamId, membership.teamId),
          ),
        )
        .orderBy(asc(PublicSchema.draftQueue.priority));

      return rows;
    },
  }),
);

/**
 * Query: Get the current user's mock-draft usage for the week (LS-5178)
 *
 * Returns how many mock drafts the user has created in the trailing 7-day
 * window relative to the free-tier weekly cap, plus whether they are exempt
 * (unlimited_mock_drafts entitlement). The web Mock Draft page uses this to
 * proactively show a "N/N mock drafts used this week" disabled state instead
 * of letting the user submit only to hit a PREMIUM_REQUIRED error.
 */
builder.queryField('getMyMockDraftUsage', (t) =>
  t.field({
    type: MockDraftUsage,
    description:
      "Returns the current user's mock-draft usage within the trailing 7-day window relative to the free-tier weekly limit.",
    resolve: async (_parent, _args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const isUnlimited = await hasEntitlement(
        context,
        ENTITLEMENTS.unlimited_mock_drafts,
      );
      const used = await countRecentMockDrafts(context.db, context.user.id);
      const limit = MOCK_DRAFT_FREE_WEEKLY_LIMIT;

      return {
        used,
        limit,
        // Unlimited users are never capped, so surface full headroom.
        remaining: isUnlimited ? limit : Math.max(0, limit - used),
        isUnlimited,
      };
    },
  }),
);
