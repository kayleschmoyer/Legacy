import { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { count, eq } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';
import {
  addBreadcrumb,
  captureError,
  getRollbarConfigFromEnv,
  initRollbar,
  withRollbar,
} from '@legacy-sports/rollbar';
import { createNotificationService } from '@legacy-sports/aws-utils';
import {
  getScoringMultipliersForLeague,
  PublicSchema,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { cleanupCache, getCacheStats } from '@legacy-sports/bref-client';

import type { ScoringSettings } from '@legacy-sports/scoring';
import type { LoadMatchupStatsMessage } from './load-game-types';
import { PLAYER_PROCESSING_BUDGET_MS } from './load-game-types';

/** Must match SQS maxReceiveCount in terraform/sqs.tf redrive_policy */
const MAX_RETRIES = 3;
import { isRetryableError } from './retry-strategy';
import {
  checkMatchupCompletion,
  updateMatchupStatus,
} from './game-state-manager';
import { loadPlayerGameStats } from './player-stats-loader';
import { calculateAndUpdateMatchupScores } from './scoring-utils';

// Initialize Rollbar
const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

// Initialize WebSocket notification service
const notificationService = createNotificationService();

const baseHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  // Security: Log only safe metadata (not full event payload which can be large and contain sensitive data)
  LOGGER.debug('Processing SQS event', {
    recordCount: event.Records.length,
    messageIds: event.Records.map((r) => r.messageId),
  });
  addBreadcrumb(`Processing ${event.Records.length} matchup stats SQS records`);

  return await runWithPublicClient(getDbOptions(), async (db) => {
    const batchItemFailures: { itemIdentifier: string }[] = [];

    // Process each record (should be 1 message per matchup)
    for (const record of event.Records) {
      try {
        addBreadcrumb(`Processing record ${record.messageId}`);

        // Validate message format
        if (!record.body) {
          const error = new Error(`Record ${record.messageId} has no body`);
          LOGGER.error(error.message);
          captureError(error, { messageId: record.messageId });
          batchItemFailures.push({ itemIdentifier: record.messageId });
          continue;
        }

        // Parse and validate message
        let message: LoadMatchupStatsMessage;
        try {
          message = JSON.parse(record.body) as LoadMatchupStatsMessage;
        } catch (parseError) {
          const error = new Error(
            `Failed to parse message body for record ${record.messageId}`,
          );
          LOGGER.error(error.message, {
            parseError:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
            parseErrorStack:
              parseError instanceof Error ? parseError.stack : undefined,
            messageId: record.messageId,
            bodyType: typeof record.body,
            bodyLength: record.body?.length,
            bodyPreview: record.body?.substring(0, 500),
          });
          captureError(error, {
            messageId: record.messageId,
            messageBody: record.body,
            originalError:
              parseError instanceof Error
                ? parseError
                : new Error(String(parseError)),
          });
          batchItemFailures.push({ itemIdentifier: record.messageId });
          continue;
        }

        // Validate required fields
        if (
          !message.matchupId ||
          !message.players ||
          !Array.isArray(message.players)
        ) {
          const error = new Error(
            `Invalid message format in record ${record.messageId}`,
          );
          LOGGER.error(error.message, { message });
          captureError(error, {
            messageId: record.messageId,
            message,
          });
          batchItemFailures.push({ itemIdentifier: record.messageId });
          continue;
        }

        // Fetch leagueId once per message (all players in this message belong to the same matchup)
        let leagueId: number | null = null;
        try {
          const matchupInfo = await db
            .select({ leagueId: PublicSchema.matchups.leagueId })
            .from(PublicSchema.matchups)
            .where(eq(PublicSchema.matchups.id, message.matchupId))
            .limit(1);

          if (matchupInfo[0]) {
            leagueId = matchupInfo[0].leagueId;
          }
        } catch (leagueIdError) {
          LOGGER.warn('Failed to fetch leagueId for notifications', {
            error:
              leagueIdError instanceof Error
                ? leagueIdError.message
                : String(leagueIdError),
            matchupId: message.matchupId,
          });
        }

        // Clean up expired cache entries before processing
        const removedEntries = cleanupCache();
        const cacheStatsBefore = getCacheStats();

        // Process all players sequentially - bref-client rate limiting will space out requests
        const batchInfo =
          message.batchIndex !== undefined && message.totalBatches !== undefined
            ? `batch ${message.batchIndex + 1}/${message.totalBatches}`
            : 'single batch';

        LOGGER.info(
          `Processing matchup ${message.matchupId} (${batchInfo}) with ${message.players.length} players`,
          {
            cacheSize: cacheStatsBefore.totalEntries,
            cacheSizeMB:
              Math.round(
                (cacheStatsBefore.totalSizeBytes / 1024 / 1024) * 100,
              ) / 100,
            cacheAvgAgeSeconds: cacheStatsBefore.avgAgeSeconds,
            removedExpiredEntries: removedEntries,
          },
        );

        // Get retry count from SQS message attributes
        const retryCount = record.attributes?.ApproximateReceiveCount
          ? parseInt(record.attributes.ApproximateReceiveCount, 10)
          : 1;
        const maxRetries = MAX_RETRIES;

        LOGGER.info(
          `Processing message with retry count: ${retryCount}/${maxRetries}`,
          {
            messageId: record.messageId,
            matchupId: message.matchupId,
          },
        );

        let failedPlayerCount = 0;
        let retryablePlayerCount = 0;
        let hitRateLimit = false;
        let hitTimeBudget = false;
        const invocationStart = Date.now();

        for (const player of message.players) {
          // Time-budget guard: stop before starting a new player if we are approaching
          // the Lambda timeout. The message is returned as a batchItemFailure so SQS
          // re-delivers it; players already marked 'completed' in the DB are skipped
          // on re-delivery (their cache check returns data, no BBRef request is made).
          const elapsed = Date.now() - invocationStart;
          if (elapsed > PLAYER_PROCESSING_BUDGET_MS) {
            LOGGER.warn(
              `Time budget exceeded (${Math.round(elapsed / 1000)}s/${PLAYER_PROCESSING_BUDGET_MS / 1000}s) before player ${player.playerId} — stopping early, message will be re-queued`,
              {
                matchupId: message.matchupId,
                playersProcessed: message.players.indexOf(player),
                playersRemaining:
                  message.players.length - message.players.indexOf(player),
              },
            );
            hitTimeBudget = true;
            break;
          }

          try {
            addBreadcrumb(`Loading stats for player ${player.playerId}`);
            await loadPlayerGameStats(
              db,
              player,
              message.matchupId,
              leagueId,
              notificationService,
            );
          } catch (error) {
            failedPlayerCount++;

            // Check if this is a retryable error (429 or timeout)
            const isRetryable =
              error &&
              typeof error === 'object' &&
              'isRetryableTimeout' in error &&
              error.isRetryableTimeout === true;
            if (isRetryable) {
              retryablePlayerCount++;
            }

            // Check if this is specifically a rate limit (429) error
            const isRateLimit =
              error &&
              typeof error === 'object' &&
              'isRateLimit' in error &&
              error.isRateLimit === true;

            LOGGER.error(
              `Failed to load stats for player ${player.playerId} in matchup ${message.matchupId}`,
              {
                error: error instanceof Error ? error.message : String(error),
                playerId: player.playerId,
                brefId: player.brefId,
                isRetryable,
                isRateLimit,
              },
            );

            // If rate limited, abort remaining players — no point hitting a throttled service
            if (isRateLimit) {
              hitRateLimit = true;
              LOGGER.warn(
                `Rate limited (429) — aborting remaining ${message.players.length - failedPlayerCount} players in batch. Will retry via SQS.`,
                { matchupId: message.matchupId },
              );
              break;
            }
            // Continue processing other players for non-rate-limit failures
          }
        }

        // Report cache stats after processing
        const cacheStatsAfter = getCacheStats();
        const cacheHitRate =
          cacheStatsBefore.totalEntries > 0
            ? Math.round(
                ((cacheStatsAfter.totalEntries -
                  cacheStatsBefore.totalEntries) /
                  message.players.length) *
                  100,
              )
            : 0;

        // Time-budget exceeded: return message to queue immediately.
        // Already-completed players are DB cache hits on re-delivery — no BBRef requests needed.
        if (hitTimeBudget) {
          batchItemFailures.push({ itemIdentifier: record.messageId });
          await updateMatchupStatus(db, message.matchupId, 'retry');
          LOGGER.info(
            `Set matchup ${message.matchupId} stats_loading_status to 'retry' (time budget)`,
          );
          continue;
        }

        // Determine if we should retry this message
        // If we have retryable failures (429 or timeout) and haven't exceeded retry limit, return as batch failure
        const shouldRetry = retryablePlayerCount > 0 && retryCount < maxRetries;

        if (shouldRetry) {
          LOGGER.warn(
            `Returning message to queue for retry (${retryablePlayerCount} retryable failures${hitRateLimit ? ', rate limited' : ''}, attempt ${retryCount}/${maxRetries})`,
            {
              messageId: record.messageId,
              matchupId: message.matchupId,
              retryablePlayerCount,
              totalFailedPlayers: failedPlayerCount,
              hitRateLimit,
              retryCount,
            },
          );
          batchItemFailures.push({ itemIdentifier: record.messageId });

          // Update matchup status to 'retry' so consumers know it's being retried
          await updateMatchupStatus(db, message.matchupId, 'retry');

          LOGGER.info(
            `Set matchup ${message.matchupId} stats_loading_status to 'retry' (attempt ${retryCount}/${maxRetries})`,
            {
              retryablePlayerCount,
              totalFailedPlayers: failedPlayerCount,
              hitRateLimit,
            },
          );

          continue;
        }

        // Update matchup status only on the last batch or if there's only one batch
        const isLastBatch =
          message.totalBatches === undefined ||
          message.batchIndex === undefined ||
          message.batchIndex === message.totalBatches - 1;

        if (isLastBatch) {
          // Determine final status based on results and retry state
          let finalStatus: 'completed' | 'failed';

          if (failedPlayerCount === 0) {
            finalStatus = 'completed';
          } else if (failedPlayerCount === message.players.length) {
            // Mark as failed if all players failed
            finalStatus = 'failed';
          } else {
            // Partial success - mark as completed
            finalStatus = 'completed';
          }

          // Check if all games are complete to determine main matchup status
          let matchupMainStatus: 'in_progress' | 'completed' | undefined;

          if (finalStatus === 'completed') {
            matchupMainStatus = await checkMatchupCompletion(
              db,
              message.matchupId,
            );
          }

          await updateMatchupStatus(db, message.matchupId, finalStatus, {
            status: matchupMainStatus,
          });

          LOGGER.info(
            `Set matchup ${message.matchupId} stats_loading_status to '${finalStatus}'${matchupMainStatus ? ` and status to '${matchupMainStatus}'` : ''}`,
            {
              successfulPlayers: message.players.length - failedPlayerCount,
              failedPlayers: failedPlayerCount,
              retryablePlayers: retryablePlayerCount,
              hitRateLimit,
              retryCount,
              maxRetries,
            },
          );

          // Calculate and persist matchup scores after stats loading completes
          if (finalStatus === 'completed') {
            try {
              // Fetch league-specific scoring multipliers (snake_case keys from DB)
              // and convert to camelCase for the scoring engine
              let scoringSettings: ScoringSettings | undefined;
              if (leagueId !== null) {
                const rawMultipliers = await getScoringMultipliersForLeague(
                  db,
                  leagueId,
                );
                const toCamelCase = (
                  record: Record<string, number>,
                ): Record<string, number> => {
                  const result: Record<string, number> = {};
                  for (const [key, value] of Object.entries(record)) {
                    result[
                      key.replace(/_([a-z])/g, (_, c: string) =>
                        c.toUpperCase(),
                      )
                    ] = value;
                  }
                  return result;
                };
                scoringSettings = {
                  batting: toCamelCase(rawMultipliers.batting),
                  pitching: toCamelCase(rawMultipliers.pitching),
                  fielding: toCamelCase(rawMultipliers.fielding),
                };
              }

              const scoreResult = await calculateAndUpdateMatchupScores(
                db,
                message.matchupId,
                scoringSettings,
                true, // forceRecalculation — always recalculate on stats completion
              );
              LOGGER.info(
                `Calculated scores for matchup ${message.matchupId}: team1=${scoreResult.team1Score}, team2=${scoreResult.team2Score}`,
                {
                  matchupId: message.matchupId,
                  team1Score: scoreResult.team1Score,
                  team2Score: scoreResult.team2Score,
                  updated: scoreResult.updated,
                },
              );
            } catch (scoreError) {
              LOGGER.error(
                `Failed to calculate scores for matchup ${message.matchupId}`,
                {
                  error:
                    scoreError instanceof Error
                      ? scoreError.message
                      : String(scoreError),
                  matchupId: message.matchupId,
                },
              );
              captureError(
                scoreError instanceof Error
                  ? scoreError
                  : new Error(String(scoreError)),
                {
                  matchupId: message.matchupId,
                  context: 'post-stats-score-calculation',
                },
              );
              // Score calculation failure is non-fatal — stats are loaded,
              // scores can be recalculated later via the standalone handler
            }
          }

          // Send notification that all matchup stats are complete (using cached leagueId)
          if (
            finalStatus === 'completed' &&
            notificationService &&
            leagueId !== null
          ) {
            try {
              // Get total player count using COUNT(*)
              const totalPlayersResult = await db
                .select({ count: count() })
                .from(PublicSchema.matchupPlayers)
                .where(
                  eq(PublicSchema.matchupPlayers.matchupId, message.matchupId),
                );

              const totalPlayers = totalPlayersResult[0]?.count ?? 0;

              await notificationService.notifyMatchupStatsComplete(
                message.matchupId,
                leagueId,
                totalPlayers,
              );
              LOGGER.debug(
                `Sent matchup stats complete notification for matchup ${message.matchupId}`,
              );
            } catch (notifyError) {
              LOGGER.warn(
                'Failed to send matchup stats complete notification',
                {
                  error:
                    notifyError instanceof Error
                      ? notifyError.message
                      : String(notifyError),
                  matchupId: message.matchupId,
                },
              );
            }
          }

          LOGGER.info(
            `Successfully processed matchup ${message.matchupId} (final batch)`,
            {
              batchIndex: message.batchIndex,
              totalBatches: message.totalBatches,
              batchPlayers: message.players.length,
              failedPlayers: failedPlayerCount,
              retryablePlayers: retryablePlayerCount,
              hitRateLimit,
              retryCount,
              finalStatus,
              cacheHitRate: `${cacheHitRate}%`,
              finalCacheSize: cacheStatsAfter.totalEntries,
              finalCacheSizeMB:
                Math.round(
                  (cacheStatsAfter.totalSizeBytes / 1024 / 1024) * 100,
                ) / 100,
            },
          );
        } else {
          LOGGER.info(
            `Successfully processed matchup ${message.matchupId} batch ${(message.batchIndex ?? 0) + 1}/${message.totalBatches ?? 1}`,
            {
              batchPlayers: message.players.length,
              failedPlayers: failedPlayerCount,
              retryablePlayers: retryablePlayerCount,
              hitRateLimit,
              retryCount,
              cacheHitRate: `${cacheHitRate}%`,
              currentCacheSize: cacheStatsAfter.totalEntries,
            },
          );
        }
        addBreadcrumb(
          `Successfully processed all stats for matchup ${message.matchupId}`,
        );
      } catch (error) {
        const errorMessage = `Failed to process record ${record.messageId}`;
        LOGGER.error(errorMessage, error as Error);

        // Try to extract message for error context
        let parsedMessage: LoadMatchupStatsMessage | undefined;
        try {
          parsedMessage = JSON.parse(record.body) as LoadMatchupStatsMessage;
        } catch {
          // Ignore parsing errors in error handler
        }

        // Check if this is a retryable error and we haven't exceeded retry limit
        const retryCount = record.attributes?.ApproximateReceiveCount
          ? parseInt(record.attributes.ApproximateReceiveCount, 10)
          : 1;
        const maxRetries = MAX_RETRIES;
        const isRetryable = isRetryableError(error);

        if (isRetryable && retryCount < maxRetries) {
          LOGGER.warn(
            `Returning message to queue for retry due to retryable error (attempt ${retryCount}/${maxRetries})`,
            {
              messageId: record.messageId,
              matchupId: parsedMessage?.matchupId,
              error: error instanceof Error ? error.message : String(error),
              retryCount,
            },
          );

          // Update matchup status to 'retry' before returning to queue
          if (parsedMessage?.matchupId) {
            try {
              await updateMatchupStatus(db, parsedMessage.matchupId, 'retry');

              LOGGER.info(
                `Set matchup ${parsedMessage.matchupId} stats_loading_status to 'retry' (attempt ${retryCount}/${maxRetries})`,
              );
            } catch (updateError) {
              LOGGER.error('Failed to update matchup status to retry', {
                updateError:
                  updateError instanceof Error
                    ? updateError.message
                    : String(updateError),
                matchupId: parsedMessage.matchupId,
              });
            }
          }

          // Return as batch failure - SQS will automatically retry
          batchItemFailures.push({ itemIdentifier: record.messageId });
          continue;
        }

        // Update matchup status to failed (retries exhausted or non-retryable error)
        if (parsedMessage?.matchupId) {
          try {
            await updateMatchupStatus(db, parsedMessage.matchupId, 'failed');

            LOGGER.info(
              `Set matchup ${parsedMessage.matchupId} stats_loading_status to 'failed'`,
              {
                reason: isRetryable
                  ? `Exceeded max retries (${retryCount}/${maxRetries})`
                  : 'Non-retryable error',
                error: error instanceof Error ? error.message : String(error),
              },
            );
          } catch (updateError) {
            LOGGER.error('Failed to update matchup status', {
              updateError:
                updateError instanceof Error
                  ? updateError.message
                  : String(updateError),
              matchupId: parsedMessage.matchupId,
            });
          }
        }

        // Capture error with full context for debugging
        captureError(error as Error, {
          tags: {
            lambda: 'stats-lambda',
            operation: 'load_matchup_stats',
          },
          extra: {
            messageId: record.messageId,
            messageBody: record.body,
            message: parsedMessage,
            sqsMessageAttributes: record.messageAttributes,
          },
        });

        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    LOGGER.debug(
      `Processed ${event.Records.length} records, ${batchItemFailures.length} failures`,
    );
    addBreadcrumb(
      `Completed processing with ${batchItemFailures.length} failures`,
    );

    return {
      batchItemFailures,
    };
  });
};

// Export the Rollbar-wrapped handler
export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  return await withRollbar(baseHandler)(event);
};
