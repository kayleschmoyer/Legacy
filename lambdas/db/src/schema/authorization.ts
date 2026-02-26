/**
 * Reusable authorization helpers for GraphQL mutation resolvers.
 *
 * ## Recommended: `authorized()` wrapper (functional decorator)
 *
 * The {@link authorized} higher-order function wraps a Pothos resolver with
 * declarative auth checks — the functional equivalent of a decorator:
 *
 * ```ts
 * import { authorized } from './authorization';
 *
 * resolve: authorized(
 *   { teamMembers: (args) => [args.teamMemberId], checkLocked: true },
 *   async (_parent, args, { db }, user) => {
 *     // user is guaranteed authenticated
 *     // team edit access already verified
 *     // player lock already checked
 *   },
 * )
 * ```
 *
 * ## Building blocks (for custom checks)
 *
 *   - {@link requireAuth}           – ensures the request has an authenticated user
 *   - {@link getLeagueMembership}   – loads a user's league membership (permission + team)
 *   - {@link isCommissionerOrOwner} – checks if a membership has elevated privileges
 *   - {@link getTeamMemberInfo}     – loads teamId / leagueId / playerId for team members
 *
 * ## Pre-built guards (call from resolvers)
 *
 *   - {@link verifyLeagueMembership}   – throws if the user is not a member of the league
 *   - {@link verifyCommissionerAccess} – throws unless the user is a commissioner/GM
 *   - {@link verifyTeamEditAccess}     – team General Manager OR commissioner; use for roster edits
 *   - {@link checkPlayersNotLocked}    – throws if any player has game selections
 */

import { PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { and, count, eq, inArray, or } from 'drizzle-orm';
import type { Context } from './builder';

// ── Types ──────────────────────────────────────────────────────────────────────

/** Shape of a non-null authenticated user extracted from the context. */
export interface AuthenticatedUser {
  id: number;
  email?: string | null;
  username?: string | null;
  isAdmin?: boolean;
}

/** A user's membership record within a specific league. */
export interface LeagueMembership {
  leagueId: number;
  userId: number;
  teamId: number | null;
  permissionLevel: 'general_manager' | 'assistant_manager' | 'commissioner';
}

/** Minimal info about a team member loaded from the database. */
export interface TeamMemberInfo {
  id: number;
  teamId: number | null;
  leagueId: number;
  playerId: number;
}

/**
 * Declarative configuration for the {@link authorized} resolver wrapper.
 *
 * Specify which checks should be applied before the handler runs.  All
 * extractors receive the parsed `args` object so they can pull the relevant
 * IDs for each check.
 *
 * @typeParam TArgs - The shape of the resolver's `args` parameter.
 */
export interface AuthConfig<TArgs> {
  /**
   * Extract team-member IDs that the mutation operates on.  When provided the
   * wrapper will call {@link verifyTeamEditAccess} to ensure the user is the
   * team owner or a commissioner/owner of the league.
   */
  teamMembers?: (args: TArgs) => number[];

  /**
   * Extract a league ID for a commissioner-only guard.  When provided the
   * wrapper will call {@link verifyCommissionerAccess}.
   */
  commissionerOf?: (args: TArgs) => number;

  /**
   * Extract a league ID for a league-membership guard.  When provided the
   * wrapper will call {@link verifyLeagueMembership}.
   */
  memberOf?: (args: TArgs) => number;

  /**
   * When `true` (and `teamMembers` is also provided) the wrapper will call
   * {@link checkPlayersNotLocked} to ensure none of the players already have
   * game selections in the current matchup.
   *
   * @default false
   */
  checkLocked?: boolean;
}

/**
 * The handler signature passed to {@link authorized}.  Identical to a normal
 * Pothos resolver but with the authenticated `user` provided as the fourth
 * argument so you never need to call `requireAuth` yourself.
 */
export type AuthorizedHandler<TParent, TArgs, TResult> = (
  parent: TParent,
  args: TArgs,
  context: Context,
  user: AuthenticatedUser,
) => TResult | Promise<TResult>;

// ── Building Blocks ────────────────────────────────────────────────────────────

/**
 * Ensures the request has an authenticated user, returning the strongly-typed
 * user object.  Call this at the top of every mutation resolver.
 *
 * @throws Error when `context.user` is null/undefined.
 */
export function requireAuth(context: Context): AuthenticatedUser {
  if (!context.user) {
    throw new Error('Authentication required');
  }
  return context.user as AuthenticatedUser;
}

/**
 * Loads a user's league membership.  Returns `null` if the user is not a
 * member of the league.
 */
export async function getLeagueMembership(
  db: PublicDb,
  leagueId: number,
  userId: number,
): Promise<LeagueMembership | null> {
  const rows = await db
    .select({
      permissionLevel: PublicSchema.leagueMembers.permissionLevel,
      teamId: PublicSchema.leagueMembers.teamId,
    })
    .from(PublicSchema.leagueMembers)
    .where(
      and(
        eq(PublicSchema.leagueMembers.leagueId, leagueId),
        eq(PublicSchema.leagueMembers.userId, userId),
      ),
    )
    .limit(1);

  if (rows.length === 0) return null;

  return {
    leagueId,
    userId,
    teamId: rows[0].teamId,
    permissionLevel: rows[0].permissionLevel,
  };
}

/**
 * Returns `true` when the membership has commissioner, general manager, or assistant manager privileges.
 */
export function isCommissionerOrOwner(membership: LeagueMembership): boolean {
  return (
    membership.permissionLevel === 'commissioner' ||
    membership.permissionLevel === 'general_manager' ||
    membership.permissionLevel === 'assistant_manager'
  );
}

/**
 * Loads minimal info (teamId, leagueId, playerId) for a set of team member IDs.
 *
 * @throws Error when one or more IDs cannot be found.
 */
export async function getTeamMemberInfo(
  db: PublicDb,
  teamMemberIds: number[],
): Promise<TeamMemberInfo[]> {
  const members = await db
    .select({
      id: PublicSchema.teamMembers.id,
      teamId: PublicSchema.teamMembers.teamId,
      leagueId: PublicSchema.teamMembers.leagueId,
      playerId: PublicSchema.teamMembers.playerId,
    })
    .from(PublicSchema.teamMembers)
    .where(inArray(PublicSchema.teamMembers.id, teamMemberIds));

  if (members.length !== teamMemberIds.length) {
    throw new Error('One or more team members not found');
  }

  return members;
}

// ── Pre-built Guards ───────────────────────────────────────────────────────────

/**
 * Throws if the user is not a member of the given league.
 *
 * @returns The user's {@link LeagueMembership}.
 */
export async function verifyLeagueMembership(
  db: PublicDb,
  leagueId: number,
  userId: number,
): Promise<LeagueMembership> {
  const membership = await getLeagueMembership(db, leagueId, userId);
  if (!membership) {
    throw new Error('User is not a member of this league');
  }
  return membership;
}

/**
 * Throws unless the user is a commissioner or owner of the given league.
 *
 * @returns The user's {@link LeagueMembership}.
 */
export async function verifyCommissionerAccess(
  db: PublicDb,
  leagueId: number,
  userId: number,
): Promise<LeagueMembership> {
  const membership = await verifyLeagueMembership(db, leagueId, userId);
  if (!isCommissionerOrOwner(membership)) {
    throw new Error(
      'Only a league General Manager or commissioner can perform this action',
    );
  }
  return membership;
}

/**
 * Verifies the user has edit access to the team(s) that the given team members
 * belong to.  Access is granted when either:
 *
 *   1. The user owns the team (their `league_members.teamId` matches), **or**
 *   2. The user is a commissioner / General Manager of the league.
 *
 * Use this for any mutation that modifies a team's roster, lineup, trade
 * proposals, etc.
 *
 * @throws Error when the user lacks permission.
 */
export async function verifyTeamEditAccess(
  db: PublicDb,
  userId: number,
  teamMemberIds: number[],
): Promise<void> {
  const members = await getTeamMemberInfo(db, teamMemberIds);

  const leagueId = members[0].leagueId;
  const teamIds = [
    ...new Set(members.map((m) => m.teamId).filter(Boolean)),
  ] as number[];

  const membership = await verifyLeagueMembership(db, leagueId, userId);

  // Commissioners and owners can edit any team's roster
  if (isCommissionerOrOwner(membership)) {
    return;
  }

  // Regular members can only edit their own team's roster
  if (membership.teamId && teamIds.every((tid) => tid === membership.teamId)) {
    return;
  }

  throw new Error(
    'You do not have permission to edit this roster. Only the General Manager or a league commissioner can make roster changes.',
  );
}

/**
 * Checks whether any of the given team members have game selections in the
 * current matchup for their league.  A player with at least one row in
 * `matchup_player_games` for the active matchup week is considered "locked"
 * and must not be moved.
 *
 * @throws Error when one or more players are locked.
 */
export async function checkPlayersNotLocked(
  db: PublicDb,
  teamMemberIds: number[],
): Promise<void> {
  const members = await getTeamMemberInfo(db, teamMemberIds);
  if (members.length === 0) return;

  // Get the current matchup for the league
  const leagueId = members[0].leagueId;
  const leagueRows = await db
    .select({ currentMatchup: PublicSchema.leagues.currentMatchup })
    .from(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.id, leagueId))
    .limit(1);

  const currentMatchupId = leagueRows[0]?.currentMatchup;
  if (!currentMatchupId) return; // No active matchup — nothing is locked

  // The `currentMatchup` column points to a single matchup row, but each
  // week may have multiple matchups (round-robin).  Find the week number
  // first, then check each player against that week's matchups.
  const refMatchup = await db
    .select({ weekNumber: PublicSchema.matchups.weekNumber })
    .from(PublicSchema.matchups)
    .where(eq(PublicSchema.matchups.id, currentMatchupId))
    .limit(1);

  const weekNumber = refMatchup[0]?.weekNumber;
  if (weekNumber == null) return;

  for (const member of members) {
    if (!member.teamId) continue;

    const locked = await db
      .select({ cnt: count() })
      .from(PublicSchema.matchupPlayerGames)
      .innerJoin(
        PublicSchema.matchupPlayers,
        eq(
          PublicSchema.matchupPlayerGames.matchupPlayerId,
          PublicSchema.matchupPlayers.id,
        ),
      )
      .innerJoin(
        PublicSchema.matchups,
        eq(PublicSchema.matchupPlayers.matchupId, PublicSchema.matchups.id),
      )
      .where(
        and(
          eq(PublicSchema.matchupPlayers.playerId, member.playerId),
          eq(PublicSchema.matchupPlayers.teamId, member.teamId),
          eq(PublicSchema.matchups.leagueId, leagueId),
          eq(PublicSchema.matchups.weekNumber, weekNumber),
          or(
            eq(PublicSchema.matchups.team1Id, member.teamId),
            eq(PublicSchema.matchups.team2Id, member.teamId),
          ),
        ),
      );

    if (locked[0] && Number(locked[0].cnt) > 0) {
      throw new Error(
        'Player is locked — game selections have already been made for the current matchup',
      );
    }
  }
}

// ── Resolver Wrapper ("Functional Decorator") ──────────────────────────────

/**
 * Higher-order function that wraps a Pothos resolver with declarative
 * authorization checks — the functional equivalent of a decorator.
 *
 * Checks run in a fixed, predictable order:
 *   1. **Authentication** — `requireAuth(context)` (always)
 *   2. **League membership** — if `config.memberOf` is provided
 *   3. **Commissioner access** — if `config.commissionerOf` is provided
 *   4. **Team edit access** — if `config.teamMembers` is provided
 *   5. **Player lock check** — if `config.checkLocked && config.teamMembers`
 *
 * The handler receives the verified `user` as its fourth argument, so your
 * business logic never needs to worry about auth plumbing.
 *
 * @example
 * ```ts
 * // Simple authentication-only guard:
 * resolve: authorized({}, async (_parent, _args, { db }, user) => {
 *   // user is guaranteed to be authenticated
 * })
 *
 * // Team edit + lock check:
 * resolve: authorized(
 *   { teamMembers: (args) => [args.teamMemberId], checkLocked: true },
 *   async (_parent, args, { db }, user) => {
 *     // access verified, players not locked
 *   },
 * )
 *
 * // Commissioner-only mutation:
 * resolve: authorized(
 *   { commissionerOf: (args) => args.leagueId },
 *   async (_parent, args, { db }, user) => {
 *     // user is a commissioner or owner of the league
 *   },
 * )
 * ```
 */
export function authorized<TArgs, TResult>(
  config: AuthConfig<TArgs>,
  handler: AuthorizedHandler<unknown, TArgs, TResult>,
): (parent: unknown, args: TArgs, context: Context) => Promise<TResult> {
  return async (parent, args, context) => {
    // 1. Always require authentication
    const user = requireAuth(context);
    const db = context.db;

    // 2. League membership check
    if (config.memberOf) {
      const leagueId = config.memberOf(args);
      await verifyLeagueMembership(db, leagueId, user.id);
    }

    // 3. Commissioner / owner check
    if (config.commissionerOf) {
      const leagueId = config.commissionerOf(args);
      await verifyCommissionerAccess(db, leagueId, user.id);
    }

    // 4. Team edit access check (team owner OR commissioner)
    if (config.teamMembers) {
      const memberIds = config.teamMembers(args);
      await verifyTeamEditAccess(db, user.id, memberIds);

      // 5. Player lock check (only meaningful when team members are specified)
      if (config.checkLocked) {
        await checkPlayersNotLocked(db, memberIds);
      }
    }

    return handler(parent, args, context, user);
  };
}
