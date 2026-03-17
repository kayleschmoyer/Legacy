/**
 * Draft mutation: updateDraftSettings
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { eq } from 'drizzle-orm';

import { UpdateDraftSettingsInput, UpdateDraftSettingsPayload } from '../types';
import { builder } from '../../builder';
import { AuthenticationError, ForbiddenError } from '../../graphql-errors';

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
        throw AuthenticationError(
          'Authentication required to update draft settings',
        );
      }

      const {
        leagueId,
        draftMode,
        selectionMethod,
        draftOrder,
        playerPool,
        pickTimeLimitSeconds,
        eraFilter,
        hofOnly,
        customEraStartYear,
        customEraEndYear,
        scheduledAt: scheduledAtInput,
      } = args.input;
      const userId = context.user.id;

      try {
        // Verify user is the league owner
        const [league] = await context.db
          .select({
            id: PublicSchema.leagues.id,
            owner: PublicSchema.leagues.owner,
            draftStatus: PublicSchema.leagues.draftStatus,
            playerPool: PublicSchema.leagues.playerPool,
            eraFilter: PublicSchema.leagues.eraFilter,
            hofOnly: PublicSchema.leagues.hofOnly,
            customEraStartYear: PublicSchema.leagues.customEraStartYear,
            customEraEndYear: PublicSchema.leagues.customEraEndYear,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1);

        if (!league) {
          throw new Error('League not found');
        }

        if (league.owner !== userId) {
          throw ForbiddenError(
            'Only the league General Manager can update draft settings',
          );
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

        const validEraFilters = [
          'all',
          'dead_ball',
          'golden_age',
          'expansion',
          'free_agency',
          'steroid_era',
          'modern',
          'custom',
        ];
        if (eraFilter && !validEraFilters.includes(eraFilter)) {
          throw new Error(
            `Invalid era filter: ${eraFilter}. Must be one of: ${validEraFilters.join(', ')}`,
          );
        }
        if (eraFilter === 'custom') {
          if (customEraStartYear == null || customEraEndYear == null) {
            throw new Error(
              'Both start year and end year are required for a custom era.',
            );
          }
          if (customEraStartYear > customEraEndYear) {
            throw new Error(
              'Custom era start year must be less than or equal to end year',
            );
          }
        }

        if (
          pickTimeLimitSeconds !== undefined &&
          pickTimeLimitSeconds !== null
        ) {
          if (pickTimeLimitSeconds < 30 || pickTimeLimitSeconds > 172800) {
            throw new Error(
              'Pick time limit must be between 30 and 172800 seconds',
            );
          }
        }

        // Validate scheduledAt (LS-423): if provided and not null, must be a valid
        // future ISO-8601 date. Pass null explicitly to clear the schedule.
        let parsedScheduledAt: Date | null | undefined = undefined; // undefined = don't touch
        if (scheduledAtInput !== undefined) {
          if (scheduledAtInput === null) {
            parsedScheduledAt = null; // explicit clear
          } else {
            const parsed = new Date(scheduledAtInput);
            if (isNaN(parsed.getTime())) {
              throw new Error(
                `Invalid scheduledAt value: "${scheduledAtInput}". Must be a valid ISO-8601 datetime.`,
              );
            }
            if (parsed.getTime() <= Date.now()) {
              throw new Error('scheduledAt must be a future date and time.');
            }
            parsedScheduledAt = parsed;
          }
        }

        // Update player-eligibility fields on the league if any provided
        let updatedPlayerPool = league.playerPool;
        const leagueEligibilityUpdates: Record<string, unknown> = {};
        if (playerPool) {
          leagueEligibilityUpdates['playerPool'] = playerPool as
            | 'all'
            | 'nl'
            | 'al';
        }
        if (eraFilter != null) {
          leagueEligibilityUpdates['eraFilter'] = eraFilter;
        }
        if (hofOnly != null) {
          leagueEligibilityUpdates['hofOnly'] = hofOnly;
        }
        if (customEraStartYear !== undefined) {
          leagueEligibilityUpdates['customEraStartYear'] = customEraStartYear;
        }
        if (customEraEndYear !== undefined) {
          leagueEligibilityUpdates['customEraEndYear'] = customEraEndYear;
        }
        if (Object.keys(leagueEligibilityUpdates).length > 0) {
          leagueEligibilityUpdates['updatedAt'] = new Date();
          const [updatedLeague] = await context.db
            .update(PublicSchema.leagues)
            .set(leagueEligibilityUpdates)
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
        if (
          pickTimeLimitSeconds !== undefined &&
          pickTimeLimitSeconds !== null
        ) {
          draftUpdates['pickTimeLimitSeconds'] = pickTimeLimitSeconds;
        }

        // Handle scheduledAt: set when provided, clear when null, skip when undefined
        if (parsedScheduledAt !== undefined) {
          draftUpdates['scheduledAt'] = parsedScheduledAt;
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
        if (eraFilter) changedFields.push(`era filter → ${eraFilter}`);
        if (hofOnly != null)
          changedFields.push(`HOF only → ${hofOnly ? 'on' : 'off'}`);
        if (pickTimeLimitSeconds)
          changedFields.push(`pick timer → ${pickTimeLimitSeconds}s`);
        if (parsedScheduledAt !== undefined) {
          changedFields.push(
            parsedScheduledAt === null
              ? 'scheduled start → removed'
              : `scheduled start → ${parsedScheduledAt.toLocaleString('en-US', { timeZoneName: 'short' })}`,
          );
        }
        const changesSummary =
          changedFields.length > 0 ? ` (${changedFields.join(', ')})` : '';
        const notificationText = `${username} updated draft settings${changesSummary}.`;

        const [chatMsg] = await context.db
          .insert(PublicSchema.leagueMessages)
          .values({
            leagueId,
            userId: null,
            messageText: notificationText,
            messageType: 'draft_settings',
            metadata: { username, changes: changedFields },
          })
          .returning();

        const { notificationService } = context;
        if (notificationService) {
          notificationService
            .notifyLeagueChatMessage(leagueId, {
              leagueId,
              messageId: chatMsg.id,
              senderId: null,
              senderUsername: username,
              messageText: notificationText,
              timestamp: chatMsg.timestamp ?? new Date().toISOString(),
              messageType: 'draft_settings',
              metadata: { username, changes: changedFields },
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
        LOGGER.error(
          'Error updating draft settings',
          error instanceof Error ? error : new Error(String(error)),
          { leagueId, userId },
        );
        throw error;
      }
    },
  }),
);
