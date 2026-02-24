/**
 * Draft domain — mutation fields
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { createNotificationService } from '@legacy-sports/aws-utils';
import { LOGGER } from '@legacy-sports/logging';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';

import {
  Draft,
  DraftPick,
  UpdateDraftSettingsInput,
  UpdateDraftSettingsPayload,
} from './types';
import { getCurrentDraftPickInfo } from './helpers';
import { builder } from '../builder';
import { createAllMatchupsForLeague } from '../matchups/mutations';

/**
 * Mutation: Make a draft pick
 *
 * Runs inside a serializable transaction with SELECT ... FOR UPDATE on the
 * drafts row to prevent race conditions from concurrent requests.
 *
 * Validates:
 * - Auth, draft status (in-progress, not paused), turn ownership
 * - Player availability, player pool eligibility, roster limits
 * - Idempotency (returns existing pick if same player at same overallPick)
 */
builder.mutationField('makeDraftPick', (t) =>
  t.field({
    type: DraftPick,
    args: {
      draftId: t.arg.int({ required: true }),
      playerId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required to make a draft pick');
      }

      const { draftId, playerId } = args;
      const userId = context.user.id;

      try {
        // Entire pick operation runs in a transaction with row-level locking
        const result = await context.db.transaction(async (tx) => {
          // Lock the draft row to serialize concurrent pick attempts
          const draftRows = await tx.execute(
            sql`SELECT * FROM drafts WHERE id = ${draftId} FOR UPDATE`,
          );
          const draft = draftRows.rows[0] as
            | {
                id: number;
                league_id: number;
                current_pick: number;
                draft_order: string;
                draft_mode: string;
                selection_method: string;
                draft_started_at: Date | null;
                draft_completed_at: Date | null;
              }
            | undefined;

          if (!draft) {
            throw new Error('Draft not found');
          }

          // Fetch league to validate draft status and get maxRosterSize
          const [league] = await tx
            .select()
            .from(PublicSchema.leagues)
            .where(eq(PublicSchema.leagues.id, draft.league_id))
            .limit(1);

          if (!league) {
            throw new Error('League not found');
          }

          if (league.draftStatus === 'paused') {
            throw new Error(
              'Draft is currently paused. Wait for the commissioner to resume.',
            );
          }

          if (league.draftStatus !== 'in-progress') {
            throw new Error(
              `Draft is not in progress (current status: ${league.draftStatus ?? 'unknown'})`,
            );
          }

          // Calculate current pick info using the locked draft row
          const currentPickInfo = await getCurrentDraftPickInfo(tx, draftId);

          if (!currentPickInfo) {
            throw new Error('Could not determine current pick');
          }

          if (currentPickInfo.isComplete) {
            throw new Error('Draft is already complete');
          }

          // Idempotency: if this exact pick was already made, return it
          const [existingOwnPick] = await tx
            .select()
            .from(PublicSchema.draftPicks)
            .where(
              and(
                eq(PublicSchema.draftPicks.draftId, draftId),
                eq(PublicSchema.draftPicks.playerId, playerId),
                eq(PublicSchema.draftPicks.teamId, currentPickInfo.teamId),
                eq(
                  PublicSchema.draftPicks.overallPick,
                  currentPickInfo.overallPick,
                ),
              ),
            )
            .limit(1);

          if (existingOwnPick) {
            LOGGER.info('Idempotent pick detected, returning existing pick', {
              draftId,
              playerId,
              pickId: existingOwnPick.id,
            });
            return {
              draftPick: existingOwnPick,
              isDraftComplete: false,
              leagueId: draft.league_id,
              selectionMethod: draft.selection_method,
              currentPickInfo,
              nextPickInfo: null,
            };
          }

          // Verify user owns the team whose turn it is
          const leagueMembers = await tx
            .select()
            .from(PublicSchema.leagueMembers)
            .where(
              and(
                eq(PublicSchema.leagueMembers.leagueId, draft.league_id),
                eq(PublicSchema.leagueMembers.userId, userId),
              ),
            )
            .limit(1);

          const membership = leagueMembers[0];

          if (!membership || membership.teamId !== currentPickInfo.teamId) {
            throw new Error(
              'Not authorized: It is not your turn to pick or you do not own this team',
            );
          }

          // Check if player has already been drafted (by another team)
          const existingPick = await tx
            .select()
            .from(PublicSchema.draftPicks)
            .where(
              and(
                eq(PublicSchema.draftPicks.draftId, draftId),
                eq(PublicSchema.draftPicks.playerId, playerId),
              ),
            )
            .limit(1);

          if (existingPick.length > 0) {
            throw new Error('Player has already been drafted');
          }

          // Verify player exists
          const [player] = await tx
            .select()
            .from(PublicSchema.players)
            .where(eq(PublicSchema.players.id, playerId))
            .limit(1);

          if (!player) {
            throw new Error('Player not found');
          }

          // Validate player is in the league's player pool (AL/NL restriction)
          if (league.playerPool !== 'all') {
            const poolUpper = league.playerPool.toUpperCase();
            const poolResult = await tx.execute(
              sql`SELECT 1 FROM season_batting
                  WHERE player_id = ${playerId} AND lg_id = ${poolUpper}
                  LIMIT 1`,
            );
            const inPool = poolResult.rows[0];
            if (!inPool) {
              throw new Error(`Player is not in the ${poolUpper} player pool`);
            }
          }

          // Validate roster limit — count existing team members
          const [rosterCount] = await tx
            .select({ count: count() })
            .from(PublicSchema.teamMembers)
            .where(
              and(
                eq(PublicSchema.teamMembers.teamId, currentPickInfo.teamId),
                eq(PublicSchema.teamMembers.leagueId, draft.league_id),
              ),
            );

          if (
            rosterCount &&
            Number(rosterCount.count) >= league.maxRosterSize
          ) {
            throw new Error(
              `Team roster is full (${league.maxRosterSize} players maximum)`,
            );
          }

          const now = new Date();

          // Create the draft pick
          const [draftPick] = await tx
            .insert(PublicSchema.draftPicks)
            .values({
              draftId,
              teamId: currentPickInfo.teamId,
              playerId,
              round: currentPickInfo.round,
              pickNumber: currentPickInfo.pickNumber,
              overallPick: currentPickInfo.overallPick,
              pickedAt: now,
            })
            .returning();

          // Determine if this is the first pick (set draftStartedAt)
          const isFirstPick = draft.current_pick === 0;

          // Compute total picks dynamically from current league settings
          const numTeams = (
            await tx
              .select()
              .from(PublicSchema.draftTeams)
              .where(eq(PublicSchema.draftTeams.draftId, draftId))
          ).length;
          const totalPicks = numTeams * league.maxRosterSize;
          const isDraftComplete = currentPickInfo.overallPick >= totalPicks;

          // Update draft: advance currentPick, conditionally set started/completed timestamps
          await tx
            .update(PublicSchema.drafts)
            .set({
              currentPick: currentPickInfo.overallPick,
              updatedAt: now,
              ...(isFirstPick ? { draftStartedAt: now } : {}),
              ...(isDraftComplete ? { draftCompletedAt: now } : {}),
            })
            .where(eq(PublicSchema.drafts.id, draftId));

          // If draft is complete, update league status
          if (isDraftComplete) {
            await tx
              .update(PublicSchema.leagues)
              .set({ draftStatus: 'completed' })
              .where(eq(PublicSchema.leagues.id, draft.league_id));
          }

          // Add player to team roster
          await tx.insert(PublicSchema.teamMembers).values({
            teamId: currentPickInfo.teamId,
            leagueId: draft.league_id,
            playerId,
            draftRound: currentPickInfo.round,
            draftPick: currentPickInfo.pickNumber,
            acquisitionType: 'draft',
          });

          // Calculate next pick info for notification payload
          let nextPickInfo: Awaited<
            ReturnType<typeof getCurrentDraftPickInfo>
          > = null;
          if (!isDraftComplete) {
            nextPickInfo = await getCurrentDraftPickInfo(tx, draftId);
          }

          return {
            draftPick,
            isDraftComplete,
            leagueId: draft.league_id,
            selectionMethod: draft.selection_method,
            currentPickInfo,
            nextPickInfo,
          };
        });

        LOGGER.info('Draft pick made successfully', {
          draftId,
          playerId,
          teamId: result.currentPickInfo.teamId,
          round: result.currentPickInfo.round,
          pick: result.currentPickInfo.pickNumber,
          overallPick: result.currentPickInfo.overallPick,
          isDraftComplete: result.isDraftComplete,
        });

        // Send WebSocket notification for the pick (outside transaction)
        if (context.notificationService) {
          await context.notificationService.notifyDraftPickMade(
            result.leagueId,
            draftId,
            result.draftPick.id,
            result.currentPickInfo.teamId,
            playerId,
            result.currentPickInfo.round,
            result.currentPickInfo.pickNumber,
            result.currentPickInfo.overallPick,
            result.nextPickInfo
              ? {
                  teamId: result.nextPickInfo.teamId,
                  round: result.nextPickInfo.round,
                  pickNumber: result.nextPickInfo.pickNumber,
                  overallPick: result.nextPickInfo.overallPick,
                }
              : undefined,
          );

          // If draft completed, also send draft-completed notification
          if (result.isDraftComplete) {
            await context.notificationService.notifyDraftCompleted(
              result.leagueId,
              result.selectionMethod,
            );
          }
        }

        // Auto-create all matchups when draft completes
        if (result.isDraftComplete) {
          try {
            const matchupResult = await createAllMatchupsForLeague(
              context.db,
              result.leagueId,
            );
            LOGGER.info('Auto-created matchups after draft completion', {
              leagueId: result.leagueId,
              matchupCount: matchupResult.matchupCount,
            });
          } catch (matchupError) {
            // Log but don't fail the draft pick — matchups can be created manually
            LOGGER.error('Failed to auto-create matchups after draft', {
              leagueId: result.leagueId,
              error:
                matchupError instanceof Error
                  ? matchupError.message
                  : String(matchupError),
            });
          }
        }

        return result.draftPick;
      } catch (error) {
        LOGGER.error('Error making draft pick', {
          draftId,
          playerId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
);

/**
 * Mutation: Initialize a live draft
 * Creates the drafts record, randomizes team order into draft_teams, and
 * sets the league's draftStatus to 'in-progress' so makeDraftPick can proceed.
 * Unlike startDraft (which queues an automated random draft to SQS), this
 * supports a human pick-by-pick draft session.
 */
builder.mutationField('initializeLiveDraft', (t) =>
  t.field({
    type: Draft,
    args: {
      leagueId: t.arg.int({ required: true }),
      draftOrder: t.arg.string({ required: false }), // 'snake' (default) | 'linear'
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required to initialize a draft');
      }

      const { leagueId, draftOrder = 'snake' } = args;
      const userId = context.user.id;

      if (draftOrder !== 'snake' && draftOrder !== 'linear') {
        throw new Error("draftOrder must be 'snake' or 'linear'");
      }

      try {
        // Fetch league
        const [league] = await context.db
          .select()
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1);

        if (!league) {
          throw new Error('League not found');
        }

        if (league.draftStatus !== 'not-started') {
          throw new Error(
            `Cannot initialize draft: current status is '${league.draftStatus}'`,
          );
        }

        // Verify user is the league owner
        const [membership] = await context.db
          .select()
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, leagueId),
              eq(PublicSchema.leagueMembers.userId, userId),
            ),
          )
          .limit(1);

        if (!membership || membership.permissionLevel !== 'owner') {
          throw new Error('Only the league owner can initialize a draft');
        }

        // Get all teams in the league
        const teams = await context.db
          .select({ id: PublicSchema.teams.id })
          .from(PublicSchema.teams)
          .where(eq(PublicSchema.teams.leagueId, leagueId))
          .orderBy(asc(PublicSchema.teams.id));

        if (teams.length < 2) {
          throw new Error('At least 2 teams are required to start a draft');
        }

        // Fisher-Yates shuffle for randomized draft order
        const shuffled = [...teams];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        // Upsert the draft record — update the existing one from league creation,
        // or create a new one if somehow missing
        const [existingDraft] = await context.db
          .select({ id: PublicSchema.drafts.id })
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.leagueId, leagueId))
          .orderBy(desc(PublicSchema.drafts.createdAt))
          .limit(1);

        let draft;
        if (existingDraft) {
          // Clear any leftover draft_teams from a previous initialization
          await context.db
            .delete(PublicSchema.draftTeams)
            .where(eq(PublicSchema.draftTeams.draftId, existingDraft.id));

          // Clear any leftover draft_picks from a previous initialization
          await context.db
            .delete(PublicSchema.draftPicks)
            .where(eq(PublicSchema.draftPicks.draftId, existingDraft.id));

          const [updated] = await context.db
            .update(PublicSchema.drafts)
            .set({
              draftMode: 'live',
              selectionMethod: 'standard',
              draftOrder: draftOrder,
              currentPick: 0,
              draftStartedAt: new Date(),
              draftCompletedAt: null,
            })
            .where(eq(PublicSchema.drafts.id, existingDraft.id))
            .returning();
          draft = updated;
        } else {
          const [created] = await context.db
            .insert(PublicSchema.drafts)
            .values({
              leagueId,
              draftMode: 'live',
              selectionMethod: 'standard',
              draftOrder: draftOrder,
              currentPick: 0,
              draftStartedAt: new Date(),
            })
            .returning();
          draft = created;
        }

        // Insert draft_teams with the randomized order (1-indexed)
        await context.db.insert(PublicSchema.draftTeams).values(
          shuffled.map((team, index) => ({
            draftId: draft.id,
            teamId: team.id,
            leagueId,
            draftOrder: index + 1,
          })),
        );

        // Update league status to in-progress
        await context.db
          .update(PublicSchema.leagues)
          .set({ draftStatus: 'in-progress' })
          .where(eq(PublicSchema.leagues.id, leagueId));

        LOGGER.info('Live draft initialized', {
          leagueId,
          draftId: draft.id,
          draftOrder,
          teamCount: teams.length,
        });

        // Notify all league connections that the draft has started
        if (context.notificationService) {
          await context.notificationService.notifyDraftStarted(
            leagueId,
            draft.id,
            draftOrder,
            teams.length,
          );
        }

        return draft;
      } catch (error) {
        LOGGER.error('Error initializing live draft', {
          leagueId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
);

/**
 * Mutation: Update draft settings (mode, selection method, order, player pool).
 * Only allowed when the league's draftStatus is 'not-started'.
 */
builder.mutationField('updateDraftSettings', (t) =>
  t.field({
    type: UpdateDraftSettingsPayload,
    args: {
      input: t.arg({ type: UpdateDraftSettingsInput, required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required to update draft settings');
      }

      const { leagueId, draftMode, selectionMethod, draftOrder, playerPool } =
        args.input;
      const userId = context.user.id;

      try {
        // Verify user is the league owner
        const [league] = await context.db
          .select({
            id: PublicSchema.leagues.id,
            owner: PublicSchema.leagues.owner,
            draftStatus: PublicSchema.leagues.draftStatus,
            playerPool: PublicSchema.leagues.playerPool,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1);

        if (!league) {
          throw new Error('League not found');
        }

        if (league.owner !== userId) {
          throw new Error('Only the league owner can update draft settings');
        }

        // Prevent changes after draft has started
        if (league.draftStatus !== 'not-started') {
          throw new Error(
            'Draft settings cannot be changed after the draft has been started',
          );
        }

        // Validate enum values
        const validDraftModes = ['live', 'automated'];
        const validSelectionMethods = ['standard', 'auction', 'random'];
        const validDraftOrders = ['snake', 'linear'];
        const validPlayerPools = ['all', 'nl', 'al'];

        if (draftMode && !validDraftModes.includes(draftMode)) {
          throw new Error(
            `Invalid draft mode: ${draftMode}. Must be one of: ${validDraftModes.join(', ')}`,
          );
        }
        if (
          selectionMethod &&
          !validSelectionMethods.includes(selectionMethod)
        ) {
          throw new Error(
            `Invalid selection method: ${selectionMethod}. Must be one of: ${validSelectionMethods.join(', ')}`,
          );
        }
        if (draftOrder && !validDraftOrders.includes(draftOrder)) {
          throw new Error(
            `Invalid draft order: ${draftOrder}. Must be one of: ${validDraftOrders.join(', ')}`,
          );
        }
        if (playerPool && !validPlayerPools.includes(playerPool)) {
          throw new Error(
            `Invalid player pool: ${playerPool}. Must be one of: ${validPlayerPools.join(', ')}`,
          );
        }

        // Update playerPool on the league if provided
        let updatedPlayerPool = league.playerPool;
        if (playerPool) {
          const [updatedLeague] = await context.db
            .update(PublicSchema.leagues)
            .set({
              playerPool: playerPool as 'all' | 'nl' | 'al',
              updatedAt: new Date(),
            })
            .where(eq(PublicSchema.leagues.id, leagueId))
            .returning({ playerPool: PublicSchema.leagues.playerPool });
          updatedPlayerPool = updatedLeague.playerPool;
        }

        // Check if a draft record exists, create one if not
        let [existingDraft] = await context.db
          .select()
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.leagueId, leagueId))
          .limit(1);

        // Cross-validate: automated drafts only support 'random' selection
        const effectiveDraftMode = draftMode ?? existingDraft?.draftMode;
        const effectiveSelectionMethod =
          selectionMethod ?? existingDraft?.selectionMethod;

        if (
          effectiveDraftMode === 'automated' &&
          effectiveSelectionMethod &&
          effectiveSelectionMethod !== 'random'
        ) {
          throw new Error(
            "Automated drafts only support the 'random' selection method.",
          );
        }

        const draftUpdates: Record<string, unknown> = {
          updatedAt: new Date(),
        };
        if (draftMode) {
          draftUpdates['draftMode'] = draftMode as 'live' | 'automated';
        }
        if (selectionMethod) {
          draftUpdates['selectionMethod'] = selectionMethod as
            | 'standard'
            | 'auction'
            | 'random';
        }
        if (draftOrder) {
          draftUpdates['draftOrder'] = draftOrder as 'snake' | 'linear';
        }

        if (existingDraft) {
          const [updated] = await context.db
            .update(PublicSchema.drafts)
            .set(draftUpdates)
            .where(eq(PublicSchema.drafts.id, existingDraft.id))
            .returning();
          existingDraft = updated;
        } else {
          const [created] = await context.db
            .insert(PublicSchema.drafts)
            .values({
              leagueId,
              draftMode: (draftMode as 'live' | 'automated') || 'live',
              selectionMethod:
                (selectionMethod as 'standard' | 'auction' | 'random') ||
                'standard',
              draftOrder: (draftOrder as 'snake' | 'linear') || 'snake',
              currentPick: 0,
            })
            .returning();
          existingDraft = created;
        }

        LOGGER.info('Draft settings updated successfully', {
          leagueId,
          draftMode: existingDraft.draftMode,
          selectionMethod: existingDraft.selectionMethod,
          draftOrder: existingDraft.draftOrder,
          playerPool: updatedPlayerPool,
        });

        // Post a system chat notification so all league members see the change
        const username = context.user.username ?? `user_${userId}`;
        const changedFields: string[] = [];
        if (draftMode) changedFields.push(`mode → ${draftMode}`);
        if (selectionMethod)
          changedFields.push(`selection → ${selectionMethod}`);
        if (draftOrder) changedFields.push(`order → ${draftOrder}`);
        if (playerPool) changedFields.push(`player pool → ${playerPool}`);
        const changesSummary =
          changedFields.length > 0 ? ` (${changedFields.join(', ')})` : '';
        const notificationText = `${username} updated draft settings${changesSummary}.`;

        const [chatMsg] = await context.db
          .insert(PublicSchema.leagueMessages)
          .values({ leagueId, userId, messageText: notificationText })
          .returning();

        const notificationService = createNotificationService();
        if (notificationService) {
          notificationService
            .notifyLeagueChatMessage(leagueId, {
              leagueId,
              messageId: chatMsg.id,
              senderId: userId,
              senderUsername: username,
              messageText: notificationText,
              timestamp: chatMsg.timestamp ?? new Date().toISOString(),
            })
            .catch((err: unknown) => {
              LOGGER.warn(
                'Failed to send league chat WS notification for settings update',
                { err },
              );
            });
        }

        return {
          ...existingDraft,
          playerPool: updatedPlayerPool,
        };
      } catch (error) {
        LOGGER.error('Error updating draft settings', {
          leagueId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
);

// ── Pause / Resume Draft ────────────────────────────────────────────────────

/**
 * Mutation: Pause a live draft
 * Only the league owner/commissioner can pause. Sets status to 'paused'
 * so makeDraftPick will reject picks until resumed.
 */
builder.mutationField('pauseDraft', (t) =>
  t.field({
    type: Draft,
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { leagueId } = args;
      const userId = context.user.id;

      // Verify user is a league owner/commissioner
      const [membership] = await context.db
        .select()
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      if (
        !membership ||
        (membership.permissionLevel !== 'owner' &&
          membership.permissionLevel !== 'commissioner')
      ) {
        throw new Error(
          'Only the league owner or commissioner can pause the draft',
        );
      }

      // Verify draft is in-progress
      const [league] = await context.db
        .select()
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, leagueId))
        .limit(1);

      if (!league) {
        throw new Error('League not found');
      }

      if (league.draftStatus !== 'in-progress') {
        throw new Error(
          `Cannot pause draft: current status is '${league.draftStatus}'`,
        );
      }

      // Update league status to paused
      await context.db
        .update(PublicSchema.leagues)
        .set({ draftStatus: 'paused' })
        .where(eq(PublicSchema.leagues.id, leagueId));

      // Get the draft record to return
      const [draft] = await context.db
        .select()
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.leagueId, leagueId))
        .orderBy(desc(PublicSchema.drafts.createdAt))
        .limit(1);

      LOGGER.info('Draft paused', { leagueId, userId });

      // Notify all league connections
      if (context.notificationService) {
        await context.notificationService.notifyDraftPaused(leagueId);
      }

      return draft;
    },
  }),
);

/**
 * Mutation: Resume a paused draft
 * Only the league owner/commissioner can resume. Sets status back to 'in-progress'.
 */
builder.mutationField('resumeDraft', (t) =>
  t.field({
    type: Draft,
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { leagueId } = args;
      const userId = context.user.id;

      // Verify user is a league owner/commissioner
      const [membership] = await context.db
        .select()
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      if (
        !membership ||
        (membership.permissionLevel !== 'owner' &&
          membership.permissionLevel !== 'commissioner')
      ) {
        throw new Error(
          'Only the league owner or commissioner can resume the draft',
        );
      }

      // Verify draft is paused
      const [league] = await context.db
        .select()
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, leagueId))
        .limit(1);

      if (!league) {
        throw new Error('League not found');
      }

      if (league.draftStatus !== 'paused') {
        throw new Error(
          `Cannot resume draft: current status is '${league.draftStatus}'`,
        );
      }

      // Update league status back to in-progress
      await context.db
        .update(PublicSchema.leagues)
        .set({ draftStatus: 'in-progress' })
        .where(eq(PublicSchema.leagues.id, leagueId));

      // Get the draft record to return
      const [draft] = await context.db
        .select()
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.leagueId, leagueId))
        .orderBy(desc(PublicSchema.drafts.createdAt))
        .limit(1);

      LOGGER.info('Draft resumed', { leagueId, userId });

      // Notify all league connections
      if (context.notificationService) {
        await context.notificationService.notifyDraftResumed(leagueId);
      }

      return draft;
    },
  }),
);

// ── Commissioner Pick ───────────────────────────────────────────────────────

/**
 * Mutation: Commissioner makes a pick on behalf of a team owner
 *
 * Allows the league owner/commissioner to make a pick for any team when
 * that team's owner is absent (e.g., timed out, disconnected).
 * Same validation as makeDraftPick except the turn-ownership check
 * is replaced by a commissioner permission check.
 */
builder.mutationField('commissionerPick', (t) =>
  t.field({
    type: DraftPick,
    args: {
      draftId: t.arg.int({ required: true }),
      playerId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { draftId, playerId } = args;
      const userId = context.user.id;

      try {
        const result = await context.db.transaction(async (tx) => {
          // Lock the draft row
          const draftRows = await tx.execute(
            sql`SELECT * FROM drafts WHERE id = ${draftId} FOR UPDATE`,
          );
          const draft = draftRows.rows[0] as
            | {
                id: number;
                league_id: number;
                current_pick: number;
                draft_order: string;
                selection_method: string;
              }
            | undefined;

          if (!draft) {
            throw new Error('Draft not found');
          }

          // Verify user is league owner or commissioner
          const [membership] = await tx
            .select()
            .from(PublicSchema.leagueMembers)
            .where(
              and(
                eq(PublicSchema.leagueMembers.leagueId, draft.league_id),
                eq(PublicSchema.leagueMembers.userId, userId),
              ),
            )
            .limit(1);

          if (
            !membership ||
            (membership.permissionLevel !== 'owner' &&
              membership.permissionLevel !== 'commissioner')
          ) {
            throw new Error(
              'Only the league owner or commissioner can make picks on behalf of others',
            );
          }

          const [league] = await tx
            .select()
            .from(PublicSchema.leagues)
            .where(eq(PublicSchema.leagues.id, draft.league_id))
            .limit(1);

          if (!league) {
            throw new Error('League not found');
          }

          if (
            league.draftStatus !== 'in-progress' &&
            league.draftStatus !== 'paused'
          ) {
            throw new Error(
              `Draft is not in progress (current status: ${league.draftStatus ?? 'unknown'})`,
            );
          }

          const currentPickInfo = await getCurrentDraftPickInfo(tx, draftId);

          if (!currentPickInfo || currentPickInfo.isComplete) {
            throw new Error('Draft is already complete');
          }

          // Check player availability
          const existingPick = await tx
            .select()
            .from(PublicSchema.draftPicks)
            .where(
              and(
                eq(PublicSchema.draftPicks.draftId, draftId),
                eq(PublicSchema.draftPicks.playerId, playerId),
              ),
            )
            .limit(1);

          if (existingPick.length > 0) {
            throw new Error('Player has already been drafted');
          }

          const [player] = await tx
            .select()
            .from(PublicSchema.players)
            .where(eq(PublicSchema.players.id, playerId))
            .limit(1);

          if (!player) {
            throw new Error('Player not found');
          }

          const now = new Date();

          const [draftPick] = await tx
            .insert(PublicSchema.draftPicks)
            .values({
              draftId,
              teamId: currentPickInfo.teamId,
              playerId,
              round: currentPickInfo.round,
              pickNumber: currentPickInfo.pickNumber,
              overallPick: currentPickInfo.overallPick,
              pickedAt: now,
            })
            .returning();

          const numTeams = (
            await tx
              .select()
              .from(PublicSchema.draftTeams)
              .where(eq(PublicSchema.draftTeams.draftId, draftId))
          ).length;
          const totalPicks = numTeams * league.maxRosterSize;
          const isDraftComplete = currentPickInfo.overallPick >= totalPicks;

          await tx
            .update(PublicSchema.drafts)
            .set({
              currentPick: currentPickInfo.overallPick,
              updatedAt: now,
              ...(isDraftComplete ? { draftCompletedAt: now } : {}),
            })
            .where(eq(PublicSchema.drafts.id, draftId));

          if (isDraftComplete) {
            await tx
              .update(PublicSchema.leagues)
              .set({ draftStatus: 'completed' })
              .where(eq(PublicSchema.leagues.id, draft.league_id));
          }

          await tx.insert(PublicSchema.teamMembers).values({
            teamId: currentPickInfo.teamId,
            leagueId: draft.league_id,
            playerId,
            draftRound: currentPickInfo.round,
            draftPick: currentPickInfo.pickNumber,
            acquisitionType: 'draft',
          });

          let nextPickInfo: Awaited<
            ReturnType<typeof getCurrentDraftPickInfo>
          > = null;
          if (!isDraftComplete) {
            nextPickInfo = await getCurrentDraftPickInfo(tx, draftId);
          }

          return {
            draftPick,
            isDraftComplete,
            leagueId: draft.league_id,
            selectionMethod: draft.selection_method,
            currentPickInfo,
            nextPickInfo,
          };
        });

        LOGGER.info('Commissioner pick made', {
          draftId,
          playerId,
          byUserId: userId,
          teamId: result.currentPickInfo.teamId,
          overallPick: result.currentPickInfo.overallPick,
        });

        if (context.notificationService) {
          await context.notificationService.notifyDraftPickMade(
            result.leagueId,
            draftId,
            result.draftPick.id,
            result.currentPickInfo.teamId,
            playerId,
            result.currentPickInfo.round,
            result.currentPickInfo.pickNumber,
            result.currentPickInfo.overallPick,
            result.nextPickInfo
              ? {
                  teamId: result.nextPickInfo.teamId,
                  round: result.nextPickInfo.round,
                  pickNumber: result.nextPickInfo.pickNumber,
                  overallPick: result.nextPickInfo.overallPick,
                }
              : undefined,
          );

          if (result.isDraftComplete) {
            await context.notificationService.notifyDraftCompleted(
              result.leagueId,
              result.selectionMethod,
            );
          }
        }

        // Auto-create all matchups when draft completes
        if (result.isDraftComplete) {
          try {
            const matchupResult = await createAllMatchupsForLeague(
              context.db,
              result.leagueId,
            );
            LOGGER.info(
              'Auto-created matchups after commissioner draft completion',
              {
                leagueId: result.leagueId,
                matchupCount: matchupResult.matchupCount,
              },
            );
          } catch (matchupError) {
            LOGGER.error(
              'Failed to auto-create matchups after commissioner draft',
              {
                leagueId: result.leagueId,
                error:
                  matchupError instanceof Error
                    ? matchupError.message
                    : String(matchupError),
              },
            );
          }
        }

        return result.draftPick;
      } catch (error) {
        LOGGER.error('Error making commissioner pick', {
          draftId,
          playerId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
);
