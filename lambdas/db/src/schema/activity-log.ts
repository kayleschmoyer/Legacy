/**
 * League Activity Log — Query resolvers (LS-356)
 *
 * Queries: leagueActivity
 *
 * Returns a chronological feed of league events (trades, waiver claims,
 * draft picks, announcements) from the `league_activity_log` table.
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { builder } from './builder';
import { AuthenticationError, ForbiddenError } from './graphql-errors';

// ── GraphQL enum ───────────────────────────────────────────────────────────

const LeagueActivityEventTypeEnum = builder.enumType(
  'LeagueActivityEventType',
  {
    values: [
      'trade_proposed',
      'trade_accepted',
      'trade_rejected',
      'trade_cancelled',
      'trade_vetoed',
      'waiver_claimed',
      'waiver_cancelled',
      'draft_pick_made',
      'league_announcement',
    ] as const,
    description: 'Type of activity event in a league',
  },
);

// ── Object type ────────────────────────────────────────────────────────────

const LeagueActivityEvent = builder.objectRef<{
  id: number;
  leagueId: number;
  teamId: number | null;
  actorUserId: number | null;
  eventType: (typeof PublicSchema.leagueActivityEventType.enumValues)[number];
  payload: Record<string, unknown>;
  occurredAt: string;
}>('LeagueActivityEvent');

builder.objectType(LeagueActivityEvent, {
  description: "A single activity event in a league's timeline",
  fields: (t) => ({
    id: t.exposeID('id'),
    leagueId: t.exposeInt('leagueId'),
    teamId: t.exposeInt('teamId', { nullable: true }),
    actorUserId: t.exposeInt('actorUserId', { nullable: true }),
    eventType: t.field({
      type: LeagueActivityEventTypeEnum,
      resolve: (e) => e.eventType,
    }),
    /** JSON payload serialised as a string for flexibility */
    payload: t.string({
      resolve: (e) => JSON.stringify(e.payload),
    }),
    occurredAt: t.exposeString('occurredAt'),
    /** Actor's username — resolved via DataLoader */
    actorUsername: t.string({
      nullable: true,
      resolve: async (e, _args, context) => {
        if (!e.actorUserId) return null;
        const user = await context.loaders.users.load(e.actorUserId);
        return user?.username ?? null;
      },
    }),
  }),
});

// ── Query ──────────────────────────────────────────────────────────────────

builder.queryField('leagueActivity', (t) =>
  t.field({
    type: [LeagueActivityEvent],
    description:
      'Paginated activity timeline for a league, newest first. ' +
      'Optionally filter by one or more event types.',
    args: {
      leagueId: t.arg.int({ required: true }),
      limit: t.arg.int({ required: false, defaultValue: 20 }),
      eventTypes: t.arg({
        type: [LeagueActivityEventTypeEnum],
        required: false,
      }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { leagueId } = args;
      const limit = Math.min(args.limit ?? 20, 100);

      // Verify the caller is a member of the league
      const membership = await context.db
        .select({ id: PublicSchema.leagueMembers.leagueId })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, context.user.id),
          ),
        )
        .limit(1);

      if (membership.length === 0) {
        throw ForbiddenError('Not a member of this league');
      }

      try {
        const whereClause =
          args.eventTypes && args.eventTypes.length > 0
            ? and(
                eq(PublicSchema.leagueActivityLog.leagueId, leagueId),
                inArray(
                  PublicSchema.leagueActivityLog.eventType,
                  args.eventTypes,
                ),
              )
            : eq(PublicSchema.leagueActivityLog.leagueId, leagueId);

        const rows = await context.db
          .select()
          .from(PublicSchema.leagueActivityLog)
          .where(whereClause)
          .orderBy(desc(PublicSchema.leagueActivityLog.occurredAt))
          .limit(limit);

        return rows.map((row) => ({
          id: row.id,
          leagueId: row.leagueId,
          teamId: row.teamId ?? null,
          actorUserId: row.actorUserId ?? null,
          eventType: row.eventType,
          payload: (row.payload as Record<string, unknown>) ?? {},
          occurredAt:
            row.occurredAt instanceof Date
              ? row.occurredAt.toISOString()
              : String(row.occurredAt),
        }));
      } catch (err) {
        LOGGER.error('Error fetching league activity', {
          leagueId,
          err: err instanceof Error ? err.message : String(err),
        });
        throw new Error('Failed to fetch league activity');
      }
    },
  }),
);
