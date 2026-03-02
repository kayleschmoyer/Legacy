/**
 * Draft domain — query fields
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { getCurrentDraftPickInfo, verifyLeagueMembership } from './helpers';
import { CurrentDraftPick, Draft, DraftPick, DraftPlayer } from './types';
import { builder } from '../builder';

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
        throw new Error('Authentication required');
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
        throw new Error('Authentication required');
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
        throw new Error('Authentication required');
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
        throw new Error('Authentication required');
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
      limit: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { draftId, search, limit: resultLimit } = args;

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

      // Build base query for available players.
      // Use NOT EXISTS against draft_picks instead of fetching all drafted IDs
      // and passing as NOT IN (...). The unique index draft_picks_uk_draft_player
      // on (draft_id, player_id) makes this an efficient index seek per candidate row.
      const baseConditions = [
        sql`NOT EXISTS (
          SELECT 1 FROM public.draft_picks dp
          WHERE dp.draft_id = ${draftId}
            AND dp.player_id = ${PublicSchema.players.id}
        )`,
      ];

      // Apply player pool filter (AL/NL restriction)
      // Uses the most recent season_batting record's lg_id to determine league affiliation
      if (league && league.playerPool !== 'all') {
        const poolUpper = league.playerPool.toUpperCase();
        baseConditions.push(
          sql`${PublicSchema.players.id} IN (
            SELECT DISTINCT sb.player_id FROM season_batting sb
            WHERE sb.lg_id = ${poolUpper}
          )`,
        );
      }

      // Apply optional name filter
      if (search && search.trim().length > 0) {
        const term = `%${search.trim().toLowerCase()}%`;
        baseConditions.push(
          sql`(LOWER(${PublicSchema.players.firstName} || ' ' || ${PublicSchema.players.lastName}) LIKE ${term})`,
        );
      }

      // Apply career games minimum (defaults to 50 if the league has no setting).
      // Rewritten as NOT EXISTS / EXISTS so the planner can use the composite
      // index idx_career_batting_player_g (player_id, g) via index seeks.
      const minCareerGames = league?.minCareerGames ?? 50;
      if (minCareerGames > 0) {
        baseConditions.push(
          sql`(
            NOT EXISTS (SELECT 1 FROM public.career_batting cb WHERE cb.player_id = ${PublicSchema.players.id})
            OR EXISTS (
              SELECT 1 FROM public.career_batting cb WHERE cb.player_id = ${PublicSchema.players.id} AND cb.g >= ${minCareerGames}
            )
          )`,
        );
      }

      // Apply career seasons minimum (defaults to 3 if the league has no setting).
      // Rewritten as NOT EXISTS / EXISTS so the planner can use the composite
      // index idx_season_batting_player_lgid_season (player_id, lg_id, season).
      const minCareerSeasons = league?.minCareerSeasons ?? 3;
      if (minCareerSeasons > 0) {
        baseConditions.push(
          sql`(
            NOT EXISTS (
              SELECT 1 FROM public.season_batting sb
              WHERE sb.player_id = ${PublicSchema.players.id}
                AND sb.lg_id IN ('AL', 'NL')
            )
            OR EXISTS (
              SELECT 1 FROM public.season_batting sb
              WHERE sb.player_id = ${PublicSchema.players.id}
                AND sb.lg_id IN ('AL', 'NL')
              GROUP BY sb.player_id
              HAVING COUNT(DISTINCT sb.season) >= ${minCareerSeasons}
            )
          )`,
        );
      }

      const query = context.db
        .select()
        .from(PublicSchema.players)
        .where(and(...baseConditions))
        .orderBy(
          asc(PublicSchema.players.lastName),
          asc(PublicSchema.players.firstName),
        )
        .limit(resultLimit ?? 50);

      return query;
    },
  }),
);
