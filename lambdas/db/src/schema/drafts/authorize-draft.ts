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
 * this slice is behavior-neutral for league drafts. The mock branch lands in
 * LS-10076 (slice 4).
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { eq } from 'drizzle-orm';

import { type DraftSeat, getSeatForTeam } from './participants';
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
 *   of a public league and admins (LS-8939). `preview` exists for the pre-join
 *   lobby view slice 4 adds; today it behaves exactly like `read`.
 * - `participate` — act as a drafter (queue, recommendations, a board filtered
 *   to your own roster needs). Members only; spectators are refused.
 * - `host` — run the draft (order, pause/resume, commissioner picks).
 *   Commissioners and league owners only.
 */
export type DraftAccessNeed = 'preview' | 'read' | 'participate' | 'host';

/** How the caller relates to this draft. */
export type DraftRole = 'host' | 'participant' | 'spectator';

/** A draft authorization for `participate`/`host`, where membership is proven. */
export type SeatedDraftAuthorization = DraftAuthorization & {
  membership: LeagueMembership;
};

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
): Promise<SeatedDraftAuthorization>;
export async function authorizeDraft(
  context: Context,
  draftId: number,
  need: DraftAccessNeed,
): Promise<DraftAuthorization>;
export async function authorizeDraft(
  context: Context,
  draftId: number,
  need: DraftAccessNeed,
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

  return authorizeLoadedDraft(context, draft, need);
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
): Promise<SeatedDraftAuthorization>;
export async function authorizeLoadedDraft(
  context: Context,
  draft: DraftRow,
  need: DraftAccessNeed,
): Promise<DraftAuthorization>;
export async function authorizeLoadedDraft(
  context: Context,
  draft: DraftRow,
  need: DraftAccessNeed,
): Promise<DraftAuthorization> {
  const user = context.user;
  if (!user) {
    throw AuthenticationError();
  }

  const draftId = draft.id;

  if (draft.kind === 'mock') {
    // No writer creates a kind='mock' draft yet — LS-10073 was purely
    // additive — so this is unreachable today. Guarding beats silently
    // falling through to the league branch, which assumes a league_id.
    // The test is for 'mock' specifically, not "not 'league'": the column is
    // NOT NULL DEFAULT 'league', so anything else is a league draft.
    throw new Error(
      `authorizeDraft: draft ${String(draftId)} is a mock draft — the mock branch lands in LS-10076`,
    );
  }

  // A league draft always has a league_id (CHECK drafts_kind_league_ck,
  // LS-10073); the column is nullable in the DB only so slice 4's mock drafts
  // can omit it, and stays typed non-null until a writer can create one.
  const leagueId = draft.leagueId;

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
