/**
 * League Activity Log — Query resolvers (LS-356)
 *
 * Queries: leagueActivity, leagueActivityCounts
 *
 * Returns a chronological feed of league events (trades, waiver claims,
 * draft picks, announcements) from the `league_activity_log` table.
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, count, desc, eq, inArray, ne } from 'drizzle-orm';

import { builder, type Context } from './builder';
import { AuthenticationError, ForbiddenError } from './graphql-errors';
import { resolvePlayerNames } from '../services/activity-log';

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
      'waiver_claim_approved',
      'waiver_claim_rejected',
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

const LeagueActivityTypeCount = builder.objectRef<{
  eventType: (typeof PublicSchema.leagueActivityEventType.enumValues)[number];
  count: number;
}>('LeagueActivityTypeCount');

builder.objectType(LeagueActivityTypeCount, {
  description: 'Total number of activity events of one type in a league',
  fields: (t) => ({
    eventType: t.field({
      type: LeagueActivityEventTypeEnum,
      resolve: (c) => c.eventType,
    }),
    count: t.exposeInt('count'),
  }),
});

// ── Helpers ────────────────────────────────────────────────────────────────

/** Throws unless the caller is signed in and a member of the league. */
async function assertLeagueMember(
  context: Context,
  leagueId: number,
): Promise<void> {
  if (!context.user) {
    throw AuthenticationError();
  }

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
}

/**
 * `waiver_claimed` is written when a blind claim is *submitted*, so exposing
 * it would leak pending claims to the whole league. Members see the outcome
 * (`waiver_claim_approved` / `waiver_claim_rejected`) instead (LS-10527).
 */
const notPendingClaim = ne(
  PublicSchema.leagueActivityLog.eventType,
  'waiver_claimed',
);

const WAIVER_OUTCOME_TYPES = new Set<string>([
  'waiver_claim_approved',
  'waiver_claim_rejected',
]);

/**
 * Events written before names were saved with the payload only carry player
 * IDs; look the names up at read time so the feed never shows a bare ID.
 */
async function withWaiverPlayerNames<
  T extends { eventType: string; payload: Record<string, unknown> },
>(context: Context, rows: T[]): Promise<T[]> {
  const missing = rows.filter(
    (r) =>
      WAIVER_OUTCOME_TYPES.has(r.eventType) &&
      (typeof r.payload['playerName'] !== 'string' ||
        (typeof r.payload['dropPlayerId'] === 'number' &&
          typeof r.payload['dropPlayerName'] !== 'string')),
  );
  if (missing.length === 0) return rows;

  const names = await resolvePlayerNames(
    context,
    missing.flatMap((r) => [
      r.payload['playerId'] as number | undefined,
      r.payload['dropPlayerId'] as number | undefined,
    ]),
  );
  return rows.map((r) => {
    if (!missing.includes(r)) return r;
    const { playerId, dropPlayerId } = r.payload;
    const playerName =
      typeof playerId === 'number' ? names.get(playerId) : undefined;
    const dropPlayerName =
      typeof dropPlayerId === 'number' ? names.get(dropPlayerId) : undefined;
    return {
      ...r,
      payload: {
        ...r.payload,
        ...(typeof r.payload['playerName'] !== 'string' &&
          playerName && { playerName }),
        ...(typeof r.payload['dropPlayerName'] !== 'string' &&
          dropPlayerName && { dropPlayerName }),
      },
    };
  });
}

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
      const { leagueId } = args;
      const limit = Math.min(args.limit ?? 20, 100);

      await assertLeagueMember(context, leagueId);

      try {
        const whereClause =
          args.eventTypes && args.eventTypes.length > 0
            ? and(
                eq(PublicSchema.leagueActivityLog.leagueId, leagueId),
                notPendingClaim,
                inArray(
                  PublicSchema.leagueActivityLog.eventType,
                  args.eventTypes,
                ),
              )
            : and(
                eq(PublicSchema.leagueActivityLog.leagueId, leagueId),
                notPendingClaim,
              );

        const rows = await context.db
          .select()
          .from(PublicSchema.leagueActivityLog)
          .where(whereClause)
          .orderBy(desc(PublicSchema.leagueActivityLog.occurredAt))
          .limit(limit);

        const events = rows.map((row) => ({
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

        return await withWaiverPlayerNames(context, events);
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

// Per-type totals so the feed's filter chips reflect the whole league history,
// not just the loaded page (LS-10686).
builder.queryField('leagueActivityCounts', (t) =>
  t.field({
    type: [LeagueActivityTypeCount],
    description:
      'Total number of activity events per event type for a league. ' +
      'Types with no events are omitted.',
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      const { leagueId } = args;
      await assertLeagueMember(context, leagueId);

      try {
        const rows = await context.db
          .select({
            eventType: PublicSchema.leagueActivityLog.eventType,
            count: count(),
          })
          .from(PublicSchema.leagueActivityLog)
          .where(
            and(
              eq(PublicSchema.leagueActivityLog.leagueId, leagueId),
              notPendingClaim,
            ),
          )
          .groupBy(PublicSchema.leagueActivityLog.eventType);

        return rows.map((row) => ({
          eventType: row.eventType,
          count: Number(row.count),
        }));
      } catch (err) {
        LOGGER.error('Error fetching league activity counts', {
          leagueId,
          err: err instanceof Error ? err.message : String(err),
        });
        throw new Error('Failed to fetch league activity counts');
      }
    },
  }),
);
