/**
 * Mock drafts v2 — shared helpers (LS-10076, slice 4 of epic LS-9252).
 *
 * A mock draft is a `drafts` row with `kind = 'mock'` and no league: its
 * seats live in `draft_participants`, its rules in `mock_draft_settings`, its
 * chat in `draft_messages`. Nothing here writes a `leagues`, `teams` or
 * `league_members` row — that is the whole point of the slice.
 */

import { type PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { and, asc, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

import type { Context } from '../../builder';
import { UserInputError } from '../../graphql-errors';

type DraftRow = typeof PublicSchema.drafts.$inferSelect;

/**
 * An unstarted online lobby expires this long after it is created. Nobody can
 * join or start it afterwards; the hourly job then notifies its seat holders.
 */
export const MOCK_DRAFT_LOBBY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * "Offline" mock drafts never put the human's own turn on a real clock — no
 * countdown, no auto-pick-on-timeout. Rather than making
 * `drafts.pick_time_limit_seconds` nullable (a schema change touching every
 * real draft), an offline draft gets a generous sentinel deadline instead:
 * the auto-pick chain still needs a non-null deadline to expire immediately
 * for a CPU seat, and in practice the human is never kept waiting by this.
 */
export const OFFLINE_PICK_TIME_LIMIT_SECONDS = 60 * 60 * 24;

/** Default seconds per pick for an online lobby. */
export const DEFAULT_ONLINE_PICK_TIME_LIMIT_SECONDS = 30;

/** Bounds on a caller-chosen pick clock. */
export const MIN_PICK_TIME_LIMIT_SECONDS = 10;
export const MAX_PICK_TIME_LIMIT_SECONDS = 300;

export const VALID_DRAFT_ORDERS = ['snake', 'linear'] as const;
export const VALID_PLAYER_POOLS = [
  'all',
  'nl',
  'al',
  'nfl',
  'afc',
  'nfc',
] as const;
const BASEBALL_ONLY_POOLS = ['nl', 'al'] as const;
const FOOTBALL_ONLY_POOLS = ['nfl', 'afc', 'nfc'] as const;

export type MockDraftOrder = (typeof VALID_DRAFT_ORDERS)[number];
export type MockPlayerPool = (typeof VALID_PLAYER_POOLS)[number];
export type MockDraftSport = 'baseball' | 'football';

export function isValidDraftOrder(v: string): v is MockDraftOrder {
  return (VALID_DRAFT_ORDERS as readonly string[]).includes(v);
}

export function isValidPlayerPool(v: string): v is MockPlayerPool {
  return (VALID_PLAYER_POOLS as readonly string[]).includes(v);
}

/**
 * @throws `BAD_USER_INPUT` when the pool does not exist in this sport — the
 *   same messages the legacy mutation used.
 */
export function assertPoolMatchesSport(
  sport: MockDraftSport,
  playerPool: MockPlayerPool,
): void {
  if (
    sport === 'baseball' &&
    (FOOTBALL_ONLY_POOLS as readonly string[]).includes(playerPool)
  ) {
    throw UserInputError(
      `playerPool "${playerPool}" is not valid for a baseball mock draft`,
    );
  }
  if (
    sport === 'football' &&
    (BASEBALL_ONLY_POOLS as readonly string[]).includes(playerPool)
  ) {
    throw UserInputError(
      `playerPool "${playerPool}" is not valid for a football mock draft`,
    );
  }
}

/** @throws `BAD_USER_INPUT` unless the clock is within its allowed bounds. */
export function assertPickTimeLimitInRange(seconds: number): void {
  if (
    seconds < MIN_PICK_TIME_LIMIT_SECONDS ||
    seconds > MAX_PICK_TIME_LIMIT_SECONDS
  ) {
    throw UserInputError(
      `pickTimeLimitSeconds must be between ${MIN_PICK_TIME_LIMIT_SECONDS} and ${MAX_PICK_TIME_LIMIT_SECONDS}`,
    );
  }
}

function generateInviteCode(): string {
  // 32-char alphabet (omits ambiguous 0/O/1/I) → exactly 5 bits per char, so
  // masking a random byte with 0x1f yields an unbiased index (256 % 32 === 0).
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(bytes[i] & 0x1f);
  }
  return code;
}

/**
 * An invite code that collides with neither a draft's nor a league's code.
 *
 * Both namespaces are checked because a user pastes one code into one box:
 * `joinMockDraft` must be able to tell "not a mock draft" from "not a code at
 * all", and a league's join flow must never resolve a mock draft's code.
 *
 * Best-effort, outside any transaction: a racing collision trips
 * `drafts_uk_invite_code` and rolls the insert back.
 */
export async function generateUnusedInviteCode(db: PublicDb): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateInviteCode();

    const [draftMatch] = await db
      .select({ id: PublicSchema.drafts.id })
      .from(PublicSchema.drafts)
      .where(eq(PublicSchema.drafts.inviteCode, code))
      .limit(1);
    if (draftMatch) continue;

    const [leagueMatch] = await db
      .select({ id: PublicSchema.leagues.id })
      .from(PublicSchema.leagues)
      .where(eq(PublicSchema.leagues.inviteCode, code))
      .limit(1);
    if (leagueMatch) continue;

    return code;
  }

  throw new Error('Could not generate an unused mock draft invite code');
}

/**
 * Load a mock draft's row with `SELECT ... FOR UPDATE`.
 *
 * Every lobby write takes this lock first (LS-10147's pattern, applied to the
 * draft row because a mock draft has no league row to lock): `startMockDraft`,
 * `joinMockDraft` and host transfer each re-check `status` inside the same
 * transaction, so a double-click cannot start a draft twice or seat two
 * joiners in the last seat.
 *
 * @throws `BAD_USER_INPUT` when the draft does not exist or is not a mock draft.
 */
export async function lockMockDraft(
  tx: PublicDb,
  draftId: number,
): Promise<DraftRow> {
  // Typed select, not raw `SELECT *`: a raw row carries snake_case keys, so
  // camelCase reads (createdBy, mockMode, lobbyExpiresAt) came back undefined
  // and every host/lobby check refused (LS-10272).
  const [row] = await tx
    .select()
    .from(PublicSchema.drafts)
    .where(eq(PublicSchema.drafts.id, draftId))
    .for('update');

  if (!row) {
    throw UserInputError('Draft not found');
  }
  if (row.kind !== 'mock') {
    throw UserInputError('This action is only available for mock drafts');
  }

  return row;
}

/** Seats in slot order, for the lobby and its seat counter. */
export async function getLobbySeats(
  db: PublicDb,
  draftId: number,
): Promise<
  {
    id: number;
    slot: number;
    userId: number | null;
    controller: 'user' | 'ai' | 'open';
    seatName: string;
    joinedAt: Date | null;
  }[]
> {
  return db
    .select({
      id: PublicSchema.draftParticipants.id,
      slot: PublicSchema.draftParticipants.slot,
      userId: PublicSchema.draftParticipants.userId,
      controller: PublicSchema.draftParticipants.controller,
      seatName: PublicSchema.draftParticipants.seatName,
      joinedAt: PublicSchema.draftParticipants.joinedAt,
    })
    .from(PublicSchema.draftParticipants)
    .where(eq(PublicSchema.draftParticipants.draftId, draftId))
    .orderBy(asc(PublicSchema.draftParticipants.slot));
}

/** The label an unclaimed lobby seat carries. */
export function openSeatName(slot: number): string {
  return `Open Slot ${String(slot)}`;
}

/** The label a seat carries once the CPU drives it. */
export function cpuSeatName(slot: number): string {
  return `CPU Team ${String(slot)}`;
}

/**
 * Tell the lobby its seats changed. Best-effort: a mock draft is already
 * committed by the time this runs, and a dropped socket frame costs the
 * lobby a refetch, not correctness.
 */
export async function broadcastLobbyUpdate(
  context: Context,
  draftId: number,
  reason:
    | 'seat-claimed'
    | 'seat-freed'
    | 'seat-kicked'
    | 'settings'
    | 'host'
    | 'invite',
): Promise<void> {
  const { notificationService } = context;
  if (!notificationService) return;

  const seats = await getLobbySeats(context.db, draftId);

  await notificationService.notifyDraftLobbyUpdated({
    draftId,
    reason,
    filledSeats: seats.filter((s) => s.userId !== null).length,
    totalSeats: seats.length,
  });
}

/** Slots held by a pending, unexpired invitation — not claimable by a code. */
export async function reservedSlots(
  db: PublicDb,
  draftId: number,
  now: Date = new Date(),
): Promise<Set<number>> {
  const rows = await db
    .select({
      reservedSlot: PublicSchema.invitations.reservedSlot,
      expiresAt: PublicSchema.invitations.expiresAt,
    })
    .from(PublicSchema.invitations)
    .where(
      and(
        eq(PublicSchema.invitations.draftId, draftId),
        eq(PublicSchema.invitations.status, 'pending'),
      ),
    );

  return new Set(
    rows
      .filter((r) => r.expiresAt === null || r.expiresAt > now)
      .map((r) => r.reservedSlot)
      .filter((slot): slot is number => slot !== null),
  );
}

/** A lobby's seats, split the one way every caller must count them. */
export interface SeatAvailability {
  seats: Awaited<ReturnType<typeof getLobbySeats>>;
  /** Slots held by a pending, unexpired invitation. */
  reservedSlots: Set<number>;
  /** Unheld, unreserved seats in slot order — what a public joiner can take. */
  openSlots: number[];
  filledSeats: number;
  totalSeats: number;
}

/**
 * The single definition of "open seat" (LS-10078): `controller = 'open'` with
 * no holder, minus the slots pending invitations reserve. The lobby, the
 * invite-code preview, `joinMockDraft`'s guard, `sendDraftInvite`'s slot pick
 * and the public lobby list (LS-10079) all read it from here, so none of them
 * can disagree about whether a lobby is full.
 *
 * Pass the transaction holding `lockMockDraft` when the answer gates a write.
 */
export async function getSeatAvailability(
  db: PublicDb,
  draftId: number,
  now: Date = new Date(),
): Promise<SeatAvailability> {
  const [seats, reserved] = await Promise.all([
    getLobbySeats(db, draftId),
    reservedSlots(db, draftId, now),
  ]);

  return {
    seats,
    reservedSlots: reserved,
    openSlots: seats
      .filter(
        (s) =>
          s.userId === null && s.controller === 'open' && !reserved.has(s.slot),
      )
      .map((s) => s.slot),
    filledSeats: seats.filter((s) => s.userId !== null).length,
    totalSeats: seats.length,
  };
}
