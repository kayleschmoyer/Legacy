/**
 * Draft domain — the draft access guard (LS-10074).
 *
 * Every draft resolver used to guard on the *league*: `verifyLeagueMembership`
 * or `verifyLeagueReadAccess` against `draft.leagueId`. A draft-first mock
 * draft (epic LS-9252) has no league to guard on, so the guard has to move to
 * the draft.
 *
 * {@link authorizeDraft} is that guard. Its league branch reproduces the two
 * league helpers exactly — same lookups, same `ForbiddenError` messages — so
 * this slice is behavior-neutral for league drafts.
 *
 * The mock branch (LS-10076) has no league to consult: access is the seat.
 * A mock draft has no spectators — only a seat holder may read it — and only
 * its creator (`drafts.created_by`) may host. `preview` is the pre-join lobby
 * view: a public lobby, a valid invite code, or a pending invitation.
 *
 * The websocket lambda cannot call this (it is bound to the GraphQL
 * `Context`); `validateDraftAccess` in lambdas/websocket mirrors the mock
 * branch and must stay equivalent to it.
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { and, eq } from 'drizzle-orm';

import { type DraftSeat, getSeatForTeam, getSeatForUser } from './participants';
import {
  isCommissionerOrOwner,
  type LeagueMembership,
  verifyLeagueMembership,
  verifyLeagueReadAccess,
} from '../authorization';
import type { Context } from '../builder';
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from '../graphql-errors';

type DraftRow = typeof PublicSchema.drafts.$inferSelect;

/**
 * What the caller is about to do, in increasing order of privilege.
 *
 * - `preview` / `read` — read-only draft state. Members read; so do spectators
 *   of a public league and admins (LS-8939). For a league draft `preview`
 *   behaves exactly like `read`; for a mock draft it is the pre-join lobby
 *   view (LS-10076).
 * - `participate` — act as a drafter (queue, recommendations, a board filtered
 *   to your own roster needs). Members only; spectators are refused.
 * - `host` — run the draft (order, pause/resume, commissioner picks).
 *   Commissioners and league owners only.
 */
export type DraftAccessNeed = 'preview' | 'read' | 'participate' | 'host';

/** How the caller relates to this draft. */
export type DraftRole = 'host' | 'participant' | 'spectator';

/**
 * A draft authorization for `participate`/`host`: league membership is proven
 * for a league draft, and a seat is proven for a mock draft.
 */
export type SeatedDraftAuthorization =
  | (DraftAuthorization & { membership: LeagueMembership })
  | (DraftAuthorization & { membership: null; seat: DraftSeat });

/** Options for {@link authorizeDraft}. */
export interface AuthorizeDraftOptions {
  /**
   * An invite code the caller presented. A matching `drafts.invite_code`
   * grants `preview` on a mock-draft lobby (LS-10076).
   */
  inviteCode?: string | null;
}

export interface DraftAuthorization {
  draft: DraftRow;
  /** The caller's seat in this draft, or `null` when they hold none. */
  seat: DraftSeat | null;
  role: DraftRole;
  /**
   * The caller's league membership for a `kind = 'league'` draft, or `null`
   * when reading as a spectator. Call sites that still need `teamId` or the
   * permission level read it from here.
   */
  membership: LeagueMembership | null;
}

/** `true` when the need is satisfied by read-only access. */
function isReadOnlyNeed(need: DraftAccessNeed): boolean {
  return need === 'preview' || need === 'read';
}

function resolveRole(membership: LeagueMembership | null): DraftRole {
  if (!membership) return 'spectator';
  return isCommissionerOrOwner(membership) ? 'host' : 'participant';
}

/** `true` for a mock-draft lobby that can still be previewed or joined. */
export function isOpenMockLobby(
  draft: DraftRow,
  now: Date = new Date(),
): boolean {
  return (
    draft.kind === 'mock' &&
    draft.status === 'not-started' &&
    (draft.lobbyExpiresAt === null || draft.lobbyExpiresAt > now)
  );
}

/** `true` when `userId` holds a pending, unexpired invitation to `draftId`. */
export async function hasPendingDraftInvitation(
  db: Context['db'],
  draftId: number,
  userId: number,
  now: Date = new Date(),
): Promise<boolean> {
  const [invitation] = await db
    .select({
      id: PublicSchema.invitations.id,
      expiresAt: PublicSchema.invitations.expiresAt,
    })
    .from(PublicSchema.invitations)
    .where(
      and(
        eq(PublicSchema.invitations.draftId, draftId),
        eq(PublicSchema.invitations.invitedUserId, userId),
        eq(PublicSchema.invitations.status, 'pending'),
      ),
    )
    .limit(1);

  return (
    invitation !== undefined &&
    (invitation.expiresAt === null || invitation.expiresAt > now)
  );
}

/**
 * Authorize `context.user` for `draftId` at the given access level.
 *
 * @throws `UNAUTHENTICATED` when there is no signed-in user.
 * @throws `BAD_USER_INPUT` ('Draft not found') when the draft does not exist.
 * @throws `FORBIDDEN` when the caller may not do `need` on this draft.
 */
export async function authorizeDraft(
  context: Context,
  draftId: number,
  need: 'participate' | 'host',
  options?: AuthorizeDraftOptions,
): Promise<SeatedDraftAuthorization>;
export async function authorizeDraft(
  context: Context,
  draftId: number,
  need: DraftAccessNeed,
  options?: AuthorizeDraftOptions,
): Promise<DraftAuthorization>;
export async function authorizeDraft(
  context: Context,
  draftId: number,
  need: DraftAccessNeed,
  options: AuthorizeDraftOptions = {},
): Promise<DraftAuthorization> {
  if (!context.user) {
    throw AuthenticationError();
  }

  const [draft] = await context.db
    .select()
    .from(PublicSchema.drafts)
    .where(eq(PublicSchema.drafts.id, draftId))
    .limit(1);

  if (!draft) {
    throw UserInputError('Draft not found');
  }

  return authorizeLoadedDraft(context, draft, need, options);
}

/**
 * {@link authorizeDraft} for a caller that has already loaded the draft row.
 *
 * Several query resolvers return `null` for a missing draft rather than
 * erroring, so they look the row up themselves; this entry point lets them
 * authorize without a second read of the same row.
 */
export async function authorizeLoadedDraft(
  context: Context,
  draft: DraftRow,
  need: 'participate' | 'host',
  options?: AuthorizeDraftOptions,
): Promise<SeatedDraftAuthorization>;
export async function authorizeLoadedDraft(
  context: Context,
  draft: DraftRow,
  need: DraftAccessNeed,
  options?: AuthorizeDraftOptions,
): Promise<DraftAuthorization>;
export async function authorizeLoadedDraft(
  context: Context,
  draft: DraftRow,
  need: DraftAccessNeed,
  options: AuthorizeDraftOptions = {},
): Promise<DraftAuthorization> {
  const user = context.user;
  if (!user) {
    throw AuthenticationError();
  }

  // Tested for 'mock' specifically, not "not 'league'": the column is NOT
  // NULL DEFAULT 'league', so anything else is a league draft.
  if (draft.kind === 'mock') {
    return authorizeMockDraft(context, user.id, draft, need, options);
  }

  // A league draft always has a league_id (CHECK drafts_kind_league_ck,
  // LS-10073).
  const leagueId = draft.leagueId;
  if (leagueId === null) {
    throw new Error(
      `authorizeDraft: league draft ${String(draft.id)} has no league_id`,
    );
  }

  let membership: LeagueMembership | null;
  if (isReadOnlyNeed(need)) {
    ({ membership } = await verifyLeagueReadAccess(
      context.db,
      leagueId,
      user.id,
      user.isAdmin,
    ));
  } else {
    membership = await verifyLeagueMembership(context.db, leagueId, user.id);
  }

  if (need === 'host' && (!membership || !isCommissionerOrOwner(membership))) {
    throw ForbiddenError(
      'Only a league General Manager or commissioner can perform this action',
    );
  }

  const seat =
    membership?.teamId != null
      ? await getSeatForTeam(context.db, draft.id, membership.teamId)
      : null;

  return { draft, seat, role: resolveRole(membership), membership };
}

/**
 * The mock branch of {@link authorizeLoadedDraft} (LS-10076).
 *
 * - A seat holder may `preview`, `read` and `participate`.
 * - Only the host (`drafts.created_by`, moved on host transfer) may `host`.
 * - Anyone else may only `preview` an open lobby that is public, whose invite
 *   code they present, or to which they hold a pending invitation. There are
 *   no spectators: admins included, a non-holder never reads a mock draft.
 */
async function authorizeMockDraft(
  context: Context,
  userId: number,
  draft: DraftRow,
  need: DraftAccessNeed,
  options: AuthorizeDraftOptions,
): Promise<DraftAuthorization> {
  const seat = await getSeatForUser(context.db, draft.id, userId);
  const isHost = draft.createdBy === userId;

  if (seat) {
    if (need === 'host' && !isHost) {
      throw ForbiddenError('Only the mock draft host can perform this action');
    }
    return {
      draft,
      seat,
      role: isHost ? 'host' : 'participant',
      membership: null,
    };
  }

  if (need === 'preview' && isOpenMockLobby(draft)) {
    const presentedCode = options.inviteCode?.trim().toUpperCase();
    const codeMatches =
      !!presentedCode && presentedCode === draft.inviteCode?.toUpperCase();
    if (
      draft.isPublic ||
      codeMatches ||
      (await hasPendingDraftInvitation(context.db, draft.id, userId))
    ) {
      return { draft, seat: null, role: 'spectator', membership: null };
    }
  }

  throw ForbiddenError('You do not have a seat in this mock draft');
}

/**
 * Convenience for the "caller must be seated to act" check.
 *
 * Kept out of {@link authorizeDraft} because the league resolvers this slice
 * rewires do **not** require a seat — `verifyLeagueMembership` never did, and
 * a commissioner without a team must keep the access they have today.
 */
export function requireSeat(auth: DraftAuthorization): DraftSeat {
  if (!auth.seat) {
    throw ForbiddenError('You do not have a seat in this draft');
  }
  return auth.seat;
}
