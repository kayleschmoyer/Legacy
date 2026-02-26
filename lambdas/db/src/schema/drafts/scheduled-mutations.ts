/**
 * Draft domain — scheduled (system) mutation for auto-picking expired draft picks.
 *
 * Triggered every minute by EventBridge. Finds all in-progress drafts where
 * `current_pick_deadline` has passed, then auto-picks the best available
 * player for the timed-out team.
 *
 * Uses the same 3-tier auth pattern as other scheduled mutations:
 *   - System API key (EventBridge) → allowed for ALL leagues
 *   - Admin user → allowed for ALL leagues
 *   - Commissioner / General Manager → allowed for their league only
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { createNotificationService } from '@legacy-sports/aws-utils';
import { LOGGER } from '@legacy-sports/logging';
import { and, count, eq, sql } from 'drizzle-orm';

import { getCurrentDraftPickInfo } from './helpers';
import { builder } from '../builder';
import { assertAuthorized } from '../matchups/scheduled-mutations';
import { createAllMatchupsForLeague } from '../matchups/mutations';

// ── Response Type ────────────────────────────────────────────────────────────

interface AutoProcessDraftPicksResultShape {
  draftsProcessed: number;
  picksAutoMade: number;
  draftsCompleted: number;
  errors: string[];
}

const AutoProcessDraftPicksResult =
  builder.objectRef<AutoProcessDraftPicksResultShape>(
    'AutoProcessDraftPicksResult',
  );

builder.objectType(AutoProcessDraftPicksResult, {
  description:
    'Result of the automated draft pick processing for expired deadlines',
  fields: (t) => ({
    draftsProcessed: t.exposeInt('draftsProcessed'),
    picksAutoMade: t.exposeInt('picksAutoMade'),
    draftsCompleted: t.exposeInt('draftsCompleted'),
    errors: t.exposeStringList('errors'),
  }),
});

// ── Mutation: autoProcessDraftPicks ──────────────────────────────────────────
// Triggered every minute by EventBridge.
// Finds in-progress drafts with expired currentPickDeadline, auto-picks the
// best available player (highest-id, simple deterministic fallback), and
// advances the draft.

builder.mutationField('autoProcessDraftPicks', (t) =>
  t.field({
    type: AutoProcessDraftPicksResult,
    args: {
      leagueId: t.arg.int({
        required: false,
        description:
          'Optional: restrict to a single league. Required for commissioner-level access.',
      }),
    },
    description:
      'Automatically make draft picks for teams that have exceeded their pick deadline. Triggered every minute by EventBridge.',
    resolve: async (_parent, args, context) => {
      const leagueId = args.leagueId ?? null;
      await assertAuthorized(context, leagueId);

      LOGGER.info('[autoProcessDraftPicks] Starting expired draft pick scan');

      const result: AutoProcessDraftPicksResultShape = {
        draftsProcessed: 0,
        picksAutoMade: 0,
        draftsCompleted: 0,
        errors: [],
      };

      try {
        // Find all in-progress drafts with expired deadlines
        const now = new Date();
        const expiredDraftsQuery = sql`
          SELECT d.id AS draft_id, d.league_id, d.current_pick,
                 d.draft_order, d.selection_method, d.pick_time_limit_seconds
          FROM drafts d
          INNER JOIN leagues l ON l.id = d.league_id
          WHERE l.draft_status = 'in-progress'
            AND d.current_pick_deadline IS NOT NULL
            AND d.current_pick_deadline <= ${now}
            ${leagueId ? sql`AND d.league_id = ${leagueId}` : sql``}
          ORDER BY d.current_pick_deadline ASC
        `;

        const expiredDrafts = await context.db.execute(expiredDraftsQuery);

        if (expiredDrafts.rows.length === 0) {
          LOGGER.info('[autoProcessDraftPicks] No expired draft picks found');
          return result;
        }

        LOGGER.info(
          `[autoProcessDraftPicks] Found ${expiredDrafts.rows.length} drafts with expired deadlines`,
        );

        const notificationService = createNotificationService();

        for (const row of expiredDrafts.rows) {
          const draftId = row.draft_id as number;
          const draftLeagueId = row.league_id as number;
          const pickTimeLimitSeconds = row.pick_time_limit_seconds as number;

          try {
            result.draftsProcessed++;

            // Process the expired pick inside a serializable transaction
            const pickResult = await context.db.transaction(async (tx) => {
              // Lock the draft row
              const draftRows = await tx.execute(
                sql`SELECT * FROM drafts WHERE id = ${draftId} FOR UPDATE`,
              );
              const draft = draftRows.rows[0] as
                | {
                    id: number;
                    league_id: number;
                    current_pick: number;
                    current_pick_deadline: Date | null;
                  }
                | undefined;

              if (!draft) {
                throw new Error(`Draft ${draftId} not found`);
              }

              // Re-check deadline inside transaction (may have been picked by user)
              if (
                !draft.current_pick_deadline ||
                new Date(draft.current_pick_deadline) > now
              ) {
                LOGGER.info(
                  `[autoProcessDraftPicks] Draft ${draftId} deadline no longer expired (pick was made), skipping`,
                );
                return null;
              }

              // Verify league still in-progress
              const [league] = await tx
                .select()
                .from(PublicSchema.leagues)
                .where(eq(PublicSchema.leagues.id, draftLeagueId))
                .limit(1);

              if (!league || league.draftStatus !== 'in-progress') {
                LOGGER.info(
                  `[autoProcessDraftPicks] League ${draftLeagueId} is not in-progress, skipping draft ${draftId}`,
                );
                return null;
              }

              // Get current pick info
              const currentPickInfo = await getCurrentDraftPickInfo(
                tx,
                draftId,
              );

              if (!currentPickInfo || currentPickInfo.isComplete) {
                LOGGER.info(
                  `[autoProcessDraftPicks] Draft ${draftId} is already complete`,
                );
                return null;
              }

              // Find the best available player (not yet drafted)
              // Strategy: pick the first available player by ID (deterministic)
              // from the league's player pool
              const playerPoolCondition =
                league.playerPool !== 'all'
                  ? sql`AND p.id IN (
                      SELECT sb.player_id FROM season_batting sb
                      WHERE sb.lg_id = ${league.playerPool.toUpperCase()}
                    )`
                  : sql``;

              const availablePlayers = await tx.execute(sql`
                SELECT p.id
                FROM players p
                WHERE p.id NOT IN (
                  SELECT dp.player_id FROM draft_picks dp WHERE dp.draft_id = ${draftId}
                )
                ${playerPoolCondition}
                ORDER BY p.id ASC
                LIMIT 1
              `);

              if (availablePlayers.rows.length === 0) {
                throw new Error(`No available players for draft ${draftId}`);
              }

              const autoPlayerId = availablePlayers.rows[0].id as number;

              // Validate roster limit
              const [rosterCount] = await tx
                .select({ count: count() })
                .from(PublicSchema.teamMembers)
                .where(
                  and(
                    eq(PublicSchema.teamMembers.teamId, currentPickInfo.teamId),
                    eq(PublicSchema.teamMembers.leagueId, draftLeagueId),
                  ),
                );

              if (
                rosterCount &&
                Number(rosterCount.count) >= league.maxRosterSize
              ) {
                throw new Error(
                  `Team ${currentPickInfo.teamId} roster is full in draft ${draftId}`,
                );
              }

              const pickNow = new Date();

              // Create the auto pick
              const [draftPick] = await tx
                .insert(PublicSchema.draftPicks)
                .values({
                  draftId,
                  teamId: currentPickInfo.teamId,
                  playerId: autoPlayerId,
                  round: currentPickInfo.round,
                  pickNumber: currentPickInfo.pickNumber,
                  overallPick: currentPickInfo.overallPick,
                  pickedAt: pickNow,
                })
                .returning();

              // Calculate if draft is complete
              const numTeams = (
                await tx
                  .select()
                  .from(PublicSchema.draftTeams)
                  .where(eq(PublicSchema.draftTeams.draftId, draftId))
              ).length;
              const totalPicks = numTeams * league.maxRosterSize;
              const isDraftComplete = currentPickInfo.overallPick >= totalPicks;

              // Set next deadline or clear if complete
              const nextDeadline = isDraftComplete
                ? null
                : new Date(pickNow.getTime() + pickTimeLimitSeconds * 1000);

              await tx
                .update(PublicSchema.drafts)
                .set({
                  currentPick: currentPickInfo.overallPick,
                  currentPickDeadline: nextDeadline,
                  updatedAt: pickNow,
                  ...(isDraftComplete ? { draftCompletedAt: pickNow } : {}),
                })
                .where(eq(PublicSchema.drafts.id, draftId));

              if (isDraftComplete) {
                await tx
                  .update(PublicSchema.leagues)
                  .set({ draftStatus: 'completed' })
                  .where(eq(PublicSchema.leagues.id, draftLeagueId));
              }

              // Add player to team roster
              await tx.insert(PublicSchema.teamMembers).values({
                teamId: currentPickInfo.teamId,
                leagueId: draftLeagueId,
                playerId: autoPlayerId,
                draftRound: currentPickInfo.round,
                draftPick: currentPickInfo.pickNumber,
                acquisitionType: 'draft',
              });

              // Calculate next pick info for notification
              let nextPickInfo: Awaited<
                ReturnType<typeof getCurrentDraftPickInfo>
              > = null;
              if (!isDraftComplete) {
                nextPickInfo = await getCurrentDraftPickInfo(tx, draftId);
              }

              return {
                draftPick,
                autoPlayerId,
                isDraftComplete,
                currentPickInfo,
                nextPickInfo,
                nextDeadline,
              };
            });

            if (!pickResult) {
              continue; // Deadline was cleared by another process
            }

            result.picksAutoMade++;

            LOGGER.info('[autoProcessDraftPicks] Auto-pick made', {
              draftId,
              leagueId: draftLeagueId,
              playerId: pickResult.autoPlayerId,
              teamId: pickResult.currentPickInfo.teamId,
              overallPick: pickResult.currentPickInfo.overallPick,
              isDraftComplete: pickResult.isDraftComplete,
            });

            // Send WebSocket notifications (outside transaction)
            if (notificationService) {
              await notificationService.notifyDraftPickMade(
                draftLeagueId,
                draftId,
                pickResult.draftPick.id,
                pickResult.currentPickInfo.teamId,
                pickResult.autoPlayerId,
                pickResult.currentPickInfo.round,
                pickResult.currentPickInfo.pickNumber,
                pickResult.currentPickInfo.overallPick,
                pickResult.nextPickInfo
                  ? {
                      teamId: pickResult.nextPickInfo.teamId,
                      round: pickResult.nextPickInfo.round,
                      pickNumber: pickResult.nextPickInfo.pickNumber,
                      overallPick: pickResult.nextPickInfo.overallPick,
                    }
                  : undefined,
                {
                  wasAutoPick: true,
                  currentPickDeadline:
                    pickResult.nextDeadline?.toISOString() ?? null,
                },
              );

              if (pickResult.isDraftComplete) {
                result.draftsCompleted++;
                await notificationService.notifyDraftCompleted(
                  draftLeagueId,
                  (row.selection_method as string) ?? 'standard',
                );
              }
            }

            // Auto-create matchups when draft completes
            if (pickResult.isDraftComplete) {
              try {
                const matchupResult = await createAllMatchupsForLeague(
                  context.db,
                  draftLeagueId,
                );
                LOGGER.info(
                  '[autoProcessDraftPicks] Auto-created matchups after draft completion',
                  {
                    leagueId: draftLeagueId,
                    matchupCount: matchupResult.matchupCount,
                  },
                );
              } catch (matchupError) {
                LOGGER.error(
                  '[autoProcessDraftPicks] Failed to auto-create matchups',
                  {
                    leagueId: draftLeagueId,
                    error:
                      matchupError instanceof Error
                        ? matchupError.message
                        : String(matchupError),
                  },
                );
              }
            }
          } catch (draftError) {
            const errMsg =
              draftError instanceof Error
                ? draftError.message
                : String(draftError);
            LOGGER.error(
              `[autoProcessDraftPicks] Error processing draft ${draftId}`,
              { draftId, leagueId: draftLeagueId, error: errMsg },
            );
            result.errors.push(`Draft ${draftId}: ${errMsg}`);
          }
        }

        LOGGER.info('[autoProcessDraftPicks] Completed', {
          draftsProcessed: result.draftsProcessed,
          picksAutoMade: result.picksAutoMade,
          draftsCompleted: result.draftsCompleted,
          errorCount: result.errors.length,
        });

        return result;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        LOGGER.error('[autoProcessDraftPicks] Fatal error', {
          error: errMsg,
        });
        result.errors.push(errMsg);
        return result;
      }
    },
  }),
);
