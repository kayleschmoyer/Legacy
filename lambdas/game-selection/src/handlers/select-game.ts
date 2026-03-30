import { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { LOGGER } from '@legacy-sports/logging';
import {
  addBreadcrumb,
  getRollbarConfigFromEnv,
  initRollbar,
  withRollbar,
} from '@legacy-sports/rollbar';
import { createNotificationService } from '@legacy-sports/aws-utils';
import type { PublicDb } from '@legacy-sports/db-client';
import { PublicSchema } from '@legacy-sports/db-client';
import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { withDb } from '../utils/db';
import { selectGamesForMatchup } from '../services/season-game-selector';

// Initialize Rollbar
const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

// Initialize SQS client for queueing stats loading
const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const GAME_STATS_QUEUE_URL = process.env.SQS_LOAD_GAME_STATS_URL;

// Initialize WebSocket notification service for real-time UI updates
const notificationService = createNotificationService();

const SelectGameEventSchema = z.object({
  matchupId: z.number().int().positive(),
  game: z.number().int().positive(),
});

/**
 * Queue stats loading for players that don't have cached stats.
 * Only called for players where game selection could not find cached game data.
 */
async function queueStatsLoadingForMatchup(
  db: PublicDb,
  matchupId: number,
  gameNumber: number,
  playersNeedingLoading: Array<{
    matchupPlayerId: number;
    playerId: number;
    season: number;
    fieldingGamePos: string | null;
  }>,
): Promise<void> {
  if (!GAME_STATS_QUEUE_URL) {
    LOGGER.warn(
      'SQS_LOAD_GAME_STATS_URL not configured, skipping stats loading',
    );
    return;
  }

  if (playersNeedingLoading.length === 0) {
    LOGGER.info('No players need stats loading, skipping queue');
    return;
  }

  // Look up brefId for each player that needs loading
  const playerIds = playersNeedingLoading.map((p) => p.playerId);
  const playerRecords = await db
    .select({
      id: PublicSchema.players.id,
      brefId: PublicSchema.players.brefId,
    })
    .from(PublicSchema.players)
    .where(inArray(PublicSchema.players.id, playerIds));

  const brefIdMap = new Map(playerRecords.map((p) => [p.id, p.brefId]));

  const playersWithBrefId = playersNeedingLoading.map((p) => ({
    matchupPlayerId: p.matchupPlayerId,
    playerId: p.playerId,
    brefId: brefIdMap.get(p.playerId) ?? '',
    season: p.season,
    fieldingGamePos: p.fieldingGamePos ?? '',
  }));

  // Split players into batches of 8 to avoid Lambda timeouts
  const BATCH_SIZE = 8;
  const batches: (typeof playersWithBrefId)[] = [];

  for (let i = 0; i < playersWithBrefId.length; i += BATCH_SIZE) {
    batches.push(playersWithBrefId.slice(i, i + BATCH_SIZE));
  }

  LOGGER.info(
    `Queueing ${batches.length} batches for matchup ${matchupId}, game ${gameNumber} (${playersWithBrefId.length} uncached players)`,
  );

  // Queue all batches sequentially
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const message = {
      matchupId,
      players: batch,
      batchIndex,
      totalBatches: batches.length,
    };

    const command = new SendMessageCommand({
      QueueUrl: GAME_STATS_QUEUE_URL,
      MessageBody: JSON.stringify(message),
      MessageGroupId: `matchup-${matchupId}`, // FIFO queue ensures sequential processing per matchup
      MessageDeduplicationId: `${matchupId}-game${gameNumber}-${batchIndex}`, // Unique per matchup/game/batch
    });

    await sqsClient.send(command);
    LOGGER.info(
      `Queued batch ${batchIndex + 1}/${batches.length} for matchup ${matchupId}, game ${gameNumber} with ${batch.length} players`,
    );
  }
}

/**
 * Handler for selecting games for matchups
 * Triggered by SQS messages containing matchupId and game number
 * Uses the matchup's selected_season to determine which season to select games from
 */
const baseSelectGameHandler = async (
  event: SQSEvent,
): Promise<SQSBatchResponse> => {
  addBreadcrumb(`Processing ${event.Records.length} select game messages`, {
    recordCount: event.Records.length,
  });

  LOGGER.info('Processing SQS event', {
    recordCount: event.Records.length,
  });

  const failures: SQSBatchItemFailure[] = [];

  await withDb(async (db) => {
    for (const record of event.Records) {
      try {
        const matchup = SelectGameEventSchema.parse(
          JSON.parse(record.body) as unknown,
        );

        addBreadcrumb('Processing select game message', {
          messageId: record.messageId,
          matchupId: matchup.matchupId,
          game: matchup.game,
        });

        LOGGER.info('Selecting games for matchup', {
          matchupId: matchup.matchupId,
          gameNumber: matchup.game,
        });

        // Use game_identifier-based selection - picks real games from cached stats
        const result = await selectGamesForMatchup(
          db,
          matchup.matchupId,
          matchup.game,
        );

        LOGGER.info('Successfully selected games for matchup', {
          matchupId: matchup.matchupId,
          gameNumber: matchup.game,
          playersNeedingLoading: result.playersNeedingStatsLoading.length,
        });

        // Only queue stats loading for players that don't have cached stats
        if (result.playersNeedingStatsLoading.length > 0) {
          await queueStatsLoadingForMatchup(
            db,
            matchup.matchupId,
            matchup.game,
            result.playersNeedingStatsLoading,
          );
        } else if (notificationService) {
          // All stats were cached — stats-lambda won't run, so notify here
          const matchupRow = await db
            .select({
              leagueId: PublicSchema.matchups.leagueId,
            })
            .from(PublicSchema.matchups)
            .where(eq(PublicSchema.matchups.id, matchup.matchupId))
            .limit(1);

          const leagueId = matchupRow[0]?.leagueId;
          if (leagueId) {
            const playerCount = await db
              .select({ count: sql<number>`count(*)` })
              .from(PublicSchema.matchupPlayers)
              .where(
                eq(PublicSchema.matchupPlayers.matchupId, matchup.matchupId),
              );
            const totalPlayers = Number(playerCount[0]?.count || 0);

            await notificationService.notifyMatchupStatsComplete(
              matchup.matchupId,
              leagueId,
              totalPlayers,
            );
            LOGGER.info(
              'Sent matchup-stats-complete notification (all stats cached)',
              {
                matchupId: matchup.matchupId,
                leagueId,
                totalPlayers,
              },
            );
          }
        }
      } catch (err) {
        failures.push({ itemIdentifier: record.messageId });

        // Extract matchupId from the failed record to update status
        try {
          const matchup = SelectGameEventSchema.parse(
            JSON.parse(record.body) as unknown,
          );
          await db
            .update(PublicSchema.matchups)
            .set({ statsLoadingStatus: 'failed' })
            .where(eq(PublicSchema.matchups.id, matchup.matchupId));
        } catch (updateErr) {
          LOGGER.error('Failed to update matchup status to failed', {
            error:
              updateErr instanceof Error
                ? updateErr.message
                : String(updateErr),
          });
        }

        LOGGER.error(
          'Error processing record',
          err instanceof Error ? err : new Error(String(err)),
          {
            tags: {
              lambda: 'game-selection-select-game',
              operation: 'selectGamesForMatchup',
            },
            extra: { messageId: record.messageId, recordBody: record.body },
          },
        );
      }
    }
  });

  return {
    batchItemFailures: failures,
  };
};

// Export the Rollbar-wrapped handler with explicit Promise wrapper
export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  return await withRollbar(baseSelectGameHandler)(event);
};
