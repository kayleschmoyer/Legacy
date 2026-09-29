/**
 * Draft domain — query fields
 */

import { type PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { and, asc, desc, eq, isNotNull, or, sql } from 'drizzle-orm';
import { GraphQLError } from 'graphql';
import { LOGGER } from '@legacy-sports/logging';
import { getDefaultRosterPositions } from '@legacy-sports/utils';

import type { PlayerDraftInfo } from './candidate-pool';
import { buildDraftAdpCte, buildDraftAdpPoolConditions } from './draft-adp';
import {
  deriveDraftRecommendationSignal,
  type DraftRecommendationSignal,
  findTierBreakCandidateIds,
} from './draft-recommendation-signals';
import { authorizeDraft, authorizeLoadedDraft } from './authorize-draft';
import { loadDraftRules } from './draft-rules';
import { requireLeagueId } from './league-draft';
import {
  countRecentMockDrafts,
  eligibleStatPositionsForUnfilledSlots,
  getCurrentDraftPickInfo,
  getUnfilledPositionTypes,
  MOCK_DRAFT_FREE_WEEKLY_LIMIT,
} from './helpers';
import { getSeatForTeam } from './participants';
import { effectiveFootballFpg } from './strategies/football';
import {
  CurrentDraftPick,
  Draft,
  DraftFootballPlayerStats,
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
  requireEntitlement,
  verifyLeagueReadAccess,
} from '../authorization';
import { ENTITLEMENTS } from '../entitlements';
import { builder } from '../builder';
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from '../graphql-errors';

/**
 * Draft-board position filter → stat positions, per sport.
 *
 * The board's filter pills are display positions (see `POSITIONS_BY_SPORT` in
 * `DraftPlayerBoard`), a few of which collapse several `player_eligible_positions`
 * rows. Positions not listed here match their own stat position verbatim.
 */
const POSITION_FILTER_EXPANSIONS_BASEBALL: Readonly<
  Record<string, readonly string[]>
> = Object.freeze({
  P: ['SP', 'RP'],
  OF: ['LF', 'CF', 'RF'],
});

const POSITION_FILTER_EXPANSIONS_FOOTBALL: Readonly<
  Record<string, readonly string[]>
> = Object.freeze({
  // Most feeds label a team defense 'DEF'; some use 'DST'. Match either so the
  // pill returns the same set regardless of which the ingest wrote.
  DEF: ['DEF', 'DST'],
  DST: ['DEF', 'DST'],
  FLEX: ['RB', 'WR', 'TE'],
});

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

      // This field is nullable-on-missing rather than erroring, so the row is
      // loaded here and authorized via authorizeLoadedDraft (LS-10074) rather
      // than letting authorizeDraft's 'Draft not found' escape.
      if (!draft) return null;

      // Members, spectators of public leagues, and admins may read (LS-8939)
      await authorizeLoadedDraft(context, draft, 'read');

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

      // Members, spectators of public leagues, and admins may read (LS-8939).
      // Guarded on the league, not the draft: this resolver is asked for "the
      // league's draft" and must answer null when the league has none yet.
      await verifyLeagueReadAccess(
        context.db,
        args.leagueId,
        context.user.id,
        context.user.isAdmin,
      );

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

      const [draft] = await context.db
        .select()
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, args.draftId))
        .limit(1);

      if (!draft) return null;

      // Members, spectators of public leagues, and admins may read (LS-8939)
      await authorizeLoadedDraft(context, draft, 'read');

      try {
        return await getCurrentDraftPickInfo(context.db, args.draftId);
      } catch (error) {
        // draft_teams is empty between league creation (which creates the
        // drafts row) and initializeDraft running (which populates
        // draft_teams) — an expected transient state while the commissioner
        // hasn't started the draft yet, not a system failure. The client
        // already renders a friendly "draft order not generated yet" message
        // for this exact case (useDraftEffects), but only if it can read the
        // real message off the error — a plain Error has no client-facing
        // extensions.code, so formatError was scrubbing it to a generic
        // "Internal server error" and reporting it to Rollbar (LS-4853).
        if (
          error instanceof Error &&
          error.message === 'No teams configured for this draft'
        ) {
          throw new GraphQLError(error.message, {
            extensions: { code: 'DRAFT_TEAMS_NOT_CONFIGURED' },
          });
        }
        throw error;
      }
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
              .select()
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

        // Members, spectators of public leagues, and admins may read (LS-8939)
        await authorizeLoadedDraft(context, draft, 'read');

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

      // Verify the caller may draft here, and capture their seat/team so the
      // board can be filtered by the team's remaining roster requirements.
      // 'participate' reproduces verifyLeagueMembership exactly — spectators
      // of a public league are refused, as they were before (LS-10074).
      const { draft, seat } = await authorizeDraft(
        context,
        draftId,
        'participate',
      );

      // Player pool, career minimums, eligibility filters and the matchup
      // schedule now arrive as DraftRules rather than a direct leagues read,
      // so slice 4's mock drafts reach the same board query (LS-10074).
      const rules = await loadDraftRules(context.db, draftId);

      // ---- Build raw SQL conditions (all reference table alias 'p') ----
      const sqlConditions: ReturnType<typeof sql>[] = [];

      // Restrict the board to the league's own sport (LS-9470). `players` is a
      // single multi-sport table (players.sport, NOT NULL DEFAULT 'baseball'),
      // and none of the eligibility predicates below imply a sport on their
      // own — a football league with playerPool='all' adds no predicate at all
      // — so without this a football draft would list every MLB player as
      // draftable. Baseball leagues are unaffected: every baseball player
      // carries sport='baseball'.
      const leagueSport = rules.sport;
      const isFootball = leagueSport === 'football';

      // The pool-defining predicates — sport, the rostered-player exclusion
      // (LS-8674: keepers are applied to rosters before the first pick, so
      // kept players are not draftable; a no-op for redraft leagues), and the
      // league's static eligibility rules (player pool, career games/seasons,
      // Hall-of-Fame, era — LS-8071, the SAME shared builder the pick
      // endpoints use, so a player shown here can never be rejected by a pick
      // on eligibility, or vice-versa).
      //
      // They come from buildDraftAdpPoolConditions() rather than being built
      // here, because these same predicates define the window the ADP stack
      // rank is taken over, and DraftPick.adp ranks drafted players over that
      // window too (LS-10096). One definition, so the rank a manager saw on
      // the board and the rank their completed pick is judged against cannot
      // drift apart. Everything layered on below — the already-drafted
      // exclusion, search, position pill, open roster slots — narrows what is
      // *listed*, never what is *ranked*.
      const poolConditions = buildDraftAdpPoolConditions({
        draftId,
        leagueId: draft.leagueId,
        leagueSport,
        league: rules,
      });

      sqlConditions.push(...poolConditions);

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

      // Apply optional position filter (server-side). The board's filter pills
      // send display positions, which collapse several stat positions in both
      // sports: baseball P → SP/RP and OF → LF/CF/RF; football DEF → DEF/DST
      // (feeds disagree on the team-defense label). Anything else matches the
      // stat position directly.
      if (position && position.trim().length > 0) {
        const pos = position.trim().toUpperCase();
        const expandedPositions = isFootball
          ? POSITION_FILTER_EXPANSIONS_FOOTBALL[pos]
          : POSITION_FILTER_EXPANSIONS_BASEBALL[pos];
        const positionValues = sql.join(
          (expandedPositions ?? [pos]).map((statPos) => sql`${statPos}`),
          sql`, `,
        );
        // Each sport keeps its eligible positions in its own relation, and
        // football's holds no rows in the baseball one — filtering a football
        // board against `player_eligible_positions` returned an empty board for
        // every pill (LS-9474). `candidate-pool.ts` already branches this way
        // for auto-pick; the board now matches it.
        sqlConditions.push(
          isFootball
            ? sql`EXISTS (
              SELECT 1 FROM public.football_player_eligible_positions fpep
              WHERE fpep.player_id = p.id AND fpep.position IN (${positionValues})
            )`
            : sql`EXISTS (
              SELECT 1 FROM public.player_eligible_positions pep
              WHERE pep.player_id = p.id AND pep.position IN (${positionValues})
            )`,
        );
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
      // preserving the prior unfiltered behaviour (the safe failure mode).
      // Both helpers are sport-aware (LS-9479) — football reads
      // football_player_eligible_positions and ALLOWED_POSITIONS_BY_SPORT.football
      // instead of the baseball-only equivalents, matching the EXISTS clause below.
      if (seat) {
        const unfilledPositionTypes = await getUnfilledPositionTypes(
          context.db,
          draftId,
          seat.id,
          rules,
        );
        const eligibleStatPositions = eligibleStatPositionsForUnfilledSlots(
          unfilledPositionTypes,
          leagueSport,
        );
        if (eligibleStatPositions.length > 0) {
          const positionValues = sql.join(
            eligibleStatPositions.map((pos) => sql`${pos}`),
            sql`, `,
          );
          sqlConditions.push(
            isFootball
              ? sql`EXISTS (
                SELECT 1 FROM public.football_player_eligible_positions fpep
                WHERE fpep.player_id = p.id AND fpep.position IN (${positionValues})
              )`
              : sql`EXISTS (
                SELECT 1 FROM public.player_eligible_positions pep
                WHERE pep.player_id = p.id AND pep.position IN (${positionValues})
              )`,
          );
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
      const gpm = rules.gamesPerMatchup ?? 5;
      const spm = rules.pitcherStartsPerMatchup ?? 1;
      const projMatchupExpr = sql.raw(
        `COALESCE(cs.hitter_avg_ppg, 0) * ${gpm} + COALESCE(cs.pitching_avg_ppg, 0) * ${spm}`,
      );

      // The rank shown in this column is the same stack rank DraftPick.adp
      // reports for picks already made — both come from buildDraftAdpCte(),
      // which owns the definition and the reasoning behind it (LS-10096).
      // The pool predicates passed here are the pool-defining ones only:
      // deliberately not the already-drafted exclusion, search term, position
      // pill, or open-roster-slot filters layered on below, so a player's rank
      // is fixed for the life of the draft.
      const draftAdpCte = buildDraftAdpCte({
        leagueId: draft.leagueId,
        leagueSport,
        poolConditions,
      });

      // Base SELECT — no scoring join (used for non-scoring sorts).
      const basePlayerSelect = sql`
        ${draftAdpCte}
        SELECT
          p.id, p.first_name, p.last_name, p.bref_id,
          p.stats_last_fetched_at, p.all_star_selections, p.gold_gloves,
          p.silver_sluggers, p.mvp_awards, p.cy_young_awards,
          p.world_series_rings, p.hall_of_fame, p.rookie_of_the_year,
          da.adp AS adp
        FROM public.players p
        LEFT JOIN draft_adp da ON da.player_id = p.id
      `;

      // Scoring-joined SELECT: joins only the default (NULL league) scoring cache (LS-3115).
      // Reads pre-computed per-game rates from player_scoring_cache (LS-4688) so the
      // SELECT is a column read instead of per-row arithmetic.
      const basePlayerSelectWithScoring = sql`
        ${draftAdpCte}
        SELECT
          p.id, p.first_name, p.last_name, p.bref_id,
          p.stats_last_fetched_at, p.all_star_selections, p.gold_gloves,
          p.silver_sluggers, p.mvp_awards, p.cy_young_awards,
          p.world_series_rings, p.hall_of_fame, p.rookie_of_the_year,
          COALESCE(cs.hitter_avg_ppg, 0) AS hitter_avg_ppg,
          COALESCE(cs.pitching_avg_ppg, 0) AS pitching_avg_ppg,
          ${projMatchupExpr} AS projected_matchup_pts,
          da.adp AS adp
        FROM public.players p
        LEFT JOIN public.player_scoring_cache cs
          ON cs.player_id = p.id AND cs.league_id IS NULL
        LEFT JOIN draft_adp da ON da.player_id = p.id
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
        // Stack-rank ADP fallback (LS-696 scoring cache) — present on every branch.
        adp?: string | number | null;
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
        adp: row.adp != null ? Number(row.adp) : null,
      });

      // Every sort key below (including the default) reads
      // `player_scoring_cache`, which is computed from baseball career stats
      // only. For a football league every candidate therefore ties at 0 and the
      // board's row order is whatever the planner happens to return — different
      // between pages of the same scroll. Until football projections land, a
      // football board sorts alphabetically, which is at least stable and
      // pageable. An explicit `lastName` request lands on the same branch.
      const orderByKey =
        leagueSport === 'football'
          ? 'lastName'
          : (orderBy ?? 'hitterAvgPointsPerGame');

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
 * Query: Get career football stat totals for the draft board (LS-9478)
 *
 * Football analogue of GetDraftPlayerStats/GetDraftPitchingStats — those two
 * queries feed the board's baseball stat columns (AVG/HR/RBI/... and
 * ERA/W/K/...) from career_batting/career_pitching; this one feeds the
 * football columns (PASS YDS/RUSH YDS/REC/TD/FG) from the four
 * career_football_* tables via LEFT JOIN. Kept as its own query rather than
 * folded into getAvailableDraftPlayers (the board's largest DB-time consumer
 * per the LS-9311 note in DraftUtils.ts) so baseball leagues never pay for
 * these joins: the client only calls this query for football leagues, and
 * the WHERE clause below is a second, server-side guarantee of the same.
 *
 * Only players with at least one of the four career rows are returned —
 * players with none (e.g. a DB/LB/DL with no offensive/kicking stats) are
 * simply absent, which the client must treat as "no data" (em-dash), not 0
 * (LS-9473 fabricated-zero postmortem).
 */
builder.queryField('getDraftFootballPlayerStats', (t) =>
  t.field({
    type: [DraftFootballPlayerStats],
    description:
      'Career football stat totals (passing/rushing/receiving/kicking) for football players with at least one stat row. Football analogue of GetDraftPlayerStats (LS-9478).',
    resolve: async (_parent, _args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const rows = await context.db
        .select({
          playerId: PublicSchema.players.id,
          passYds: PublicSchema.careerFootballPassing.yds,
          passTd: PublicSchema.careerFootballPassing.td,
          rushYds: PublicSchema.careerFootballRushing.yds,
          rushTd: PublicSchema.careerFootballRushing.td,
          rec: PublicSchema.careerFootballReceiving.rec,
          recTd: PublicSchema.careerFootballReceiving.td,
          fg: PublicSchema.careerFootballKicking.fgm,
        })
        .from(PublicSchema.players)
        .leftJoin(
          PublicSchema.careerFootballPassing,
          eq(
            PublicSchema.careerFootballPassing.playerId,
            PublicSchema.players.id,
          ),
        )
        .leftJoin(
          PublicSchema.careerFootballRushing,
          eq(
            PublicSchema.careerFootballRushing.playerId,
            PublicSchema.players.id,
          ),
        )
        .leftJoin(
          PublicSchema.careerFootballReceiving,
          eq(
            PublicSchema.careerFootballReceiving.playerId,
            PublicSchema.players.id,
          ),
        )
        .leftJoin(
          PublicSchema.careerFootballKicking,
          eq(
            PublicSchema.careerFootballKicking.playerId,
            PublicSchema.players.id,
          ),
        )
        .where(
          and(
            eq(PublicSchema.players.sport, 'football'),
            or(
              isNotNull(PublicSchema.careerFootballPassing.playerId),
              isNotNull(PublicSchema.careerFootballRushing.playerId),
              isNotNull(PublicSchema.careerFootballReceiving.playerId),
              isNotNull(PublicSchema.careerFootballKicking.playerId),
            ),
          ),
        );

      return rows;
    },
  }),
);

/**
 * Query: Get draft team order
 * Returns the ordered list of teams assigned to draft slots, sorted by draftOrder.
 * Requires league read access (member, or spectator of a public league).
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

      // Members, spectators of public leagues, and admins may read (LS-8939)
      await authorizeDraft(context, draftId, 'read');

      // Seats joined with team name, in slot order. `seat_name` is not used:
      // it snapshots the team name at seat creation, and this field has always
      // reported the team's current name (LS-10074).
      const rows = await context.db
        .select({
          teamId: PublicSchema.draftParticipants.teamId,
          draftOrder: PublicSchema.draftParticipants.slot,
          teamName: PublicSchema.teams.name,
        })
        .from(PublicSchema.draftParticipants)
        .innerJoin(
          PublicSchema.teams,
          eq(PublicSchema.draftParticipants.teamId, PublicSchema.teams.id),
        )
        .where(eq(PublicSchema.draftParticipants.draftId, draftId))
        .orderBy(asc(PublicSchema.draftParticipants.slot));

      // The inner join to `teams` already excludes unseated slots; the filter
      // narrows the nullable seat column for the GraphQL non-null field.
      return rows.flatMap((row) =>
        row.teamId === null
          ? []
          : [
              {
                teamId: row.teamId,
                teamName: row.teamName,
                draftOrder: row.draftOrder,
              },
            ],
      );
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

      const [draft] = await context.db
        .select()
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, draftId))
        .limit(1);

      if (!draft) return null;

      // This field answers "does MY seat auto-pick", and has always returned
      // null — never Forbidden — for a caller with no team here, including a
      // non-member. Resolve the seat without a guard to preserve that.
      const [membership] = await context.db
        .select({ teamId: PublicSchema.leagueMembers.teamId })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, requireLeagueId(draft)),
            eq(PublicSchema.leagueMembers.userId, context.user.id),
          ),
        )
        .limit(1);

      if (!membership?.teamId) return null;

      const seat = await getSeatForTeam(context.db, draftId, membership.teamId);

      return seat?.autoPick ?? null;
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
              .select()
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

        await authorizeLoadedDraft(context, draft, 'participate');

        const rows = await withTransientRetry(
          () =>
            context.db
              .select({
                teamId: PublicSchema.draftParticipants.teamId,
                autoPick: PublicSchema.draftParticipants.autoPick,
              })
              .from(PublicSchema.draftParticipants)
              .where(eq(PublicSchema.draftParticipants.draftId, draftId)),
          {
            onRetry: (attempt, detail) =>
              LOGGER.warn(
                'Retrying draft-team auto-pick read after transient DB error',
                { draftId, attempt, dbError: formatDbError(detail) },
              ),
          },
        );

        // Seats without a team belong to an unclaimed mock-draft lobby slot
        // (slice 4) and have no team-keyed auto-pick status to report.
        return rows.flatMap((row) =>
          row.teamId === null
            ? []
            : [{ teamId: row.teamId, autoPick: row.autoPick }],
        );
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

type DraftRecommendationOutput = {
  playerId: number;
  playerName: string;
  position: string;
  score: number;
  reason: string;
  /** Signal chip classifying the recommendation; null when none applies. */
  signal: DraftRecommendationSignal | null;
  topStats: Array<{ label: string; value: string }>;
};

/**
 * Football branch of getDraftRecommendations (LS-9482).
 *
 * `player_eligible_positions` has zero football rows (LS-9474 postmortem) —
 * football positions live in the `football_player_eligible_positions` view
 * instead, and (unlike baseball) it carries at most one row per player, so
 * no games-played tiebreak is needed to pick a "primary" position.
 *
 * Ranking reuses the same `effectiveFootballFpg` fallback logic the auto-pick
 * strategy uses (strategies/football.ts): a real per-player value — from
 * football_player_scoring_cache (LS-9484) or, failing that, a served
 * `projected_fantasy_points` — when present, else a position-archetype
 * baseline + per-player jitter. The baseline is for ORDERING only —
 * `topStats`/`reason` must never quote it as though it were a real
 * projection (LS-9476 postmortem).
 */

/**
 * Roster-slot quotas derived from getDefaultRosterPositions(sport,
 * defensiveFormat) (@legacy-sports/utils) rather than duplicated as a
 * literal, so this can't drift from the actual default roster. Format-aware
 * (LS-9475): a 'dst' league gets the DST-shaped default (9 slots), an 'idp'
 * league the DL/LB/DB-shaped default (14 slots) — using the wrong shape
 * would silently misreport positional need for whichever format the league
 * doesn't use.
 */
function getRosterSlotsFootball(
  defensiveFormat: string | null,
): Readonly<Record<string, number>> {
  return Object.freeze(
    getDefaultRosterPositions('football', defensiveFormat).reduce<
      Record<string, number>
    >((quotas, slot) => {
      quotas[slot] = (quotas[slot] ?? 0) + 1;
      return quotas;
    }, {}),
  );
}

export async function getFootballDraftRecommendations(
  db: PublicDb,
  draftId: number,
  leagueId: number,
  teamPickedIds: number[],
  defensiveFormat: string | null,
): Promise<DraftRecommendationOutput[]> {
  const excludeClause = sql`AND NOT EXISTS (
    SELECT 1 FROM public.draft_picks dp
    WHERE dp.draft_id = ${draftId} AND dp.player_id = p.id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.league_id = ${leagueId} AND tm.player_id = p.id
  )`;

  const statsResult = await db.execute(sql`
    SELECT
      p.id AS player_id,
      p.first_name,
      p.last_name,
      fpep.position AS primary_position,
      COALESCE(cs_league.avg_ppg, cs_default.avg_ppg, p.projected_fantasy_points::numeric) AS projected_fantasy_points
    FROM public.players p
    JOIN public.football_player_eligible_positions fpep ON fpep.player_id = p.id
    LEFT JOIN public.football_player_scoring_cache cs_league
      ON cs_league.player_id = p.id AND cs_league.league_id = ${leagueId}
    LEFT JOIN public.football_player_scoring_cache cs_default
      ON cs_default.player_id = p.id AND cs_default.league_id IS NULL
    WHERE p.sport = 'football'
    ${excludeClause}
  `);

  const positionCount: Record<string, number> = {};
  if (teamPickedIds.length > 0) {
    const pickedIdParams = sql.join(
      teamPickedIds.map((id) => sql`${id}`),
      sql`, `,
    );
    const rosterPositionsResult = await db.execute(sql`
      SELECT fpep.player_id, fpep.position
      FROM public.football_player_eligible_positions fpep
      WHERE fpep.player_id IN (${pickedIdParams})
    `);
    for (const row of rosterPositionsResult.rows as {
      player_id: number;
      position: string;
    }[]) {
      positionCount[row.position] = (positionCount[row.position] ?? 0) + 1;
    }
  }

  type FootballPlayerRow = {
    player_id: number;
    first_name: string;
    last_name: string;
    primary_position: string;
    projected_fantasy_points: number | null;
  };

  type Candidate = {
    id: number;
    name: string;
    position: string;
    fpg: number;
    projected: boolean;
  };

  const candidates: Candidate[] = [];
  for (const row of statsResult.rows as unknown as FootballPlayerRow[]) {
    const info: PlayerDraftInfo = {
      fpg: row.projected_fantasy_points ?? 0,
      positions: [row.primary_position],
    };
    candidates.push({
      id: row.player_id,
      name: `${row.first_name} ${row.last_name}`.trim(),
      position: row.primary_position,
      fpg: effectiveFootballFpg(info, row.player_id),
      projected: info.fpg > 0,
    });
  }

  if (candidates.length === 0) return [];

  const minMaxNorm =
    (values: number[]) =>
    (v: number): number => {
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min;
      if (range === 0) return 0.5;
      return (v - min) / range;
    };
  const normFpg = minMaxNorm(candidates.map((c) => c.fpg));

  const rosterSlotsFootball = getRosterSlotsFootball(defensiveFormat);
  const getPositionalNeed = (position: string): number => {
    const quota = rosterSlotsFootball[position] ?? 1;
    const have = positionCount[position] ?? 0;
    if (have === 0) return 1.0;
    if (have < quota) return 0.5;
    return 0.0;
  };

  const availableByPos: Record<string, number> = {};
  for (const c of candidates) {
    availableByPos[c.position] = (availableByPos[c.position] ?? 0) + 1;
  }
  const maxCountAnyPos = Math.max(...Object.values(availableByPos), 1);
  const getScarcity = (position: string): number => {
    const count = availableByPos[position] ?? 0;
    return 1 - count / maxCountAnyPos;
  };

  // normFpg() re-derives the pool min/max on every call, so the stat score is
  // computed once per candidate here and reused by both the tier-break pass
  // and the scoring pass below rather than twice per candidate (LS-9855).
  const scored = candidates.map((c) => ({ c, statScore: normFpg(c.fpg) }));

  // Tier breaks are computed across the whole remaining pool at each position,
  // before the top-5 slice, because the production cliff that matters is the
  // one to the next player a drafter could actually take (LS-9855).
  const tierBreakIds = findTierBreakCandidateIds(
    scored.map(({ c, statScore }) => ({
      id: c.id,
      position: c.position,
      statScore,
    })),
  );

  return scored
    .map(({ c, statScore }) => {
      const posNeed = getPositionalNeed(c.position);
      const scarcity = getScarcity(c.position);
      const score = statScore * 0.5 + posNeed * 0.3 + scarcity * 0.2;
      const signal = deriveDraftRecommendationSignal({
        positionalNeed: posNeed,
        scarcity,
        statScore,
        isTierBreak: tierBreakIds.has(c.id),
      });

      const topStats: Array<{ label: string; value: string }> = [
        { label: 'Position', value: c.position },
      ];
      if (c.projected) {
        topStats.push({ label: 'Proj FPG', value: c.fpg.toFixed(1) });
      }

      let reason: string;
      if (posNeed === 1.0) {
        reason = `Fills your empty ${c.position} slot`;
      } else if (posNeed === 0.5) {
        reason = `Adds depth at ${c.position}`;
      } else if (scarcity > 0.7) {
        reason = `Only ${availableByPos[c.position] ?? 0} ${c.position}s left`;
      } else {
        reason = `Top rated ${c.position} available`;
      }

      return {
        playerId: c.id,
        playerName: c.name,
        position: c.position,
        score,
        reason,
        signal,
        topStats,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

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

      // Verify the draft exists and the caller may draft in it.
      const { draft, membership } = await authorizeDraft(
        context,
        draftId,
        'participate',
      );

      // Recommendations are keyed by league team, so they exist only for a
      // league draft (LS-10076).
      const leagueId = requireLeagueId(draft);

      // Recommendations expose a team's projected draft strategy and positional
      // needs. Only the team's own member — or a league commissioner/owner —
      // may view them; otherwise any league member could poll for every
      // opposing team during the draft (LS-2495).
      if (
        !membership ||
        (membership.teamId !== teamId && !isCommissionerOrOwner(membership))
      ) {
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

      // Football reads a disjoint set of tables (LS-9482) — the baseball
      // pool query below unconditionally gates on player_eligible_positions,
      // which has zero football rows (LS-9474 postmortem), so branch before
      // any of it runs rather than let the query silently return nothing.
      const [league] = await context.db
        .select({
          sport: PublicSchema.leagues.sport,
          defensiveFormat: PublicSchema.leagues.defensiveFormat,
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, leagueId))
        .limit(1);
      if (!league) {
        // draft.leagueId is a foreign key into leagues — a draft that
        // resolved above can never legitimately point at a missing league,
        // so this is a data-integrity failure to alert on, not a client
        // mistake (UserInputError would misreport it as bad user input).
        LOGGER.error(
          'getDraftRecommendations: league not found for draft',
          new Error('League not found for draft'),
          { draftId, leagueId: draft.leagueId },
        );
        throw new GraphQLError('An internal server error occurred', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
      if (league.sport === 'football') {
        return getFootballDraftRecommendations(
          context.db,
          draftId,
          leagueId,
          teamPickedIds,
          league.defensiveFormat,
        );
      }

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

      // LS-8674: also exclude players already rostered in this league (kept
      // players) — a no-op for redraft leagues, whose rosters are empty at
      // draft time.
      const excludeClause = sql`AND NOT EXISTS (
        SELECT 1 FROM public.draft_picks dp
        WHERE dp.draft_id = ${draftId} AND dp.player_id = p.id
      ) AND NOT EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.league_id = ${draft.leagueId} AND tm.player_id = p.id
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

      // Tier breaks are computed across the whole scored pool at each position,
      // before the top-5 slice, because the production cliff that matters is
      // the one to the next player a drafter could actually take (LS-9855).
      const tierBreakIds = findTierBreakCandidateIds(
        scored.map(({ player, statScore }) => ({
          id: player.id,
          position: player.position,
          statScore,
        })),
      );

      return scored
        .map(({ player, statScore }) => {
          const posNeed = getPositionalNeed(player.position);
          const scarcity = getScarcity(player.position);
          const score = statScore * 0.5 + posNeed * 0.3 + scarcity * 0.2;
          const signal = deriveDraftRecommendationSignal({
            positionalNeed: posNeed,
            scarcity,
            statScore,
            isTierBreak: tierBreakIds.has(player.id),
          });

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
            signal,
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
            eq(PublicSchema.leagueMembers.leagueId, requireLeagueId(draft)),
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
