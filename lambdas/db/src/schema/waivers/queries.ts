/**
 * Waivers domain — Query resolvers
 *
 * Queries: freeAgents, teamWaiverClaims
 */
import {
  careerGamesCondition,
  careerSeasonsCondition,
  PublicSchema,
} from '@legacy-sports/db-client';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { WaiverClaim } from './types';
import { PlayerRef } from '../players';
import { builder } from '../builder';
import { AuthenticationError } from '../graphql-errors';

// ── Query resolvers ────────────────────────────────────────────────────────

/**
 * Returns players eligible for the given league who are not currently on any
 * team's roster. Used by the waiver claim UI to populate the free-agent list.
 */
builder.queryField('freeAgents', (t) =>
  t.field({
    type: [PlayerRef],
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const db = context.db;
      const { leagueId } = args;

      // Fetch league player-pool settings
      const [league] = await db
        .select({
          minCareerGames: PublicSchema.leagues.minCareerGames,
          minCareerSeasons: PublicSchema.leagues.minCareerSeasons,
          playerPool: PublicSchema.leagues.playerPool,
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, leagueId))
        .limit(1);

      if (!league) {
        throw new Error('League not found');
      }

      // Build JOIN clauses and WHERE conditions for the free-agent query.
      // JOINs replace correlated subqueries for set-membership tests, which
      // are cheaper because the planner can use indexes on the joined table
      // rather than re-executing the subquery once per outer row.
      const joinClauses: ReturnType<typeof sql>[] = [];
      const sqlConditions: ReturnType<typeof sql>[] = [];

      // (1) Replace NOT EXISTS correlated subquery with LEFT JOIN … IS NULL.
      //     idx_team_members_league_player (league_id, player_id) makes this
      //     an index-only look-up rather than a per-row correlated subquery.
      joinClauses.push(
        sql`LEFT JOIN public.team_members tm
          ON tm.player_id = p.id AND tm.league_id = ${leagueId}`,
      );
      sqlConditions.push(sql`tm.player_id IS NULL`);

      // (2) Replace IN (SELECT DISTINCT …) with a derived-table JOIN.
      //     idx_season_batting_lgid_playerid (lg_id, player_id) covers the
      //     GROUP BY scan; the non-correlated derived table avoids repeating
      //     the DISTINCT full-scan once per player row.
      if (league.playerPool && league.playerPool !== 'all') {
        const poolUpper = league.playerPool.toUpperCase();
        joinClauses.push(
          sql`JOIN (
            SELECT player_id FROM public.season_batting
            WHERE lg_id = ${poolUpper}
            GROUP BY player_id
          ) sb_pool ON sb_pool.player_id = p.id`,
        );
      }

      // Apply career minimums
      const minCareerGames = league.minCareerGames ?? 50;
      if (minCareerGames > 0) {
        sqlConditions.push(careerGamesCondition(minCareerGames));
      }

      const minCareerSeasons = league.minCareerSeasons ?? 3;
      if (minCareerSeasons > 0) {
        sqlConditions.push(careerSeasonsCondition(minCareerSeasons));
      }

      const joinClause = sql.join(joinClauses, sql` `);
      const whereClause =
        sqlConditions.length > 0
          ? sql`WHERE ${sql.join(sqlConditions, sql` AND `)}`
          : sql``;

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

      const rawQuery = sql`
        SELECT
          p.id, p.first_name, p.last_name, p.bref_id, p.stats_last_fetched_at,
          p.all_star_selections, p.gold_gloves, p.silver_sluggers, p.mvp_awards,
          p.cy_young_awards, p.world_series_rings, p.hall_of_fame, p.rookie_of_the_year
        FROM public.players p
        ${joinClause}
        ${whereClause}
        ORDER BY p.last_name ASC, p.first_name ASC
        LIMIT 200
      `;

      const result = await db.execute(rawQuery);
      return (result.rows as unknown as RawPlayerRow[]).map((row) => ({
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
      }));
    },
  }),
);

builder.queryField('teamWaiverClaims', (t) =>
  t.field({
    type: [WaiverClaim],
    args: {
      teamId: t.arg.int({ required: true }),
      status: t.arg.string({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const db = context.db;
      const { teamId } = args;
      const statusFilter = (args.status ?? 'pending') as
        | 'pending'
        | 'processing'
        | 'completed'
        | 'failed'
        | 'cancelled';

      // Fetch claims with player name joins
      const claims = await db
        .select({
          id: PublicSchema.waiverClaims.id,
          leagueId: PublicSchema.waiverClaims.leagueId,
          teamId: PublicSchema.waiverClaims.teamId,
          userId: PublicSchema.waiverClaims.userId,
          playerId: PublicSchema.waiverClaims.playerId,
          dropPlayerId: PublicSchema.waiverClaims.dropPlayerId,
          faabBid: PublicSchema.waiverClaims.faabBid,
          status: PublicSchema.waiverClaims.status,
          errorMessage: PublicSchema.waiverClaims.errorMessage,
          processedAt: PublicSchema.waiverClaims.processedAt,
          createdAt: PublicSchema.waiverClaims.createdAt,
          playerFirstName: PublicSchema.players.firstName,
          playerLastName: PublicSchema.players.lastName,
        })
        .from(PublicSchema.waiverClaims)
        .innerJoin(
          PublicSchema.players,
          eq(PublicSchema.waiverClaims.playerId, PublicSchema.players.id),
        )
        .where(
          and(
            eq(PublicSchema.waiverClaims.teamId, teamId),
            eq(PublicSchema.waiverClaims.status, statusFilter),
          ),
        )
        .orderBy(PublicSchema.waiverClaims.createdAt);

      // Resolve drop player names in a second pass
      const dropPlayerIds = claims
        .map((c) => c.dropPlayerId)
        .filter((id): id is number => id != null);

      let dropPlayerMap: Record<number, string> = {};
      if (dropPlayerIds.length > 0) {
        const dropPlayers = await db
          .select({
            id: PublicSchema.players.id,
            firstName: PublicSchema.players.firstName,
            lastName: PublicSchema.players.lastName,
          })
          .from(PublicSchema.players)
          .where(inArray(PublicSchema.players.id, dropPlayerIds));

        dropPlayerMap = Object.fromEntries(
          dropPlayers.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim()]),
        );
      }

      return claims.map((c) => {
        const { playerFirstName, playerLastName, ...claim } = c;
        return {
          ...claim,
          playerName: `${playerFirstName} ${playerLastName}`.trim(),
          dropPlayerName: c.dropPlayerId
            ? (dropPlayerMap[c.dropPlayerId] ?? null)
            : null,
        };
      });
    },
  }),
);
