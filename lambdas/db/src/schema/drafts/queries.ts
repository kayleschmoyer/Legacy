/**
 * Draft domain — query fields
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { asc, desc, eq, sql } from 'drizzle-orm';

import { getCurrentDraftPickInfo, verifyLeagueMembership } from './helpers';
import {
  CurrentDraftPick,
  Draft,
  DraftPick,
  DraftPlayer,
  DraftTeamOrderEntry,
} from './types';
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

      // Get already-drafted player IDs for this draft
      const drafted = await context.db
        .select({ playerId: PublicSchema.draftPicks.playerId })
        .from(PublicSchema.draftPicks)
        .where(eq(PublicSchema.draftPicks.draftId, draftId));

      const draftedIds = drafted.map((d) => d.playerId);

      // ---- Build raw SQL conditions (all reference table alias 'p') ----
      const sqlConditions: ReturnType<typeof sql>[] = [];

      // Exclude already-drafted players
      if (draftedIds.length > 0) {
        sqlConditions.push(sql`p.id NOT IN (${sql.raw(draftedIds.join(','))})`);
      }

      // Apply player pool filter (AL/NL restriction)
      if (league && league.playerPool !== 'all') {
        const poolUpper = league.playerPool.toUpperCase();
        sqlConditions.push(
          sql`p.id IN (
            SELECT DISTINCT sb.player_id FROM season_batting sb
            WHERE sb.lg_id = ${poolUpper}
          )`,
        );
      }

      // Apply optional name filter
      if (search && search.trim().length > 0) {
        const term = `%${search.trim().toLowerCase()}%`;
        sqlConditions.push(
          sql`(LOWER(p.first_name || ' ' || p.last_name) LIKE ${term})`,
        );
      }

      // Apply optional position filter (server-side)
      if (position && position.trim().length > 0) {
        const pos = position.trim().toUpperCase();
        if (pos === 'P') {
          sqlConditions.push(
            sql`p.id IN (
              SELECT player_id FROM public.player_eligible_positions
              WHERE position IN ('SP', 'RP')
            )`,
          );
        } else if (pos === 'OF') {
          sqlConditions.push(
            sql`p.id IN (
              SELECT player_id FROM public.player_eligible_positions
              WHERE position IN ('LF', 'CF', 'RF')
            )`,
          );
        } else {
          sqlConditions.push(
            sql`p.id IN (
              SELECT player_id FROM public.player_eligible_positions
              WHERE position = ${pos}
            )`,
          );
        }
      }

      // Apply career games minimum (defaults to 50 if the league has no setting)
      const minCareerGames = league?.minCareerGames ?? 50;
      if (minCareerGames > 0) {
        sqlConditions.push(
          sql`(
            NOT EXISTS (SELECT 1 FROM public.career_batting WHERE player_id = p.id)
            OR p.id IN (SELECT player_id FROM public.career_batting WHERE g >= ${minCareerGames})
          )`,
        );
      }

      // Apply career seasons minimum (defaults to 3 if the league has no setting)
      const minCareerSeasons = league?.minCareerSeasons ?? 3;
      if (minCareerSeasons > 0) {
        sqlConditions.push(
          sql`(
            NOT EXISTS (SELECT 1 FROM public.season_batting WHERE player_id = p.id AND lg_id IN ('AL', 'NL'))
            OR p.id IN (
              SELECT player_id FROM public.season_batting
              WHERE lg_id IN ('AL', 'NL')
              GROUP BY player_id
              HAVING COUNT(DISTINCT season) >= ${minCareerSeasons}
            )
          )`,
        );
      }

      const whereClause =
        sqlConditions.length > 0
          ? sql`WHERE ${sql.join(sqlConditions, sql` AND `)}`
          : sql``;
      const limitVal = sql.raw(String(resultLimit ?? 50));
      const offsetVal = sql.raw(String(resultOffset ?? 0));

      // ---- Determine ORDER BY strategy ----
      // Scoring column expressions reference the 'cs' alias from compute_career_scores
      const scoringColMap: Record<string, string> = {
        hitterAvgPointsPerGame:
          'CASE WHEN cs.career_games > 0 THEN (cs.batting_score + cs.fielding_score) / cs.career_games ELSE 0 END',
        pitchingAvgPointsPerGame:
          'CASE WHEN cs.career_games > 0 THEN cs.pitching_score / cs.career_games ELSE 0 END',
        hitterScore:
          'COALESCE(cs.batting_score, 0) + COALESCE(cs.fielding_score, 0)',
        pitchingScore: 'COALESCE(cs.pitching_score, 0)',
        battingScore: 'COALESCE(cs.batting_score, 0)',
        fieldingScore: 'COALESCE(cs.fielding_score, 0)',
        totalScore: 'COALESCE(cs.total_score, 0)',
        avgPointsPerGame: 'COALESCE(cs.avg_ppg, 0)',
      };

      const basePlayerSelect = sql`
        SELECT
          p.id, p.first_name, p.last_name, p.bref_id,
          p.stats_last_fetched_at, p.all_star_selections, p.gold_gloves,
          p.silver_sluggers, p.mvp_awards, p.cy_young_awards,
          p.world_series_rings, p.hall_of_fame, p.rookie_of_the_year
        FROM public.players p
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

      // Default and remaining scoring sorts: join compute_career_scores
      const scoringCol = sql.raw(
        scoringColMap[orderByKey] ?? scoringColMap['hitterAvgPointsPerGame'],
      );
      const rawQuery = sql`
        ${basePlayerSelect}
        LEFT JOIN public.compute_career_scores(${draft.leagueId}) cs ON p.id = cs.player_id
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
