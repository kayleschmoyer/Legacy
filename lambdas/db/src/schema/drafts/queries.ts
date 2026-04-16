/**
 * Draft domain — query fields
 */

import {
  careerGamesCondition,
  careerSeasonsCondition,
  PublicSchema,
} from '@legacy-sports/db-client';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { getCurrentDraftPickInfo } from './helpers';
import {
  CurrentDraftPick,
  Draft,
  DraftPick,
  DraftPlayer,
  DraftQueueEntry,
  DraftRecommendation,
  DraftTeamAutoPickStatus,
  DraftTeamOrderEntry,
} from './types';
import { verifyLeagueMembership } from '../authorization';
import { builder } from '../builder';
import { AuthenticationError } from '../graphql-errors';

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

      // Verify user is a member of the league owning this draft
      const [draft] = await context.db
        .select({ leagueId: PublicSchema.drafts.leagueId })
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, args.draftId))
        .limit(1);

      if (!draft) {
        throw new Error('Draft not found');
      }

      await verifyLeagueMembership(context.db, draft.leagueId, context.user.id);

      const picks = await context.db
        .select()
        .from(PublicSchema.draftPicks)
        .where(eq(PublicSchema.draftPicks.draftId, args.draftId))
        .orderBy(asc(PublicSchema.draftPicks.overallPick));

      return picks;
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
        throw new Error('Draft not found');
      }

      // Verify user is a member of this league
      await verifyLeagueMembership(context.db, draft.leagueId, context.user.id);

      // Get league's player pool setting and career minimums
      const [league] = await context.db
        .select({
          playerPool: PublicSchema.leagues.playerPool,
          minCareerGames: PublicSchema.leagues.minCareerGames,
          minCareerSeasons: PublicSchema.leagues.minCareerSeasons,
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

      // Apply player pool filter (AL/NL restriction)
      if (league && league.playerPool !== 'all') {
        const poolUpper = league.playerPool.toUpperCase();
        sqlConditions.push(
          sql`EXISTS (
            SELECT 1 FROM season_batting sb
            WHERE sb.player_id = p.id AND sb.lg_id = ${poolUpper}
          )`,
        );
      }

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

      // Apply career games minimum (defaults to 50 if the league has no setting)
      const minCareerGames = league?.minCareerGames ?? 50;
      if (minCareerGames > 0) {
        sqlConditions.push(careerGamesCondition(minCareerGames));
      }

      // Apply career seasons minimum (defaults to 3 if the league has no setting)
      const minCareerSeasons = league?.minCareerSeasons ?? 3;
      if (minCareerSeasons > 0) {
        sqlConditions.push(careerSeasonsCondition(minCareerSeasons));
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
      // Computes hitter/pitching PPG as (category score) / career_games, matching the field
      // descriptions on DraftPlayer and including fielding in the hitter figure.
      const basePlayerSelectWithScoring = sql`
        SELECT
          p.id, p.first_name, p.last_name, p.bref_id,
          p.stats_last_fetched_at, p.all_star_selections, p.gold_gloves,
          p.silver_sluggers, p.mvp_awards, p.cy_young_awards,
          p.world_series_rings, p.hall_of_fame, p.rookie_of_the_year,
          COALESCE(
            (COALESCE(cs.batting_score, 0) + COALESCE(cs.fielding_score, 0))
            / NULLIF(cs.career_games, 0), 0
          ) AS hitter_avg_ppg,
          COALESCE(
            COALESCE(cs.pitching_score, 0) / NULLIF(cs.career_games, 0), 0
          ) AS pitching_avg_ppg
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
        // Aliases defined in basePlayerSelectWithScoring; avoids duplication.
        hitterAvgPointsPerGame: 'hitter_avg_ppg',
        pitchingAvgPointsPerGame: 'pitching_avg_ppg',
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
        throw new Error('Authentication required');
      }

      const { draftId } = args;

      // Verify draft exists and user is a league member
      const [draft] = await context.db
        .select({ leagueId: PublicSchema.drafts.leagueId })
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, draftId))
        .limit(1);

      if (!draft) {
        throw new Error('Draft not found');
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
        throw new Error('Authentication required');
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
        throw new Error('Authentication required');
      }

      const { draftId } = args;

      // Verify the draft exists and the caller is a league member
      const [draft] = await context.db
        .select({ leagueId: PublicSchema.drafts.leagueId })
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, draftId))
        .limit(1);

      if (!draft) {
        throw new Error('Draft not found');
      }

      await verifyLeagueMembership(context.db, draft.leagueId, context.user.id);

      const rows = await context.db
        .select({
          teamId: PublicSchema.draftTeams.teamId,
          autoPick: PublicSchema.draftTeams.autoPick,
        })
        .from(PublicSchema.draftTeams)
        .where(eq(PublicSchema.draftTeams.draftId, draftId));

      return rows.map((row) => ({
        teamId: row.teamId,
        autoPick: row.autoPick,
      }));
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
      const { draftId, teamId } = args;

      // Verify draft exists and caller is a league member
      const [draft] = await context.db
        .select({ leagueId: PublicSchema.drafts.leagueId })
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, draftId))
        .limit(1);
      if (!draft) throw new Error('Draft not found');
      await verifyLeagueMembership(context.db, draft.leagueId, context.user.id);

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
 * Returns entries ordered by priority ASC. Only visible to the authenticated
 * user who owns the team in this draft.
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
      if (!draft) throw new Error('Draft not found');

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
      if (!membership?.teamId) throw new Error('You are not in this league');

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
