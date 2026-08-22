/**
 * Teams domain — Mutation resolvers
 *
 * Mutations: updateTeamMemberPosition, swapTeamMemberPositions, renameTeam,
 *            inviteAssistantManager, removeAssistantManager
 */
import { type PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import {
  containsHtmlLikeMarkup,
  sanitizeDisplayName,
} from '@legacy-sports/utils';
import { and, eq, gte, ilike, inArray, ne } from 'drizzle-orm';
import { validateBrandingUrl } from './validate-branding-url';
import { authorized, isTeamGeneralManager } from '../authorization';
import { builder } from '../builder';
import { LeagueMember, Team, TeamMember } from '../leagues/types';
import {
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  UserInputError,
} from '../graphql-errors';
import { checkAndIncrementRateLimit } from '../rate-limit';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * After a team member position change, mirror the new positionId onto the
 * current active matchup week AND all future matchup weeks where the player's
 * slot has NOT been manually edited via the matchup lineup editor.
 *
 * Rows where `manually_edited = true` are left untouched — those represent
 * intentional future-week edits made by the user and should not be
 * overwritten.
 *
 * Callers must invoke this with the same transaction (`tx`) used for the
 * `team_members` update it mirrors (LS-6034). A thrown error here rolls back
 * that transaction, so the two stay consistent instead of silently diverging.
 */
export async function syncCurrentMatchupPositions(
  db: PublicDb,
  leagueId: number,
  changes: Array<{
    teamId: number;
    playerId: number;
    positionId: number | null;
  }>,
): Promise<void> {
  if (changes.length === 0) return;

  // 1. Find the current week for the league.
  //    Prefer the authoritative `currentWeek` column; fall back to resolving
  //    via the legacy `currentMatchup` FK (LS-1592).
  const leagueRows = await db
    .select({
      currentWeek: PublicSchema.leagues.currentWeek,
      currentMatchup: PublicSchema.leagues.currentMatchup,
    })
    .from(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.id, leagueId))
    .limit(1);
  const leagueRow = leagueRows[0];
  if (!leagueRow) return;

  let weekNumber: number | null = leagueRow.currentWeek ?? null;

  if (weekNumber == null) {
    // Fall back to legacy currentMatchup FK
    const currentMatchupId = leagueRow.currentMatchup;
    if (!currentMatchupId) return; // No active matchup — nothing to sync

    const refMatchup = await db
      .select({ weekNumber: PublicSchema.matchups.weekNumber })
      .from(PublicSchema.matchups)
      .where(eq(PublicSchema.matchups.id, currentMatchupId))
      .limit(1);
    weekNumber = refMatchup[0]?.weekNumber ?? null;
  }

  if (weekNumber == null) return;

  // 3. Load all matchups for this league at or after the current week
  //    and build a teamId+weekNumber → matchupId map.
  const futureMatchups = await db
    .select({
      id: PublicSchema.matchups.id,
      weekNumber: PublicSchema.matchups.weekNumber,
      team1Id: PublicSchema.matchups.team1Id,
      team2Id: PublicSchema.matchups.team2Id,
    })
    .from(PublicSchema.matchups)
    .where(
      and(
        eq(PublicSchema.matchups.leagueId, leagueId),
        gte(PublicSchema.matchups.weekNumber, weekNumber),
      ),
    );

  // Build a set of matchup IDs relevant to each changed teamId
  const matchupIdsByTeam = new Map<number, number[]>();
  for (const m of futureMatchups) {
    for (const teamId of [m.team1Id, m.team2Id]) {
      if (!teamId) continue;
      let teamMatchupIds = matchupIdsByTeam.get(teamId);
      if (!teamMatchupIds) {
        teamMatchupIds = [];
        matchupIdsByTeam.set(teamId, teamMatchupIds);
      }
      teamMatchupIds.push(m.id);
    }
  }

  // 4. For each change, update matchup_players rows where manuallyEdited = false.
  //
  //    The partial unique index `matchup_players_unique_slot_idx`
  //    (matchup_id, team_id, position_id) WHERE position_id IS NOT NULL allows
  //    only one player per slot per matchup+team. Writing `position_id` directly
  //    therefore collides with whichever player already holds that slot in a
  //    future matchup — the normal state of a freshly-drafted league (every
  //    slot auto-assigned) and of any swap. That collision surfaced as an opaque
  //    "Failed query" (LS-8327 / LS-8328 / LS-8340 / LS-8341).
  //
  //    Mirror the clear-then-assign the `team_members` update already performs:
  //    free the target slot from any non-manually-edited incumbent first, then
  //    move our player in. Matchups where a *manually edited* row still holds
  //    the slot are skipped entirely — that intentional future-week edit wins,
  //    consistent with the manuallyEdited-preservation rule above.
  for (const change of changes) {
    const matchupIds = matchupIdsByTeam.get(change.teamId);
    if (!matchupIds || matchupIds.length === 0) continue;

    // Benching a player (null position) can never violate the slot index.
    if (change.positionId == null) {
      await db
        .update(PublicSchema.matchupPlayers)
        .set({ positionId: null })
        .where(
          and(
            inArray(PublicSchema.matchupPlayers.matchupId, matchupIds),
            eq(PublicSchema.matchupPlayers.playerId, change.playerId),
            eq(PublicSchema.matchupPlayers.teamId, change.teamId),
            eq(PublicSchema.matchupPlayers.manuallyEdited, false),
          ),
        );
      continue;
    }

    // 4a. Free the target slot: bench any non-manually-edited incumbent that
    //     currently holds it (a different player) so the assign below can't
    //     collide with the unique slot index.
    await db
      .update(PublicSchema.matchupPlayers)
      .set({ positionId: null })
      .where(
        and(
          inArray(PublicSchema.matchupPlayers.matchupId, matchupIds),
          eq(PublicSchema.matchupPlayers.teamId, change.teamId),
          eq(PublicSchema.matchupPlayers.positionId, change.positionId),
          eq(PublicSchema.matchupPlayers.manuallyEdited, false),
          ne(PublicSchema.matchupPlayers.playerId, change.playerId),
        ),
      );

    // 4b. A manually-edited row may still hold the slot in some matchups; those
    //     edits are sacred, so skip assigning our player there (moving it in
    //     would collide with the preserved edit).
    const lockedRows = await db
      .select({ matchupId: PublicSchema.matchupPlayers.matchupId })
      .from(PublicSchema.matchupPlayers)
      .where(
        and(
          inArray(PublicSchema.matchupPlayers.matchupId, matchupIds),
          eq(PublicSchema.matchupPlayers.teamId, change.teamId),
          eq(PublicSchema.matchupPlayers.positionId, change.positionId),
          eq(PublicSchema.matchupPlayers.manuallyEdited, true),
        ),
      );
    const lockedMatchupIds = new Set(lockedRows.map((r) => r.matchupId));
    const assignableMatchupIds = matchupIds.filter(
      (id) => !lockedMatchupIds.has(id),
    );
    if (assignableMatchupIds.length === 0) continue;

    // 4c. Assign our player into the now-free slot.
    await db
      .update(PublicSchema.matchupPlayers)
      .set({ positionId: change.positionId })
      .where(
        and(
          inArray(PublicSchema.matchupPlayers.matchupId, assignableMatchupIds),
          eq(PublicSchema.matchupPlayers.playerId, change.playerId),
          eq(PublicSchema.matchupPlayers.teamId, change.teamId),
          eq(PublicSchema.matchupPlayers.manuallyEdited, false),
        ),
      );
  }
}

// ── Mutation resolvers ─────────────────────────────────────────────────────

// `positionId: null` on this mutation only ever clears the `team_members`
// row's positional slot ("bench"); it never touches `teamId`, so the player
// always stays owned by the team, for every sport. Releasing a player to
// free agency is a distinct, deliberate flow: a waiver claim's
// `dropPlayerId` (`claimFreeAgent`), processed by the waiver processor,
// which `DELETE`s the `team_members` row outright — this mutation has no
// path to that outcome (confirmed for LS-6333 / FLD-020).
//
// Note: today the schema has no dedicated "IR" slot distinct from "bench" —
// both collapse to `positionId: null` (the `position_slot` enum has no IR
// value, and `team_members` has no injury-reserve flag). Football's
// bye-week/IR handling is currently client-side display only; adding a real
// server-side distinction is a product decision out of scope for this fix.
builder.mutationField('updateTeamMemberPosition', (t) =>
  t.field({
    type: TeamMember,
    args: {
      teamMemberId: t.arg.int({ required: true }),
      positionId: t.arg.int({ required: false }),
    },
    resolve: authorized(
      {
        teamMembers: (args) => [args.teamMemberId],
        checkLocked: true,
        // Lineup edits are core assistant-manager responsibilities (LS-6024).
        allowAssistantManager: true,
      },
      async (_parent, args, context, user) => {
        const { teamMemberId, positionId } = args;

        try {
          const db = context.db;

          // Assigning a position that another member of the same team already
          // holds would violate the `team_members_uk_team_position`
          // UNIQUE(team_id, position_id) constraint and surface to the client
          // as an opaque "Internal server error" (HTTP 500). This is the data
          // state of a freshly-drafted league, where every starting slot is
          // auto-assigned at draft completion. Free the target slot first
          // (displacing the incumbent to the bench), then assign — mirroring
          // the clear-then-assign pattern in `swapTeamMemberPositions`. Both
          // steps run in one transaction so a failure never leaves the
          // incumbent benched without the new player taking the slot. The web
          // UI routes occupied-slot moves through `swapTeamMemberPositions`, so
          // this path is exercised mainly by direct API callers (LS-7871).
          const { member } = await db.transaction(async (tx) => {
            // Resolve the member's team so slot-clearing is scoped to it.
            const [existing] = await tx
              .select({ teamId: PublicSchema.teamMembers.teamId })
              .from(PublicSchema.teamMembers)
              .where(eq(PublicSchema.teamMembers.id, teamMemberId))
              .limit(1);

            if (!existing) {
              throw UserInputError('Team member not found');
            }

            // Free the target slot if a different member on the same team
            // currently occupies it. Skipped when clearing a position (null),
            // which can never collide.
            let displaced: Array<{ teamId: number | null; playerId: number }> =
              [];
            if (positionId != null && existing.teamId != null) {
              displaced = await tx
                .update(PublicSchema.teamMembers)
                .set({ positionId: null })
                .where(
                  and(
                    eq(PublicSchema.teamMembers.teamId, existing.teamId),
                    eq(PublicSchema.teamMembers.positionId, positionId),
                    ne(PublicSchema.teamMembers.id, teamMemberId),
                  ),
                )
                .returning({
                  teamId: PublicSchema.teamMembers.teamId,
                  playerId: PublicSchema.teamMembers.playerId,
                });
            }

            // Update the team member position
            const updated = await tx
              .update(PublicSchema.teamMembers)
              .set({ positionId: positionId ?? null })
              .where(eq(PublicSchema.teamMembers.id, teamMemberId))
              .returning({
                id: PublicSchema.teamMembers.id,
                teamId: PublicSchema.teamMembers.teamId,
                leagueId: PublicSchema.teamMembers.leagueId,
                playerId: PublicSchema.teamMembers.playerId,
                positionId: PublicSchema.teamMembers.positionId,
                onTradeBlock: PublicSchema.teamMembers.onTradeBlock,
              });

            if (updated.length === 0) {
              throw UserInputError('Team member not found');
            }

            const member = updated[0];

            // Mirror the position change(s) onto matchup_players for the
            // active week, in the SAME transaction as the team_members update
            // above. The assigned member moves to `positionId`; any displaced
            // incumbent is benched (null) so the lineup stays consistent. A
            // sync failure now rolls back the whole mutation instead of
            // silently diverging team_members from matchup_players (LS-6034).
            if (member.teamId) {
              const changes = [
                {
                  teamId: member.teamId,
                  playerId: member.playerId,
                  positionId: positionId ?? null,
                },
                ...displaced
                  .filter(
                    (d): d is { teamId: number; playerId: number } =>
                      d.teamId != null,
                  )
                  .map((d) => ({
                    teamId: d.teamId,
                    playerId: d.playerId,
                    positionId: null,
                  })),
              ];
              await syncCurrentMatchupPositions(tx, member.leagueId, changes);
            }

            return { member };
          });

          return member;
        } catch (error) {
          LOGGER.error('Error updating team member position', {
            teamMemberId,
            positionId,
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
    ),
  }),
);

// Mutation field for atomically swapping two team members' positions
builder.mutationField('swapTeamMemberPositions', (t) =>
  t.field({
    type: [TeamMember],
    args: {
      teamMemberIdA: t.arg.int({ required: true }),
      positionIdA: t.arg.int({ required: false }),
      teamMemberIdB: t.arg.int({ required: true }),
      positionIdB: t.arg.int({ required: false }),
    },
    resolve: authorized(
      {
        teamMembers: (args) => [args.teamMemberIdA, args.teamMemberIdB],
        checkLocked: true,
        // Lineup edits are core assistant-manager responsibilities (LS-6024).
        allowAssistantManager: true,
      },
      async (_parent, args, context, user) => {
        const { teamMemberIdA, positionIdA, teamMemberIdB, positionIdB } = args;

        try {
          const db = context.db;

          // Perform the swap atomically inside a transaction
          const results = await db.transaction(async (tx) => {
            // Step 1: Clear both positions to avoid unique constraint violation
            await tx
              .update(PublicSchema.teamMembers)
              .set({ positionId: null })
              .where(
                inArray(PublicSchema.teamMembers.id, [
                  teamMemberIdA,
                  teamMemberIdB,
                ]),
              );

            // Step 2: Assign new positions
            const updatedA = await tx
              .update(PublicSchema.teamMembers)
              .set({ positionId: positionIdA ?? null })
              .where(eq(PublicSchema.teamMembers.id, teamMemberIdA))
              .returning({
                id: PublicSchema.teamMembers.id,
                teamId: PublicSchema.teamMembers.teamId,
                leagueId: PublicSchema.teamMembers.leagueId,
                playerId: PublicSchema.teamMembers.playerId,
                positionId: PublicSchema.teamMembers.positionId,
                onTradeBlock: PublicSchema.teamMembers.onTradeBlock,
              });

            const updatedB = await tx
              .update(PublicSchema.teamMembers)
              .set({ positionId: positionIdB ?? null })
              .where(eq(PublicSchema.teamMembers.id, teamMemberIdB))
              .returning({
                id: PublicSchema.teamMembers.id,
                teamId: PublicSchema.teamMembers.teamId,
                leagueId: PublicSchema.teamMembers.leagueId,
                playerId: PublicSchema.teamMembers.playerId,
                positionId: PublicSchema.teamMembers.positionId,
                onTradeBlock: PublicSchema.teamMembers.onTradeBlock,
              });

            if (updatedA.length === 0 || updatedB.length === 0) {
              throw new Error(
                'Failed to update one or both team member positions',
              );
            }

            // Mirror both position changes onto matchup_players for the
            // active week, in the SAME transaction as the team_members
            // update above. Uses memberA's leagueId — both members belong to
            // the same league. A sync failure now rolls back the whole
            // mutation instead of silently diverging team_members from
            // matchup_players (LS-6034).
            const [memberA, memberB] = [updatedA[0], updatedB[0]];
            if (memberA.teamId && memberB.teamId) {
              await syncCurrentMatchupPositions(tx, memberA.leagueId, [
                {
                  teamId: memberA.teamId,
                  playerId: memberA.playerId,
                  positionId: positionIdA ?? null,
                },
                {
                  teamId: memberB.teamId,
                  playerId: memberB.playerId,
                  positionId: positionIdB ?? null,
                },
              ]);
            }

            return [updatedA[0], updatedB[0]];
          });

          return results;
        } catch (error) {
          LOGGER.error('Error swapping team member positions', {
            teamMemberIdA,
            positionIdA,
            teamMemberIdB,
            positionIdB,
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
    ),
  }),
);

// Mutation field for renaming a team
builder.mutationField('renameTeam', (t) =>
  t.field({
    type: Team,
    args: {
      teamId: t.arg.int({ required: true }),
      leagueId: t.arg.int({ required: true }),
      newName: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      // Server-side sanitization — the client only trims before submit, so the
      // resolver cannot trust that control chars, zero-width chars, or bidi
      // overrides have already been stripped (LS-6039, mirrors LS-6056).
      const name = sanitizeDisplayName(args.newName);
      if (name.length === 0) {
        throw UserInputError('Team name cannot be empty');
      }
      if (name.length > 40) {
        throw UserInputError('Team name cannot exceed 40 characters');
      }
      if (containsHtmlLikeMarkup(name)) {
        throw UserInputError('Team name cannot contain HTML tags');
      }

      const { teamId, leagueId } = args;
      const userId = context.user.id;
      const db = context.db;

      // Verify membership and team ownership
      const membership = await db
        .select({
          teamId: PublicSchema.leagueMembers.teamId,
          permissionLevel: PublicSchema.leagueMembers.permissionLevel,
        })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      if (membership.length === 0) {
        throw ForbiddenError('Not a member of this league');
      }

      const isCommish =
        membership[0].permissionLevel === 'commissioner' ||
        membership[0].permissionLevel === 'general_manager' ||
        membership[0].permissionLevel === 'assistant_manager';

      if (!isCommish && membership[0].teamId !== teamId) {
        throw ForbiddenError('You can only rename your own team');
      }

      // Fetch old name for the chat notification
      const teamRows = await db
        .select({ name: PublicSchema.teams.name })
        .from(PublicSchema.teams)
        .where(
          and(
            eq(PublicSchema.teams.id, teamId),
            eq(PublicSchema.teams.leagueId, leagueId),
          ),
        )
        .limit(1);

      if (teamRows.length === 0) {
        throw NotFoundError('Team not found');
      }

      const oldName = teamRows[0].name;

      // Update the team name
      const updated = await db
        .update(PublicSchema.teams)
        .set({ name })
        .where(
          and(
            eq(PublicSchema.teams.id, teamId),
            eq(PublicSchema.teams.leagueId, leagueId),
          ),
        )
        .returning({
          id: PublicSchema.teams.id,
          name: PublicSchema.teams.name,
          leagueId: PublicSchema.teams.leagueId,
          divisionId: PublicSchema.teams.divisionId,
          waiverOrder: PublicSchema.teams.waiverOrder,
          faabBudget: PublicSchema.teams.faabBudget,
          createdAt: PublicSchema.teams.createdAt,
          updatedAt: PublicSchema.teams.updatedAt,
          logoUrl: PublicSchema.teams.logoUrl,
          primaryColor: PublicSchema.teams.primaryColor,
          secondaryColor: PublicSchema.teams.secondaryColor,
          isLocked: PublicSchema.teams.isLocked,
          avatarUrl: PublicSchema.teams.avatarUrl,
          bannerUrl: PublicSchema.teams.bannerUrl,
        });

      if (updated.length === 0) {
        throw new Error('Failed to rename team');
      }

      const senderUsername = context.user.username ?? `user_${context.user.id}`;

      // Send league chat notification (fire-and-forget)
      const { notificationService } = context;
      if (notificationService) {
        const chatText = `${senderUsername} renamed "${oldName}" to "${name}"`;
        // Persist the system message
        const msgRows = await db
          .insert(PublicSchema.leagueMessages)
          .values({
            leagueId,
            userId,
            messageText: chatText,
          })
          .returning();

        const msg = msgRows[0];

        try {
          await notificationService.notifyLeagueChatMessage(leagueId, {
            leagueId,
            messageId: msg.id,
            senderId: userId,
            senderUsername,
            messageText: chatText,
            timestamp: msg.timestamp ?? new Date().toISOString(),
          });
        } catch (err: unknown) {
          LOGGER.warn('Failed to send rename chat WS notification', { err });
        }

        // Broadcast a roster-update so all connected clients refetch league data
        try {
          await notificationService.notifyRosterUpdate(leagueId);
        } catch (err: unknown) {
          LOGGER.warn(
            'Failed to send roster update WS notification for rename',
            {
              err,
            },
          );
        }
      }

      return updated[0];
    },
  }),
);

// ── Invite / Remove Assistant Manager ─────────────────────────────────────

/**
 * Single message returned for every invite failure mode (user not found,
 * already a league member, already an assistant manager for this team).
 * Distinct messages per failure previously let a caller enumerate league
 * membership by comparing error text across probes (BTD-003).
 */
const INVITE_FAILURE_MESSAGE =
  'Could not invite user. Check the username and try again.';

/**
 * Caps invite attempts per calling user to prevent username enumeration via
 * repeated probing (BTD-003 / LS-8587). LS-6026 already made every failure
 * mode return the identical message above; this stops volume-based probing
 * that message uniformity alone cannot.
 */
const INVITE_RATE_LIMIT_BUCKET = 'invite_assistant_manager';
const INVITE_RATE_LIMIT_MAX_ATTEMPTS = 10;
const INVITE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Mutation: inviteAssistantManager
 *
 * Allows the General Manager (owner) of a team to invite another user as an
 * assistant manager for that team.  The invited user must already have an
 * account in the system and must not already be a member of the same league.
 *
 * Authorization: caller must be the owner/general_manager of the team, OR a
 * league commissioner.
 */
builder.mutationField('inviteAssistantManager', (t) =>
  t.field({
    type: LeagueMember,
    args: {
      teamId: t.arg.int({ required: true }),
      username: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { teamId, username } = args;
      const userId = context.user.id;
      const db = context.db;

      // 1. Resolve teamId → leagueId
      const teamRows = await db
        .select({
          id: PublicSchema.teams.id,
          leagueId: PublicSchema.teams.leagueId,
        })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.id, teamId))
        .limit(1);

      if (teamRows.length === 0) {
        throw NotFoundError('Team not found');
      }

      const leagueId = teamRows[0].leagueId;

      // 2. Verify caller has permission: must be the team's GM or a commissioner
      const callerMembership = await db
        .select({
          teamId: PublicSchema.leagueMembers.teamId,
          permissionLevel: PublicSchema.leagueMembers.permissionLevel,
        })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      if (callerMembership.length === 0) {
        throw ForbiddenError('You are not a member of this league');
      }

      const callerRole = callerMembership[0];
      const isCommissioner = callerRole.permissionLevel === 'commissioner';
      const isGM = isTeamGeneralManager(
        {
          leagueId,
          userId,
          teamId: callerRole.teamId,
          permissionLevel: callerRole.permissionLevel,
        },
        teamId,
      );

      if (!isGM && !isCommissioner) {
        throw new Error(
          'Only the team General Manager or a league commissioner can invite assistant managers',
        );
      }

      // 3. Rate-limit invite attempts per calling user. Gated here (after
      //    authorization, before the username lookup) so probing only
      //    consumes budget for callers who could actually reach the
      //    enumeration surface below (BTD-003 / LS-8587).
      const rateLimit = await checkAndIncrementRateLimit(db, {
        bucket: INVITE_RATE_LIMIT_BUCKET,
        userId,
        limit: INVITE_RATE_LIMIT_MAX_ATTEMPTS,
        windowMs: INVITE_RATE_LIMIT_WINDOW_MS,
      });
      if (!rateLimit.allowed) {
        throw RateLimitedError();
      }

      // 4. Look up the invitee by username (case-insensitive — BTD-003)
      const inviteeRows = await db
        .select({
          id: PublicSchema.users.id,
          username: PublicSchema.users.username,
        })
        .from(PublicSchema.users)
        .where(ilike(PublicSchema.users.username, username.trim()))
        .limit(1);

      if (inviteeRows.length === 0) {
        throw UserInputError(INVITE_FAILURE_MESSAGE);
      }

      const inviteeId = Number(inviteeRows[0].id);

      if (inviteeId === userId) {
        throw new Error('You cannot invite yourself as an assistant manager');
      }

      // 5. Check the invitee is not already a member of this league
      const existingMembership = await db
        .select({ userId: PublicSchema.leagueMembers.userId })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, inviteeId),
          ),
        )
        .limit(1);

      if (existingMembership.length > 0) {
        throw UserInputError(INVITE_FAILURE_MESSAGE);
      }

      // 6. Insert the new league_members row with assistant_manager permission
      const inserted = await db
        .insert(PublicSchema.leagueMembers)
        .values({
          leagueId,
          userId: inviteeId,
          teamId,
          permissionLevel: 'assistant_manager',
        })
        .returning({
          leagueId: PublicSchema.leagueMembers.leagueId,
          userId: PublicSchema.leagueMembers.userId,
          teamId: PublicSchema.leagueMembers.teamId,
          permissionLevel: PublicSchema.leagueMembers.permissionLevel,
        });

      LOGGER.info('Invited assistant manager', {
        invitedBy: userId,
        inviteeId,
        teamId,
        leagueId,
      });

      // 7. Send a league chat notification
      const senderUsername = context.user.username ?? `user_${userId}`;
      const { notificationService } = context;
      if (notificationService) {
        const chatText = `${senderUsername} added ${username} as an assistant manager`;
        try {
          const msgRows = await db
            .insert(PublicSchema.leagueMessages)
            .values({ leagueId, userId, messageText: chatText })
            .returning();
          const msg = msgRows[0];
          await notificationService.notifyLeagueChatMessage(leagueId, {
            leagueId,
            messageId: msg.id,
            senderId: userId,
            senderUsername,
            messageText: chatText,
            timestamp: msg.timestamp ?? new Date().toISOString(),
          });
        } catch (err: unknown) {
          LOGGER.warn(
            'Failed to send invite assistant manager chat notification',
            { err },
          );
        }
      }

      return inserted[0];
    },
  }),
);

/**
 * Mutation: removeAssistantManager
 *
 * Removes an assistant manager from a team.  Only the team's General Manager
 * or a league commissioner can remove an assistant manager.
 */
builder.mutationField('removeAssistantManager', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      teamId: t.arg.int({ required: true }),
      userId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { teamId, userId: targetUserId } = args;
      const callerId = context.user.id;
      const db = context.db;

      // Resolve leagueId
      const teamRows = await db
        .select({ leagueId: PublicSchema.teams.leagueId })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.id, teamId))
        .limit(1);

      if (teamRows.length === 0) {
        throw NotFoundError('Team not found');
      }

      const leagueId = teamRows[0].leagueId;

      // Verify caller permission
      const callerMembership = await db
        .select({
          teamId: PublicSchema.leagueMembers.teamId,
          permissionLevel: PublicSchema.leagueMembers.permissionLevel,
        })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, callerId),
          ),
        )
        .limit(1);

      if (callerMembership.length === 0) {
        throw ForbiddenError('You are not a member of this league');
      }

      const callerRole = callerMembership[0];
      const isCommissioner = callerRole.permissionLevel === 'commissioner';
      const isGM = isTeamGeneralManager(
        {
          leagueId,
          userId: callerId,
          teamId: callerRole.teamId,
          permissionLevel: callerRole.permissionLevel,
        },
        teamId,
      );

      if (!isGM && !isCommissioner) {
        throw new Error(
          'Only the team General Manager or a league commissioner can remove assistant managers',
        );
      }

      // Verify that the target is actually an assistant_manager for this team
      const targetMembership = await db
        .select({
          permissionLevel: PublicSchema.leagueMembers.permissionLevel,
          teamId: PublicSchema.leagueMembers.teamId,
        })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, targetUserId),
          ),
        )
        .limit(1);

      if (targetMembership.length === 0) {
        throw ForbiddenError('User is not a member of this league');
      }

      if (
        targetMembership[0].permissionLevel !== 'assistant_manager' ||
        targetMembership[0].teamId !== teamId
      ) {
        throw ForbiddenError('User is not an assistant manager for this team');
      }

      // Remove the league_members row
      await db
        .delete(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, targetUserId),
          ),
        );

      LOGGER.info('Removed assistant manager', {
        removedBy: callerId,
        targetUserId,
        teamId,
        leagueId,
      });

      // Send a league chat notification
      const senderUsername = context.user.username ?? `user_${callerId}`;
      const { notificationService } = context;
      if (notificationService) {
        const chatText = `${senderUsername} removed an assistant manager from the team`;
        try {
          const msgRows = await db
            .insert(PublicSchema.leagueMessages)
            .values({ leagueId, userId: callerId, messageText: chatText })
            .returning();
          const msg = msgRows[0];
          await notificationService.notifyLeagueChatMessage(leagueId, {
            leagueId,
            messageId: msg.id,
            senderId: callerId,
            senderUsername,
            messageText: chatText,
            timestamp: msg.timestamp ?? new Date().toISOString(),
          });
        } catch (err: unknown) {
          LOGGER.warn(
            'Failed to send remove assistant manager chat notification',
            { err },
          );
        }
      }

      return true;
    },
  }),
);

// ── Update Team Branding ────────────────────────────────────────────────────

/**
 * Mutation: updateTeamBranding
 *
 * Allows a team's General Manager (or commissioner) to set or clear team
 * branding fields:
 *   - logoUrl: team logo image URL (must be HTTPS)
 *   - primaryColor / secondaryColor: brand hex colours (e.g. #FF0000)
 *   - avatarUrl: team avatar image URL (must be HTTPS)
 *   - bannerUrl: team header/banner image URL (must be HTTPS)
 *
 * Each field is optional; omit to leave unchanged, pass empty string to clear.
 */
builder.mutationField('updateTeamBranding', (t) =>
  t.field({
    type: Team,
    args: {
      teamId: t.arg.int({ required: true }),
      leagueId: t.arg.int({ required: true }),
      logoUrl: t.arg.string({ required: false }),
      primaryColor: t.arg.string({ required: false }),
      secondaryColor: t.arg.string({ required: false }),
      /** New avatar URL, or empty string to clear. Omit to leave unchanged. */
      avatarUrl: t.arg.string({ required: false }),
      /** New banner URL, or empty string to clear. Omit to leave unchanged. */
      bannerUrl: t.arg.string({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { teamId, leagueId, primaryColor, secondaryColor } = args;
      const userId = context.user.id;
      const db = context.db;

      // ── Validate hex colors ────────────────────────────────────────────────
      const hexPattern = /^#[0-9A-Fa-f]{6}$/;
      if (
        primaryColor !== null &&
        primaryColor !== undefined &&
        !hexPattern.test(primaryColor)
      ) {
        throw new Error(
          'primaryColor must be a valid hex color (e.g. #FF0000)',
        );
      }
      if (
        secondaryColor !== null &&
        secondaryColor !== undefined &&
        !hexPattern.test(secondaryColor)
      ) {
        throw new Error(
          'secondaryColor must be a valid hex color (e.g. #FF0000)',
        );
      }

      // ── Validate URL fields ────────────────────────────────────────────────
      const newLogoUrl = validateBrandingUrl(args.logoUrl, 'logoUrl');
      const newAvatarUrl = validateBrandingUrl(args.avatarUrl, 'avatarUrl');
      const newBannerUrl = validateBrandingUrl(args.bannerUrl, 'bannerUrl');

      // ── Verify GM / commissioner ownership ────────────────────────────────
      const membership = await db
        .select({
          teamId: PublicSchema.leagueMembers.teamId,
          permissionLevel: PublicSchema.leagueMembers.permissionLevel,
        })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      if (membership.length === 0) {
        throw ForbiddenError('Not a member of this league');
      }

      const { permissionLevel, teamId: memberTeamId } = membership[0];

      const isCommissioner = permissionLevel === 'commissioner';
      const isGM = isTeamGeneralManager(
        { leagueId, userId, teamId: memberTeamId, permissionLevel },
        teamId,
      );

      if (!isCommissioner && !isGM) {
        throw new Error(
          'Only the team General Manager can update team branding',
        );
      }

      // ── Build update set ───────────────────────────────────────────────────
      const updateSet: Partial<{
        logoUrl: string | null;
        primaryColor: string | null;
        secondaryColor: string | null;
        avatarUrl: string | null;
        bannerUrl: string | null;
        updatedAt: Date;
      }> = { updatedAt: new Date() };

      if (newLogoUrl !== undefined) updateSet.logoUrl = newLogoUrl;
      if (primaryColor !== undefined)
        updateSet.primaryColor = primaryColor ?? null;
      if (secondaryColor !== undefined)
        updateSet.secondaryColor = secondaryColor ?? null;
      if (newAvatarUrl !== undefined) updateSet.avatarUrl = newAvatarUrl;
      if (newBannerUrl !== undefined) updateSet.bannerUrl = newBannerUrl;

      // ── Persist ────────────────────────────────────────────────────────────
      const updated = await db
        .update(PublicSchema.teams)
        .set(updateSet)
        .where(
          and(
            eq(PublicSchema.teams.id, teamId),
            eq(PublicSchema.teams.leagueId, leagueId),
          ),
        )
        .returning({
          id: PublicSchema.teams.id,
          name: PublicSchema.teams.name,
          leagueId: PublicSchema.teams.leagueId,
          divisionId: PublicSchema.teams.divisionId,
          waiverOrder: PublicSchema.teams.waiverOrder,
          faabBudget: PublicSchema.teams.faabBudget,
          isLocked: PublicSchema.teams.isLocked,
          logoUrl: PublicSchema.teams.logoUrl,
          primaryColor: PublicSchema.teams.primaryColor,
          secondaryColor: PublicSchema.teams.secondaryColor,
          avatarUrl: PublicSchema.teams.avatarUrl,
          bannerUrl: PublicSchema.teams.bannerUrl,
          createdAt: PublicSchema.teams.createdAt,
          updatedAt: PublicSchema.teams.updatedAt,
        });

      if (updated.length === 0) {
        throw NotFoundError('Team not found');
      }

      LOGGER.info('Updated team branding', {
        teamId,
        leagueId,
        userId,
      });

      return updated[0];
    },
  }),
);

// ── setTradeBlock ─────────────────────────────────────────────────────────────

builder.mutationField('setTradeBlock', (t) =>
  t.field({
    type: TeamMember,
    description:
      'Mark or unmark a roster player as available for trade. Only the team owner (GM or assistant manager) may call this.',
    args: {
      teamMemberId: t.arg.int({ required: true }),
      onTradeBlock: t.arg.boolean({ required: true }),
      askingPrice: t.arg.string({ required: false }),
    },
    resolve: authorized(
      {
        teamMembers: (args) => [args.teamMemberId],
        // Docstring above states GM or assistant manager may call this (LS-6024).
        allowAssistantManager: true,
      },
      async (_parent, args, _context) => {
        const { teamMemberId, onTradeBlock, askingPrice } = args;
        const db = _context.db;

        const setFields: {
          onTradeBlock: boolean;
          askingPrice?: string | null;
        } = { onTradeBlock };
        if (!onTradeBlock) {
          // Removing from trade block always clears asking price
          setFields.askingPrice = null;
        } else if (askingPrice !== undefined) {
          // Only update asking price when explicitly provided
          setFields.askingPrice = askingPrice ?? null;
        }
        // When onTradeBlock is true and askingPrice is undefined, preserve existing value

        const updated = await db
          .update(PublicSchema.teamMembers)
          .set(setFields)
          .where(eq(PublicSchema.teamMembers.id, teamMemberId))
          .returning({
            id: PublicSchema.teamMembers.id,
            teamId: PublicSchema.teamMembers.teamId,
            leagueId: PublicSchema.teamMembers.leagueId,
            playerId: PublicSchema.teamMembers.playerId,
            positionId: PublicSchema.teamMembers.positionId,
            onTradeBlock: PublicSchema.teamMembers.onTradeBlock,
            askingPrice: PublicSchema.teamMembers.askingPrice,
          });

        if (updated.length === 0) {
          throw new Error('Team member not found');
        }

        const MAX_LOG_PREVIEW = 120;
        const pricePreview =
          askingPrice && askingPrice.length > MAX_LOG_PREVIEW
            ? `${askingPrice.slice(0, MAX_LOG_PREVIEW)}…`
            : (askingPrice ?? null);

        LOGGER.info('Updated trade block status', {
          teamMemberId,
          onTradeBlock,
          askingPrice: onTradeBlock ? pricePreview : null,
        });

        return updated[0];
      },
    ),
  }),
);

// ── setNickname (LS-1813) ────────────────────────────────────────────────────

builder.mutationField('setNickname', (t) =>
  t.field({
    type: TeamMember,
    description:
      'Set or clear a custom nickname for a player on your roster. Pass null or empty string to remove the nickname.',
    args: {
      teamMemberId: t.arg.int({ required: true }),
      nickname: t.arg.string({ required: false }),
    },
    resolve: authorized(
      {
        teamMembers: (args) => [args.teamMemberId],
        // Cosmetic roster customization is a standard assistant-manager action (LS-6024).
        allowAssistantManager: true,
      },
      async (_parent, args, _context) => {
        const { teamMemberId, nickname } = args;
        const db = _context.db;

        // undefined = arg not provided → no-op on nickname
        // null or empty string = explicitly clear nickname
        const nicknameProvided = nickname !== undefined;
        const normalizedNickname =
          nickname && nickname.trim().length > 0
            ? nickname.trim().slice(0, 50)
            : null;

        const updated = await db
          .update(PublicSchema.teamMembers)
          .set(nicknameProvided ? { nickname: normalizedNickname } : {})
          .where(eq(PublicSchema.teamMembers.id, teamMemberId))
          .returning({
            id: PublicSchema.teamMembers.id,
            teamId: PublicSchema.teamMembers.teamId,
            leagueId: PublicSchema.teamMembers.leagueId,
            playerId: PublicSchema.teamMembers.playerId,
            positionId: PublicSchema.teamMembers.positionId,
            onTradeBlock: PublicSchema.teamMembers.onTradeBlock,
            nickname: PublicSchema.teamMembers.nickname,
            salary: PublicSchema.teamMembers.salary,
          });

        if (updated.length === 0) {
          throw new Error('Team member not found');
        }

        LOGGER.info('Updated player nickname', {
          teamMemberId,
          nickname: normalizedNickname,
        });

        return updated[0];
      },
    ),
  }),
);
