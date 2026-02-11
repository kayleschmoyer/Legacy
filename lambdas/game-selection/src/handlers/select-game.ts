import { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { LOGGER } from '@legacy-sports/logging';
import {
  addBreadcrumb,
  captureError,
  getSentryConfigFromEnv,
  initSentry,
  withSentry,
} from '@legacy-sports/sentry';
import type { PublicDb } from '@legacy-sports/db-client';
import { PublicSchema } from '@legacy-sports/db-client';
import { and, eq } from 'drizzle-orm';
import { withDb } from '../utils/db';
import { selectGamesForMatchup } from '../services/season-game-selector';

// Initialize Sentry
const sentryConfig = getSentryConfigFromEnv();
if (sentryConfig) {
  initSentry(sentryConfig);
}

// Initialize SQS client for queueing stats loading
const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const GAME_STATS_QUEUE_URL = process.env.SQS_LOAD_GAME_STATS_URL;

interface SelectGameEvent {
  matchupId: number;
  game: number;
}

/**
 * Queue stats loading for all players in a matchup after game selection completes
 */
async function queueStatsLoadingForMatchup(
  db: PublicDb,
  matchupId: number,
  gameNumber: number,
): Promise<void> {
  if (!GAME_STATS_QUEUE_URL) {
    LOGGER.warn(
      'SQS_LOAD_GAME_STATS_URL not configured, skipping stats loading',
    );
    return;
  }

  // Get the matchup details
  const [matchup] = await db
    .select()
    .from(PublicSchema.matchups)
    .where(eq(PublicSchema.matchups.id, matchupId));

  if (!matchup) {
    throw new Error(`Matchup ${matchupId} not found`);
  }

  // Get all players with their selected games for this game number
  const playerGames = await db
    .select({
      matchupPlayerId: PublicSchema.matchupPlayerGames.matchupPlayerId,
      playerId: PublicSchema.matchupPlayers.playerId,
      brefId: PublicSchema.players.brefId,
      battingGameNum: PublicSchema.matchupPlayerGames.battingGameNum,
      pitchingGameNum: PublicSchema.matchupPlayerGames.pitchingGameNum,
      fieldingGameNum: PublicSchema.matchupPlayerGames.fieldingGameNum,
      fieldingGamePos: PublicSchema.matchupPlayerGames.fieldingGamePos,
      season: PublicSchema.leagueWeekPlayerSeasons.season,
    })
    .from(PublicSchema.matchupPlayerGames)
    .innerJoin(
      PublicSchema.matchupPlayers,
      eq(
        PublicSchema.matchupPlayerGames.matchupPlayerId,
        PublicSchema.matchupPlayers.id,
      ),
    )
    .innerJoin(
      PublicSchema.players,
      eq(PublicSchema.matchupPlayers.playerId, PublicSchema.players.id),
    )
    .innerJoin(
      PublicSchema.leagueWeekPlayerSeasons,
      and(
        eq(PublicSchema.leagueWeekPlayerSeasons.leagueId, matchup.leagueId),
        eq(PublicSchema.leagueWeekPlayerSeasons.weekNumber, matchup.weekNumber),
        eq(
          PublicSchema.leagueWeekPlayerSeasons.playerId,
          PublicSchema.matchupPlayers.playerId,
        ),
      ),
    )
    .where(eq(PublicSchema.matchupPlayerGames.gameNum, gameNumber));

  if (playerGames.length === 0) {
    LOGGER.warn(
      `No player games found for matchup ${matchupId}, game ${gameNumber}`,
    );
    return;
  }

  // Split players into batches of 8 to avoid Lambda timeouts
  const BATCH_SIZE = 8;
  const batches: (typeof playerGames)[] = [];

  for (let i = 0; i < playerGames.length; i += BATCH_SIZE) {
    batches.push(playerGames.slice(i, i + BATCH_SIZE));
  }

  LOGGER.info(
    `Queueing ${batches.length} batches for matchup ${matchupId}, game ${gameNumber} (${playerGames.length} total players)`,
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
        const matchup = JSON.parse(record.body) as SelectGameEvent;

        addBreadcrumb('Processing select game message', {
          messageId: record.messageId,
          matchupId: matchup.matchupId,
          game: matchup.game,
        });

        LOGGER.info('Selecting games for matchup', {
          matchupId: matchup.matchupId,
          gameNumber: matchup.game,
        });

        // Use the new season-game-selector service which automatically
        // uses the matchup's selected_season field
        await selectGamesForMatchup(db, matchup.matchupId, matchup.game);

        LOGGER.info('Successfully selected games for matchup', {
          matchupId: matchup.matchupId,
          gameNumber: matchup.game,
        });

        // After game selection, queue stats loading for the selected games
        await queueStatsLoadingForMatchup(db, matchup.matchupId, matchup.game);
      } catch (err) {
        failures.push({ itemIdentifier: record.messageId });

        // Extract matchupId from the failed record to update status
        try {
          const matchup = JSON.parse(record.body) as SelectGameEvent;
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

        LOGGER.error('Error processing record', {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });

        captureError(err instanceof Error ? err : new Error(String(err)), {
          tags: {
            lambda: 'game-selection-select-game',
            operation: 'selectGamesForMatchup',
          },
          extra: {
            messageId: record.messageId,
            recordBody: record.body,
          },
        });
      }
    }
  });

  return {
    batchItemFailures: failures,
  };
};

// Export the Sentry-wrapped handler with explicit Promise wrapper
export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  return await withSentry(baseSelectGameHandler)(event);
};
