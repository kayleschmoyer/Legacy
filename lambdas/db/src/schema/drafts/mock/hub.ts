/**
 * Mock Drafts hub queries (LS-10079, slice 7 of epic LS-9252).
 *
 * - `publicMockDrafts` — the "Join a draft" tab: public ONLINE lobbies that
 *   have not started, have not expired and still have a seat a stranger can
 *   take. Never full, started, expired, private or offline drafts.
 * - `myMockDrafts` — the "My mock drafts" tab: every mock draft the caller
 *   holds a seat in, lobbies and live drafts to resume, completed ones to
 *   review.
 *
 * Both are keyset-paginated, so a lobby that fills or starts between two page
 * fetches drops off without shifting the rows the next page returns.
 */

import { PublicSchema } from '@legacy-sports/db-client';
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';

import { isValidPlayerPool, type MockPlayerPool } from './shared';
import { builder } from '../../builder';
import { AuthenticationError, UserInputError } from '../../graphql-errors';
import { SportKindEnum } from '../../leagues/types';
import { MockDraftModeEnum } from '../types';

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

const { drafts, mockDraftSettings, users } = PublicSchema;

function pageSizeOf(first: number | null | undefined): number {
  return Math.min(Math.max(first ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
}

// ── Seat counts ─────────────────────────────────────────────────────────────
//
// The SQL twin of `getSeatAvailability` (shared.ts), so a page is one query
// instead of one per lobby: an open seat is `controller = 'open'` with no
// holder, minus the slots a pending, unexpired invitation reserves.

function openSeatsSql(now: Date): SQL<number> {
  return sql<number>`(
    SELECT count(*)::int FROM draft_participants dp
    WHERE dp.draft_id = ${drafts.id}
      AND dp.user_id IS NULL
      AND dp.controller = 'open'
      AND NOT EXISTS (
        SELECT 1 FROM invitations i
        WHERE i.draft_id = dp.draft_id
          AND i.reserved_slot = dp.slot
          AND i.status = 'pending'
          AND (i.expires_at IS NULL OR i.expires_at > ${now.toISOString()}::timestamptz)
      )
  )`;
}

const filledSeatsSql = sql<number>`(
  SELECT count(*)::int FROM draft_participants dp
  WHERE dp.draft_id = ${drafts.id} AND dp.user_id IS NOT NULL
)`;

const totalSeatsSql = sql<number>`(
  SELECT count(*)::int FROM draft_participants dp
  WHERE dp.draft_id = ${drafts.id}
)`;

function viewerSeatedSql(userId: number): SQL {
  return sql`EXISTS (
    SELECT 1 FROM draft_participants dp
    WHERE dp.draft_id = ${drafts.id} AND dp.user_id = ${userId}
  )`;
}

// ── publicMockDrafts ────────────────────────────────────────────────────────

export interface PublicMockDraftShape {
  draftId: number;
  sport: 'baseball' | 'football';
  hostUsername: string;
  playerPool: string;
  filledSeats: number;
  totalSeats: number;
  openSeats: number;
  pickTimeLimitSeconds: number;
  rounds: number;
  lobbyExpiresAt: Date | null;
  createdAt: Date;
}

interface PublicMockDraftConnectionShape {
  nodes: PublicMockDraftShape[];
  endCursor: string | null;
  hasNextPage: boolean;
}

const PublicMockDraft = builder
  .objectRef<PublicMockDraftShape>('PublicMockDraft')
  .implement({
    description:
      'A public online mock-draft lobby with an open seat (LS-10079). Only ' +
      'what a stranger browsing the list may see.',
    fields: (t) => ({
      draftId: t.exposeInt('draftId'),
      sport: t.field({ type: SportKindEnum, resolve: (d) => d.sport }),
      hostUsername: t.exposeString('hostUsername'),
      playerPool: t.exposeString('playerPool'),
      filledSeats: t.exposeInt('filledSeats'),
      totalSeats: t.exposeInt('totalSeats'),
      openSeats: t.exposeInt('openSeats', {
        description: 'Open seats minus pending invite reservations.',
      }),
      pickTimeLimitSeconds: t.exposeInt('pickTimeLimitSeconds'),
      rounds: t.exposeInt('rounds'),
      lobbyExpiresAt: t.string({
        nullable: true,
        resolve: (d) => d.lobbyExpiresAt?.toISOString() ?? null,
      }),
      createdAt: t.string({ resolve: (d) => d.createdAt.toISOString() }),
    }),
  });

const PublicMockDraftConnection = builder
  .objectRef<PublicMockDraftConnectionShape>('PublicMockDraftConnection')
  .implement({
    description:
      'A page of public mock-draft lobbies, newest first. Pass `endCursor` ' +
      'back as `after` for the next page.',
    fields: (t) => ({
      nodes: t.field({ type: [PublicMockDraft], resolve: (c) => c.nodes }),
      endCursor: t.exposeString('endCursor', { nullable: true }),
      hasNextPage: t.exposeBoolean('hasNextPage'),
    }),
  });

/**
 * Cursor for the public list: the last row's `created_at` and id. The
 * timestamp travels as Postgres' own text rendering, so it keeps the
 * microseconds a JS `Date` would drop — with milliseconds only, a lobby
 * created in the same millisecond as the page boundary could be skipped.
 */
interface PublicCursor {
  createdAt: string;
  id: number;
}

export function encodePublicCursor(cursor: PublicCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.id])).toString(
    'base64',
  );
}

export function decodePublicCursor(
  after: string | null | undefined,
): PublicCursor | null {
  if (!after) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(after, 'base64').toString('utf8'));
  } catch {
    throw UserInputError('Invalid cursor');
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 2 ||
    typeof parsed[0] !== 'string' ||
    Number.isNaN(Date.parse(parsed[0])) ||
    !Number.isInteger(parsed[1]) ||
    (parsed[1] as number) <= 0
  ) {
    throw UserInputError('Invalid cursor');
  }
  return { createdAt: parsed[0], id: parsed[1] as number };
}

builder.queryField('publicMockDrafts', (t) =>
  t.field({
    type: PublicMockDraftConnection,
    description:
      'Public ONLINE mock-draft lobbies a signed-in user can join by id ' +
      '(LS-10079): not started, not expired, at least one open unreserved ' +
      'seat, and not one the caller already sits in. Newest first, ' +
      'cursor-paged.',
    args: {
      sport: t.arg({ type: SportKindEnum, required: true }),
      playerPool: t.arg.string({
        required: false,
        description:
          'Only lobbies drafting this pool; every pool when omitted.',
      }),
      first: t.arg.int({ required: false }),
      after: t.arg.string({ required: false }),
    },
    resolve: async (
      _parent,
      args,
      context,
    ): Promise<PublicMockDraftConnectionShape> => {
      if (!context.user) {
        throw AuthenticationError('Authentication required');
      }
      const requestedPool = args.playerPool?.trim() || null;
      let playerPool: MockPlayerPool | null = null;
      if (requestedPool !== null) {
        if (!isValidPlayerPool(requestedPool)) {
          throw UserInputError(`Unknown player pool: ${requestedPool}`);
        }
        playerPool = requestedPool;
      }

      const now = new Date();
      const pageSize = pageSizeOf(args.first);
      const cursor = decodePublicCursor(args.after);
      const openSeats = openSeatsSql(now);

      const rows = await context.db
        .select({
          draftId: drafts.id,
          sport: drafts.sport,
          hostUsername: users.username,
          playerPool: mockDraftSettings.playerPool,
          rosterSize: mockDraftSettings.rosterSize,
          pickTimeLimitSeconds: drafts.pickTimeLimitSeconds,
          lobbyExpiresAt: drafts.lobbyExpiresAt,
          createdAt: drafts.createdAt,
          createdAtKey: sql<string>`${drafts.createdAt}::text`,
          filledSeats: filledSeatsSql,
          totalSeats: totalSeatsSql,
          openSeats,
        })
        .from(drafts)
        .innerJoin(users, eq(users.id, drafts.createdBy))
        .innerJoin(mockDraftSettings, eq(mockDraftSettings.draftId, drafts.id))
        .where(
          and(
            // These four mirror the drafts_public_mock_lobby_idx predicate,
            // and `sport` + the created_at keyset are its key columns.
            eq(drafts.kind, 'mock'),
            eq(drafts.isPublic, true),
            eq(drafts.status, 'not-started'),
            eq(drafts.sport, args.sport),
            // is_public already implies online (drafts_is_public_ck); stated
            // anyway so an offline draft can never surface here.
            eq(drafts.mockMode, 'online'),
            gt(drafts.lobbyExpiresAt, now),
            sql`${openSeats} > 0`,
            sql`NOT ${viewerSeatedSql(context.user.id)}`,
            playerPool !== null
              ? eq(mockDraftSettings.playerPool, playerPool)
              : undefined,
            cursor !== null
              ? sql`(${drafts.createdAt}, ${drafts.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id})`
              : undefined,
          ),
        )
        .orderBy(desc(drafts.createdAt), desc(drafts.id))
        .limit(pageSize + 1);

      const page = rows.slice(0, pageSize);
      const last = page.length > 0 ? page[page.length - 1] : undefined;

      return {
        nodes: page.map((r) => ({
          draftId: r.draftId,
          sport: r.sport,
          hostUsername: r.hostUsername ?? 'A friend',
          playerPool: r.playerPool,
          filledSeats: r.filledSeats,
          totalSeats: r.totalSeats,
          openSeats: r.openSeats,
          pickTimeLimitSeconds: r.pickTimeLimitSeconds,
          rounds: r.rosterSize,
          lobbyExpiresAt: r.lobbyExpiresAt,
          createdAt: r.createdAt,
        })),
        endCursor: last
          ? encodePublicCursor({
              createdAt: last.createdAtKey,
              id: last.draftId,
            })
          : null,
        hasNextPage: rows.length > pageSize,
      };
    },
  }),
);

// ── myMockDrafts ────────────────────────────────────────────────────────────

/** How the hub groups a mock draft's `drafts.status`. */
export const MOCK_DRAFT_LIST_STATUSES = {
  lobby: ['not-started'],
  live: ['queued', 'in-progress', 'paused'],
  completed: ['completed'],
} as const;

type MockDraftListStatus = keyof typeof MOCK_DRAFT_LIST_STATUSES;

const MockDraftListStatusEnum = builder.enumType('MockDraftListStatus', {
  values: {
    LOBBY: { value: 'lobby', description: 'Online lobby, not started yet.' },
    LIVE: { value: 'live', description: 'Drafting now.' },
    COMPLETED: { value: 'completed', description: 'Finished; results only.' },
  } as const,
});

export interface MyMockDraftShape {
  draftId: number;
  sport: 'baseball' | 'football';
  status: string;
  listStatus: MockDraftListStatus;
  mode: 'offline' | 'online';
  isPublic: boolean;
  isHost: boolean;
  hostUsername: string;
  playerPool: string;
  rounds: number;
  filledSeats: number;
  totalSeats: number;
  lobbyExpiresAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
}

interface MyMockDraftConnectionShape {
  nodes: MyMockDraftShape[];
  endCursor: string | null;
  hasNextPage: boolean;
}

const MyMockDraft = builder
  .objectRef<MyMockDraftShape>('MyMockDraft')
  .implement({
    description:
      'A mock draft the caller holds a seat in (LS-10079). Lobbies and live ' +
      'drafts resume in the draft room; completed ones open their results.',
    fields: (t) => ({
      draftId: t.exposeInt('draftId'),
      sport: t.field({ type: SportKindEnum, resolve: (d) => d.sport }),
      status: t.exposeString('status', {
        description: 'The raw drafts.status.',
      }),
      listStatus: t.field({
        type: MockDraftListStatusEnum,
        resolve: (d) => d.listStatus,
      }),
      mode: t.field({ type: MockDraftModeEnum, resolve: (d) => d.mode }),
      isPublic: t.exposeBoolean('isPublic'),
      isHost: t.exposeBoolean('isHost'),
      hostUsername: t.exposeString('hostUsername'),
      playerPool: t.exposeString('playerPool'),
      rounds: t.exposeInt('rounds'),
      filledSeats: t.exposeInt('filledSeats'),
      totalSeats: t.exposeInt('totalSeats'),
      lobbyExpiresAt: t.string({
        nullable: true,
        resolve: (d) => d.lobbyExpiresAt?.toISOString() ?? null,
      }),
      createdAt: t.string({ resolve: (d) => d.createdAt.toISOString() }),
      completedAt: t.string({
        nullable: true,
        resolve: (d) => d.completedAt?.toISOString() ?? null,
      }),
    }),
  });

const MyMockDraftConnection = builder
  .objectRef<MyMockDraftConnectionShape>('MyMockDraftConnection')
  .implement({
    description:
      "A page of the caller's mock drafts, newest first. Pass `endCursor` " +
      'back as `after` for the next page.',
    fields: (t) => ({
      nodes: t.field({ type: [MyMockDraft], resolve: (c) => c.nodes }),
      endCursor: t.exposeString('endCursor', { nullable: true }),
      hasNextPage: t.exposeBoolean('hasNextPage'),
    }),
  });

function decodeIdCursor(after: string | null | undefined): number | null {
  if (!after) return null;
  const id = Number(Buffer.from(after, 'base64').toString('utf8'));
  if (!Number.isInteger(id) || id <= 0) {
    throw UserInputError('Invalid cursor');
  }
  return id;
}

function encodeIdCursor(id: number): string {
  return Buffer.from(String(id)).toString('base64');
}

export function listStatusOf(status: string): MockDraftListStatus {
  if (status === 'completed') return 'completed';
  if (status === 'not-started') return 'lobby';
  return 'live';
}

builder.queryField('myMockDrafts', (t) =>
  t.field({
    type: MyMockDraftConnection,
    description:
      'Mock drafts the caller holds a seat in (LS-10079), newest first, ' +
      'cursor-paged. Lobbies past their expiry are left out — the hourly ' +
      'job deletes them.',
    args: {
      status: t.arg({ type: MockDraftListStatusEnum, required: false }),
      first: t.arg.int({ required: false }),
      after: t.arg.string({ required: false }),
    },
    resolve: async (
      _parent,
      args,
      context,
    ): Promise<MyMockDraftConnectionShape> => {
      if (!context.user) {
        throw AuthenticationError('Authentication required');
      }
      const userId = context.user.id;
      const now = new Date();
      const pageSize = pageSizeOf(args.first);
      const afterId = decodeIdCursor(args.after);
      const statuses = args.status
        ? [...MOCK_DRAFT_LIST_STATUSES[args.status]]
        : null;

      const rows = await context.db
        .select({
          draftId: drafts.id,
          sport: drafts.sport,
          status: drafts.status,
          mode: drafts.mockMode,
          isPublic: drafts.isPublic,
          createdBy: drafts.createdBy,
          hostUsername: users.username,
          playerPool: mockDraftSettings.playerPool,
          rosterSize: mockDraftSettings.rosterSize,
          lobbyExpiresAt: drafts.lobbyExpiresAt,
          createdAt: drafts.createdAt,
          completedAt: drafts.draftCompletedAt,
          filledSeats: filledSeatsSql,
          totalSeats: totalSeatsSql,
        })
        .from(drafts)
        .innerJoin(users, eq(users.id, drafts.createdBy))
        .innerJoin(mockDraftSettings, eq(mockDraftSettings.draftId, drafts.id))
        .where(
          and(
            eq(drafts.kind, 'mock'),
            // EXISTS, not a join: Control All Teams puts the host on every
            // seat, and the draft must still list once.
            viewerSeatedSql(userId),
            statuses ? inArray(drafts.status, statuses) : undefined,
            or(
              ne(drafts.status, 'not-started'),
              isNull(drafts.lobbyExpiresAt),
              gt(drafts.lobbyExpiresAt, now),
            ),
            afterId !== null ? lt(drafts.id, afterId) : undefined,
          ),
        )
        .orderBy(desc(drafts.id))
        .limit(pageSize + 1);

      const page = rows.slice(0, pageSize);
      const last = page.length > 0 ? page[page.length - 1] : undefined;

      return {
        nodes: page.map((r) => ({
          draftId: r.draftId,
          sport: r.sport,
          status: r.status,
          listStatus: listStatusOf(r.status),
          mode: r.mode ?? 'offline',
          isPublic: r.isPublic,
          isHost: r.createdBy === userId,
          hostUsername: r.hostUsername ?? 'A friend',
          playerPool: r.playerPool,
          rounds: r.rosterSize,
          filledSeats: r.filledSeats,
          totalSeats: r.totalSeats,
          lobbyExpiresAt: r.lobbyExpiresAt,
          createdAt: r.createdAt,
          completedAt: r.completedAt,
        })),
        endCursor: last ? encodeIdCursor(last.draftId) : null,
        hasNextPage: rows.length > pageSize,
      };
    },
  }),
);
