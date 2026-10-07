/**
 * Direct invites (LS-10078): sendDraftInvite, respondToInvite, revokeInvite,
 * myInvites, pendingInvites.
 *
 * A mock-draft invite reserves a seat (`invitations.reserved_slot`) for as
 * long as it is pending, so a public joiner or code holder can never take the
 * seat the host promised someone. Every mock-draft write here takes
 * `lockMockDraft` first and re-reads the invitation inside the same
 * transaction (LS-10147's pattern) — that lock is what serializes a reserve,
 * an accept, a revoke and a public `joinMockDraft` against one another.
 *
 * A league invite reserves nothing: accepting it joins the league through the
 * same `claimUnassignedTeamForUser` path as an invite code, active-league cap
 * included. It lapses after seven days; a mock invite lapses with its lobby.
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  notExists,
  or,
  sql,
} from 'drizzle-orm';

import {
  DRAFT_INVITE_NOTIFICATION_TYPE,
  Invitation,
  InvitationConnection,
  type InvitationConnectionShape,
  type InvitationShape,
  LEAGUE_INVITE_TTL_MS,
} from './types';
import {
  broadcastLobbyUpdate,
  getSeatAvailability,
  lockMockDraft,
} from '../drafts/mock/shared';
import { getLeagueMembership } from '../authorization';
import { builder } from '../builder';
import type { Context } from '../builder';
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from '../graphql-errors';
import {
  claimUnassignedTeamForUser,
  requireJoinLeagueCapacity,
} from '../leagues/mutations';

type Db = Context['db'];
type InvitationRow = typeof PublicSchema.invitations.$inferSelect;

/** What a non-pending (or lapsed) invitation tells whoever tries to use it. */
export const INVITE_UNAVAILABLE_MESSAGE =
  'This invite is no longer available. It may have been revoked or expired.';

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 20;

function isLapsed(row: { expiresAt: Date | null }, now: Date): boolean {
  return row.expiresAt !== null && row.expiresAt <= now;
}

type InviteTarget = { draftId: number } | { leagueId: number };

/**
 * Exactly one of draftId / leagueId — the invitations_target_ck rule, applied
 * to resolver args and to rows alike.
 *
 * @throws `BAD_USER_INPUT` unless exactly one is set.
 */
function exactlyOneTarget(target: {
  draftId?: number | null;
  leagueId?: number | null;
}): InviteTarget {
  const { draftId, leagueId } = target;
  if (draftId != null && leagueId == null) return { draftId };
  if (leagueId != null && draftId == null) return { leagueId };
  throw UserInputError('Pass exactly one of draftId or leagueId');
}

/** Pending and not yet past its expiry — the only state anyone may act on. */
function pendingAndLive(now: Date) {
  return and(
    eq(PublicSchema.invitations.status, 'pending'),
    or(
      isNull(PublicSchema.invitations.expiresAt),
      gt(PublicSchema.invitations.expiresAt, now),
    ),
  );
}

/**
 * Turn invitation rows into the GraphQL shape: usernames, the target's name
 * and sport. Batched — one query per referenced table, not per row.
 */
export async function hydrateInvitations(
  db: Db,
  rows: InvitationRow[],
): Promise<InvitationShape[]> {
  if (rows.length === 0) return [];

  const userIds = [
    ...new Set(rows.flatMap((r) => [r.invitedUserId, r.invitedBy])),
  ];
  const draftIds = [
    ...new Set(rows.map((r) => r.draftId).filter((id) => id !== null)),
  ];
  const leagueIds = [
    ...new Set(rows.map((r) => r.leagueId).filter((id) => id !== null)),
  ];

  const [users, draftRows, leagueRows] = await Promise.all([
    db
      .select({
        id: PublicSchema.users.id,
        username: PublicSchema.users.username,
      })
      .from(PublicSchema.users)
      .where(inArray(PublicSchema.users.id, userIds)),
    draftIds.length > 0
      ? db
          .select({
            id: PublicSchema.drafts.id,
            sport: PublicSchema.drafts.sport,
            hostUsername: PublicSchema.users.username,
          })
          .from(PublicSchema.drafts)
          .innerJoin(
            PublicSchema.users,
            eq(PublicSchema.users.id, PublicSchema.drafts.createdBy),
          )
          .where(inArray(PublicSchema.drafts.id, draftIds))
      : Promise.resolve([]),
    leagueIds.length > 0
      ? db
          .select({
            id: PublicSchema.leagues.id,
            name: PublicSchema.leagues.name,
            sport: PublicSchema.leagues.sport,
          })
          .from(PublicSchema.leagues)
          .where(inArray(PublicSchema.leagues.id, leagueIds))
      : Promise.resolve([]),
  ]);

  const usernameOf = new Map(users.map((u) => [u.id, u.username ?? 'Unknown']));
  const draftOf = new Map(draftRows.map((d) => [d.id, d]));
  const leagueOf = new Map(leagueRows.map((l) => [l.id, l]));

  return rows.map((row): InvitationShape => {
    const draft = row.draftId !== null ? draftOf.get(row.draftId) : undefined;
    const league =
      row.leagueId !== null ? leagueOf.get(row.leagueId) : undefined;

    return {
      id: row.id,
      kind: row.draftId !== null ? 'mock' : 'league',
      status: row.status,
      draftId: row.draftId,
      leagueId: row.leagueId,
      sport: draft?.sport ?? league?.sport ?? 'baseball',
      targetName: draft
        ? `${draft.hostUsername ?? 'A friend'}'s mock draft`
        : (league?.name ?? 'League'),
      invitedUserId: row.invitedUserId,
      invitedUsername: usernameOf.get(row.invitedUserId) ?? 'Unknown',
      invitedById: row.invitedBy,
      invitedByUsername: usernameOf.get(row.invitedBy) ?? 'Unknown',
      reservedSlot: row.reservedSlot,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  });
}

async function hydrateOne(
  db: Db,
  row: InvitationRow,
): Promise<InvitationShape> {
  const [shape] = await hydrateInvitations(db, [row]);
  return shape;
}

/**
 * Flip pending invites that have lapsed to `expired`, so the partial unique
 * index on (target, user, pending) does not block a fresh invite. Expiry is
 * otherwise lazy: every read filters on `expires_at`.
 */
async function expireLapsed(
  db: Db,
  target: { draftId: number } | { leagueId: number },
  invitedUserId: number,
  now: Date,
): Promise<void> {
  await db
    .update(PublicSchema.invitations)
    .set({ status: 'expired', respondedAt: now })
    .where(
      and(
        'draftId' in target
          ? eq(PublicSchema.invitations.draftId, target.draftId)
          : eq(PublicSchema.invitations.leagueId, target.leagueId),
        eq(PublicSchema.invitations.invitedUserId, invitedUserId),
        eq(PublicSchema.invitations.status, 'pending'),
        lt(PublicSchema.invitations.expiresAt, now),
      ),
    );
}

/** Commissioner-only — `general_manager` is the ordinary member role. */
async function requireLeagueCommissioner(
  db: Db,
  leagueId: number,
  userId: number,
): Promise<void> {
  const [league] = await db
    .select({ owner: PublicSchema.leagues.owner })
    .from(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.id, leagueId))
    .limit(1);
  if (!league) {
    throw UserInputError('League not found');
  }
  if (league.owner === userId) return;

  const membership = await getLeagueMembership(db, leagueId, userId);
  if (membership?.permissionLevel !== 'commissioner') {
    throw ForbiddenError('Only the league commissioner can invite users');
  }
}

async function findUserByUsername(
  db: Db,
  username: string,
): Promise<{ id: number; username: string }> {
  const [user] = await db
    .select({
      id: PublicSchema.users.id,
      username: PublicSchema.users.username,
    })
    .from(PublicSchema.users)
    .where(sql`lower(${PublicSchema.users.username}) = lower(${username})`)
    .limit(1);
  if (!user?.username || user.id === null) {
    throw UserInputError(`No user named "${username}"`);
  }
  return { id: user.id, username: user.username };
}

/** Best-effort push + notification-history entry for the invitee. */
async function notifyInvitee(
  context: Context,
  invite: InvitationShape,
): Promise<void> {
  if (!context.notificationPublisher) return;
  const target =
    invite.kind === 'mock'
      ? { kind: 'mock', draftId: invite.draftId, sport: invite.sport }
      : { kind: 'league', leagueId: invite.leagueId, sport: invite.sport };

  try {
    await context.notificationPublisher.publish({
      userId: invite.invitedUserId,
      notificationType: DRAFT_INVITE_NOTIFICATION_TYPE,
      title: invite.kind === 'mock' ? 'Mock draft invite' : 'League invite',
      body:
        invite.kind === 'mock'
          ? `${invite.invitedByUsername} invited you to a ${invite.sport} mock draft.`
          : `${invite.invitedByUsername} invited you to join ${invite.targetName}.`,
      data: { inviteId: invite.id, target },
    });
  } catch (err: unknown) {
    LOGGER.warn('Failed to publish draft invite notification (non-fatal)', {
      err,
      inviteId: invite.id,
    });
  }
}

/** Postgres unique_violation — the pending-invite partial unique index. */
function isUniqueViolation(err: unknown): boolean {
  const code =
    (err as { code?: string }).code ??
    (err as { cause?: { code?: string } }).cause?.code;
  return code === '23505';
}

// ── sendDraftInvite ─────────────────────────────────────────────────────────

async function sendMockDraftInvite(
  context: Context,
  hostId: number,
  draftId: number,
  invitee: { id: number },
): Promise<InvitationRow> {
  const now = new Date();

  return context.db.transaction(async (tx) => {
    const draft = await lockMockDraft(tx, draftId);

    if (draft.createdBy !== hostId) {
      throw ForbiddenError('Only the mock draft host can invite users');
    }
    if (draft.mockMode !== 'online') {
      throw UserInputError('Only an online mock draft lobby takes invites.');
    }
    if (draft.status !== 'not-started') {
      throw UserInputError('This mock draft has already started.');
    }
    if (draft.lobbyExpiresAt && draft.lobbyExpiresAt <= now) {
      throw UserInputError('This mock draft lobby has expired.');
    }

    await expireLapsed(tx, { draftId }, invitee.id, now);

    const availability = await getSeatAvailability(tx, draftId, now);
    if (availability.seats.some((s) => s.userId === invitee.id)) {
      throw UserInputError('That user already has a seat in this draft.');
    }

    const [existing] = await tx
      .select({ id: PublicSchema.invitations.id })
      .from(PublicSchema.invitations)
      .where(
        and(
          eq(PublicSchema.invitations.draftId, draftId),
          eq(PublicSchema.invitations.invitedUserId, invitee.id),
          eq(PublicSchema.invitations.status, 'pending'),
        ),
      )
      .limit(1);
    if (existing) {
      throw UserInputError('That user already has a pending invite.');
    }

    const slot = availability.openSlots[0];
    if (slot === undefined) {
      throw UserInputError(
        'There is no open seat left to reserve for this invite.',
      );
    }

    const [row] = await tx
      .insert(PublicSchema.invitations)
      .values({
        draftId,
        invitedUserId: invitee.id,
        invitedBy: hostId,
        status: 'pending',
        reservedSlot: slot,
        // A mock invite is good for as long as the lobby is.
        expiresAt: draft.lobbyExpiresAt,
      })
      .returning();
    return row;
  });
}

async function sendLeagueInvite(
  context: Context,
  inviterId: number,
  leagueId: number,
  invitee: { id: number },
): Promise<InvitationRow> {
  const now = new Date();
  await requireLeagueCommissioner(context.db, leagueId, inviterId);

  const existingMembership = await getLeagueMembership(
    context.db,
    leagueId,
    invitee.id,
  );
  if (existingMembership) {
    throw UserInputError('That user is already a member of this league.');
  }

  await expireLapsed(context.db, { leagueId }, invitee.id, now);

  try {
    const [row] = await context.db
      .insert(PublicSchema.invitations)
      .values({
        leagueId,
        invitedUserId: invitee.id,
        invitedBy: inviterId,
        status: 'pending',
        expiresAt: new Date(now.getTime() + LEAGUE_INVITE_TTL_MS),
      })
      .returning();
    return row;
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      throw UserInputError('That user already has a pending invite.');
    }
    throw err;
  }
}

builder.mutationField('sendDraftInvite', (t) =>
  t.field({
    type: Invitation,
    description:
      'Invite a user by username to a mock draft (host only — reserves a ' +
      'seat) or a league (commissioner only). Exactly one of draftId / ' +
      'leagueId. Notifies the invitee in-app and by push (LS-10078).',
    args: {
      draftId: t.arg.int({ required: false }),
      leagueId: t.arg.int({ required: false }),
      username: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError('Authentication required to send an invite');
      }
      const inviterId = context.user.id;

      const target = exactlyOneTarget(args);

      const username = args.username.trim().replace(/^@/, '');
      if (username.length === 0) {
        throw UserInputError('username is required');
      }
      const invitee = await findUserByUsername(context.db, username);
      if (invitee.id === inviterId) {
        throw UserInputError('You cannot invite yourself.');
      }

      const row =
        'draftId' in target
          ? await sendMockDraftInvite(
              context,
              inviterId,
              target.draftId,
              invitee,
            )
          : await sendLeagueInvite(
              context,
              inviterId,
              target.leagueId,
              invitee,
            );

      const invite = await hydrateOne(context.db, row);

      LOGGER.info('Draft invite sent', {
        inviteId: invite.id,
        kind: invite.kind,
        draftId: invite.draftId,
        leagueId: invite.leagueId,
        reservedSlot: invite.reservedSlot,
      });

      await notifyInvitee(context, invite);
      if (invite.draftId !== null) {
        await broadcastLobbyUpdate(context, invite.draftId, 'invite');
      }

      return invite;
    },
  }),
);

// ── respondToInvite ─────────────────────────────────────────────────────────

async function loadInviteForInvitee(
  db: Db,
  inviteId: number,
  userId: number,
): Promise<InvitationRow> {
  const [row] = await db
    .select()
    .from(PublicSchema.invitations)
    .where(eq(PublicSchema.invitations.id, inviteId))
    .limit(1);
  if (!row || row.invitedUserId !== userId) {
    throw UserInputError('Invite not found');
  }
  return row;
}

async function respondToMockInvite(
  context: Context,
  userId: number,
  inviteId: number,
  draftId: number,
  accept: boolean,
  teamName: string,
): Promise<InvitationRow> {
  const now = new Date();

  return context.db.transaction(async (tx) => {
    // Lock order everywhere: draft row, then invitation row.
    const draft = await lockMockDraft(tx, draftId);

    const [invite] = await tx
      .select()
      .from(PublicSchema.invitations)
      .where(eq(PublicSchema.invitations.id, inviteId))
      .for('update');

    if (!invite || invite.status !== 'pending' || isLapsed(invite, now)) {
      throw UserInputError(INVITE_UNAVAILABLE_MESSAGE);
    }

    if (!accept) {
      const [declined] = await tx
        .update(PublicSchema.invitations)
        .set({ status: 'declined', respondedAt: now })
        .where(eq(PublicSchema.invitations.id, inviteId))
        .returning();
      return declined;
    }

    if (
      draft.status !== 'not-started' ||
      (draft.lobbyExpiresAt !== null && draft.lobbyExpiresAt <= now)
    ) {
      throw UserInputError(INVITE_UNAVAILABLE_MESSAGE);
    }

    const { seats } = await getSeatAvailability(tx, draftId, now);
    if (!seats.some((s) => s.userId === userId)) {
      const reserved = seats.find(
        (s) =>
          s.slot === invite.reservedSlot &&
          s.userId === null &&
          s.controller === 'open',
      );
      if (!reserved) {
        throw UserInputError(
          'The seat reserved for you is no longer available.',
        );
      }

      await tx
        .update(PublicSchema.draftParticipants)
        .set({
          userId,
          controller: 'user',
          seatName: teamName.slice(0, 40),
          joinedAt: now,
          updatedAt: now,
        })
        .where(eq(PublicSchema.draftParticipants.id, reserved.id));
    }

    const [accepted] = await tx
      .update(PublicSchema.invitations)
      .set({ status: 'accepted', respondedAt: now })
      .where(eq(PublicSchema.invitations.id, inviteId))
      .returning();
    return accepted;
  });
}

async function respondToLeagueInvite(
  context: Context,
  userId: number,
  invite: InvitationRow,
  leagueId: number,
  accept: boolean,
  teamName: string,
): Promise<InvitationRow> {
  const now = new Date();

  if (invite.status !== 'pending' || isLapsed(invite, now)) {
    throw UserInputError(INVITE_UNAVAILABLE_MESSAGE);
  }

  if (accept) {
    if (await getLeagueMembership(context.db, leagueId, userId)) {
      throw UserInputError('You are already a member of this league');
    }
    // The free-tier active-league cap applies exactly as it does to an
    // invite code (LS-5172). A refusal leaves the invite pending, so the
    // invitee can still accept after upgrading.
    const { hasUnlimitedLeagues } = await requireJoinLeagueCapacity(
      context,
      userId,
    );

    // Claim the invite first, conditionally: a racing revoke or a second
    // accept loses here, before any team is claimed.
    const [claimed] = await context.db
      .update(PublicSchema.invitations)
      .set({ status: 'accepted', respondedAt: now })
      .where(
        and(eq(PublicSchema.invitations.id, invite.id), pendingAndLive(now)),
      )
      .returning();
    if (!claimed) {
      throw UserInputError(INVITE_UNAVAILABLE_MESSAGE);
    }

    const reopen = () =>
      context.db
        .update(PublicSchema.invitations)
        .set({ status: 'pending', respondedAt: null })
        .where(eq(PublicSchema.invitations.id, invite.id));

    let claim: Awaited<ReturnType<typeof claimUnassignedTeamForUser>>;
    try {
      claim = await claimUnassignedTeamForUser(context.db, {
        leagueId,
        userId,
        teamName,
        permissionLevel: 'general_manager',
        capCheck: { hasUnlimitedLeagues, limit: 3 },
      });
    } catch (err: unknown) {
      // The cap re-check inside the claim transaction refused: hand the
      // invite back rather than burning it.
      await reopen();
      throw err;
    }

    if ('fullLeague' in claim) {
      await reopen();
      throw UserInputError('This league is full. All teams have been claimed.');
    }

    return claimed;
  }

  const [declined] = await context.db
    .update(PublicSchema.invitations)
    .set({ status: 'declined', respondedAt: now })
    .where(and(eq(PublicSchema.invitations.id, invite.id), pendingAndLive(now)))
    .returning();
  if (!declined) {
    throw UserInputError(INVITE_UNAVAILABLE_MESSAGE);
  }
  return declined;
}

builder.mutationField('respondToInvite', (t) =>
  t.field({
    type: Invitation,
    description:
      'Accept or decline a direct invite (invitee only). Accepting a mock ' +
      'invite takes its reserved seat; accepting a league invite joins the ' +
      'league, subject to the active-league cap (LS-10078). Fails with a ' +
      'clear message once the invite is revoked or has expired.',
    args: {
      inviteId: t.arg.int({ required: true }),
      accept: t.arg.boolean({ required: true }),
      teamName: t.arg.string({
        required: false,
        description: 'Defaults to "<username>\'s Team".',
      }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError('Authentication required');
      }
      const userId = context.user.id;
      const username = context.user.username ?? `user_${String(userId)}`;
      const teamName = args.teamName?.trim() || `${username}'s Team`;

      const invite = await loadInviteForInvitee(
        context.db,
        args.inviteId,
        userId,
      );

      const target = exactlyOneTarget(invite);
      const row =
        'draftId' in target
          ? await respondToMockInvite(
              context,
              userId,
              invite.id,
              target.draftId,
              args.accept,
              teamName,
            )
          : await respondToLeagueInvite(
              context,
              userId,
              invite,
              target.leagueId,
              args.accept,
              teamName,
            );

      LOGGER.info('Draft invite answered', {
        inviteId: row.id,
        status: row.status,
        userId,
      });

      if (row.draftId !== null) {
        await broadcastLobbyUpdate(
          context,
          row.draftId,
          args.accept ? 'seat-claimed' : 'invite',
        );
      }

      return hydrateOne(context.db, row);
    },
  }),
);

// ── revokeInvite ────────────────────────────────────────────────────────────

builder.mutationField('revokeInvite', (t) =>
  t.field({
    type: Invitation,
    description:
      'Withdraw a pending invite (the mock draft host or the league ' +
      'commissioner). A mock invite releases its reserved seat (LS-10078).',
    args: {
      inviteId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError('Authentication required');
      }
      const userId = context.user.id;
      const now = new Date();

      const [invite] = await context.db
        .select()
        .from(PublicSchema.invitations)
        .where(eq(PublicSchema.invitations.id, args.inviteId))
        .limit(1);
      if (!invite) {
        throw UserInputError('Invite not found');
      }

      const revoke = async (db: Db): Promise<InvitationRow> => {
        const [row] = await db
          .update(PublicSchema.invitations)
          .set({ status: 'revoked', respondedAt: now })
          .where(
            and(
              eq(PublicSchema.invitations.id, invite.id),
              eq(PublicSchema.invitations.status, 'pending'),
            ),
          )
          .returning();
        if (!row) {
          throw UserInputError('Only a pending invite can be revoked.');
        }
        return row;
      };

      const target = exactlyOneTarget(invite);
      let row: InvitationRow;
      if ('draftId' in target) {
        const { draftId } = target;
        row = await context.db.transaction(async (tx) => {
          const draft = await lockMockDraft(tx, draftId);
          if (draft.createdBy !== userId) {
            throw ForbiddenError('Only the mock draft host can revoke invites');
          }
          return revoke(tx);
        });
        await broadcastLobbyUpdate(context, draftId, 'invite');
      } else {
        await requireLeagueCommissioner(context.db, target.leagueId, userId);
        row = await revoke(context.db);
      }

      LOGGER.info('Draft invite revoked', { inviteId: row.id, userId });
      return hydrateOne(context.db, row);
    },
  }),
);

// ── myInvites / pendingInvites ──────────────────────────────────────────────

/** Opaque cursor: the last invitation id on the page. */
function decodeCursor(after: string | null | undefined): number | null {
  if (!after) return null;
  const id = Number(Buffer.from(after, 'base64').toString('utf8'));
  if (!Number.isInteger(id) || id <= 0) {
    throw UserInputError('Invalid cursor');
  }
  return id;
}

function encodeCursor(id: number): string {
  return Buffer.from(String(id)).toString('base64');
}

builder.queryField('myInvites', (t) =>
  t.field({
    type: InvitationConnection,
    description:
      "The caller's pending, unexpired invites, newest first, cursor-paged " +
      '(LS-10078). The Mock Drafts hub (LS-10079) lists these.',
    args: {
      first: t.arg.int({ required: false }),
      after: t.arg.string({ required: false }),
      kind: t.arg.string({
        required: false,
        description: "'mock' or 'league' to filter; both when omitted.",
      }),
    },
    resolve: async (
      _parent,
      args,
      context,
    ): Promise<InvitationConnectionShape> => {
      if (!context.user) {
        throw AuthenticationError('Authentication required');
      }
      const now = new Date();
      const pageSize = Math.min(
        Math.max(args.first ?? DEFAULT_PAGE_SIZE, 1),
        MAX_PAGE_SIZE,
      );
      const afterId = decodeCursor(args.after);

      if (args.kind != null && args.kind !== 'mock' && args.kind !== 'league') {
        throw UserInputError("kind must be 'mock' or 'league'");
      }

      const rows = await context.db
        .select()
        .from(PublicSchema.invitations)
        .where(
          and(
            eq(PublicSchema.invitations.invitedUserId, context.user.id),
            pendingAndLive(now),
            afterId !== null
              ? lt(PublicSchema.invitations.id, afterId)
              : undefined,
            args.kind === 'mock'
              ? sql`${PublicSchema.invitations.draftId} IS NOT NULL`
              : args.kind === 'league'
                ? sql`${PublicSchema.invitations.leagueId} IS NOT NULL`
                : undefined,
          ),
        )
        .orderBy(desc(PublicSchema.invitations.id))
        .limit(pageSize + 1);

      const page = rows.slice(0, pageSize);

      return {
        nodes: await hydrateInvitations(context.db, page),
        endCursor:
          page.length > 0 ? encodeCursor(page[page.length - 1].id) : null,
        hasNextPage: rows.length > pageSize,
      };
    },
  }),
);

builder.queryField('pendingInvites', (t) =>
  t.field({
    type: [Invitation],
    description:
      "A mock draft's or league's pending invites, for the host's / " +
      "commissioner's invite panel (LS-10078). Exactly one of draftId / leagueId.",
    args: {
      draftId: t.arg.int({ required: false }),
      leagueId: t.arg.int({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError('Authentication required');
      }
      const userId = context.user.id;
      const target = exactlyOneTarget(args);

      if ('draftId' in target) {
        const [draft] = await context.db
          .select({ createdBy: PublicSchema.drafts.createdBy })
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.id, target.draftId))
          .limit(1);
        if (!draft || draft.createdBy !== userId) {
          throw ForbiddenError('Only the mock draft host can see its invites');
        }
      } else {
        await requireLeagueCommissioner(context.db, target.leagueId, userId);
      }

      const rows = await context.db
        .select()
        .from(PublicSchema.invitations)
        .where(
          and(
            'draftId' in target
              ? eq(PublicSchema.invitations.draftId, target.draftId)
              : and(
                  eq(PublicSchema.invitations.leagueId, target.leagueId),
                  // Joining settles the invite (LS-10831); this also hides
                  // one left pending by a membership written another way.
                  notExists(
                    context.db
                      .select({ userId: PublicSchema.leagueMembers.userId })
                      .from(PublicSchema.leagueMembers)
                      .where(
                        and(
                          eq(
                            PublicSchema.leagueMembers.leagueId,
                            target.leagueId,
                          ),
                          eq(
                            PublicSchema.leagueMembers.userId,
                            PublicSchema.invitations.invitedUserId,
                          ),
                        ),
                      ),
                  ),
                ),
            pendingAndLive(new Date()),
          ),
        )
        .orderBy(desc(PublicSchema.invitations.id));

      return hydrateInvitations(context.db, rows);
    },
  }),
);
