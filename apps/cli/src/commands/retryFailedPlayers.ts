import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils';
import { PublicSchema, runWithPublicClient } from '@legacy-sports/db-client';
import { and, eq, inArray } from 'drizzle-orm';
import {
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';

const SQS_QUEUE_URL = process.env.SQS_LOAD_GAME_STATS_URL;
const BATCH_SIZE = 8;

interface RetryFailedPlayersArgs {
  leagueId?: number;
  matchupId?: number;
  dryRun?: boolean;
  processDlq?: boolean;
}

function getDlqUrl(queueUrl: string): string {
  // Replace the queue name with the DLQ name
  // e.g. ...-load-game-stats.fifo -> ...-load-game-stats-dlq.fifo
  return queueUrl.replace(/\.fifo$/, '-dlq.fifo');
}

async function getDlqMessageCount(
  sqsClient: SQSClient,
  dlqUrl: string,
): Promise<number> {
  try {
    const response = await sqsClient.send(
      new GetQueueAttributesCommand({
        QueueUrl: dlqUrl,
        AttributeNames: ['ApproximateNumberOfMessages'],
      }),
    );
    return parseInt(
      response.Attributes?.ApproximateNumberOfMessages ?? '0',
      10,
    );
  } catch {
    return -1;
  }
}

async function processDlq(
  sqsClient: SQSClient,
  dlqUrl: string,
  mainQueueUrl: string,
  dryRun: boolean,
): Promise<void> {
  LOGGER.info('\n=== Processing DLQ ===\n');

  let totalProcessed = 0;
  let hasMore = true;

  while (hasMore) {
    const receiveResponse = await sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: dlqUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 1,
        VisibilityTimeout: 30,
      }),
    );

    const messages = receiveResponse.Messages ?? [];
    if (messages.length === 0) {
      hasMore = false;
      break;
    }

    for (const message of messages) {
      if (!message.Body || !message.ReceiptHandle) continue;

      try {
        const body = JSON.parse(message.Body) as {
          matchupId?: number;
          players?: unknown[];
        };
        LOGGER.info(
          `  DLQ message: matchup ${body.matchupId ?? '?'}, ${body.players?.length ?? '?'} players (id: ${message.MessageId ?? 'unknown'})`,
        );
      } catch {
        LOGGER.info(
          `  DLQ message (unparseable): ${message.Body.slice(0, 100)}...`,
        );
      }

      if (!dryRun) {
        // Re-send to main queue
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: mainQueueUrl,
            MessageBody: message.Body,
            MessageGroupId: `dlq-redrive-${Date.now()}`,
            MessageDeduplicationId: `dlq-${message.MessageId ?? Date.now()}-${Date.now()}`,
          }),
        );

        // Delete from DLQ
        await sqsClient.send(
          new DeleteMessageCommand({
            QueueUrl: dlqUrl,
            ReceiptHandle: message.ReceiptHandle,
          }),
        );
      }

      totalProcessed++;
    }
  }

  if (totalProcessed === 0) {
    LOGGER.info('  No messages in DLQ.');
  } else if (dryRun) {
    LOGGER.info(
      `\n🔍 Dry run — found ${totalProcessed} DLQ message(s), none redriven.`,
    );
  } else {
    LOGGER.info(
      `\n✅ Redrove ${totalProcessed} message(s) from DLQ to main queue.`,
    );
  }
}

export const handleRetryFailedPlayers = async (
  args: RetryFailedPlayersArgs,
) => {
  if (!SQS_QUEUE_URL && !args.dryRun) {
    LOGGER.error(
      '❌ SQS_LOAD_GAME_STATS_URL env var is not set. Cannot queue messages.',
    );
    process.exit(1);
  }

  const sqsClient = new SQSClient({ region: 'us-east-1' });

  // Always check and report DLQ status
  if (SQS_QUEUE_URL) {
    const dlqUrl = getDlqUrl(SQS_QUEUE_URL);
    const dlqCount = await getDlqMessageCount(sqsClient, dlqUrl);
    if (dlqCount > 0) {
      LOGGER.info(`\n⚠️  DLQ has ${dlqCount} message(s): ${dlqUrl}`);
      LOGGER.info(
        '   Use --process-dlq to redrive them back to the main queue.\n',
      );
    } else if (dlqCount === 0) {
      LOGGER.info('\n✅ DLQ is empty.\n');
    }

    // Process DLQ if requested
    if (args.processDlq) {
      await processDlq(sqsClient, dlqUrl, SQS_QUEUE_URL, !!args.dryRun);
    }
  }

  await runWithPublicClient(getDbOptions(), async (db) => {
    LOGGER.info('\n=== Retry Failed Players ===\n');

    // Build where conditions
    const conditions = [
      eq(PublicSchema.matchupPlayerGames.statsLoadingStatus, 'failed'),
    ];
    if (args.matchupId !== undefined) {
      conditions.push(
        eq(PublicSchema.matchupPlayers.matchupId, args.matchupId),
      );
    }
    if (args.leagueId !== undefined) {
      conditions.push(eq(PublicSchema.matchups.leagueId, args.leagueId));
    }

    // Find all failed player games with the info needed to queue them
    const failedGames = await db
      .select({
        gameId: PublicSchema.matchupPlayerGames.id,
        matchupPlayerId: PublicSchema.matchupPlayerGames.matchupPlayerId,
        matchupId: PublicSchema.matchupPlayers.matchupId,
        playerId: PublicSchema.matchupPlayers.playerId,
        leagueId: PublicSchema.matchups.leagueId,
        brefId: PublicSchema.players.brefId,
        season: PublicSchema.leagueWeekPlayerSeasons.season,
        fieldingGamePos: PublicSchema.matchupPlayerGames.fieldingGamePos,
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
        PublicSchema.matchups,
        eq(PublicSchema.matchups.id, PublicSchema.matchupPlayers.matchupId),
      )
      .innerJoin(
        PublicSchema.players,
        eq(PublicSchema.players.id, PublicSchema.matchupPlayers.playerId),
      )
      .innerJoin(
        PublicSchema.leagueWeekPlayerSeasons,
        and(
          eq(
            PublicSchema.leagueWeekPlayerSeasons.playerId,
            PublicSchema.matchupPlayers.playerId,
          ),
          eq(
            PublicSchema.leagueWeekPlayerSeasons.leagueId,
            PublicSchema.matchups.leagueId,
          ),
          eq(
            PublicSchema.leagueWeekPlayerSeasons.weekNumber,
            PublicSchema.matchups.weekNumber,
          ),
        ),
      )
      .where(and(...conditions));

    if (failedGames.length === 0) {
      LOGGER.info('✅ No failed player games found. Nothing to retry.');
      return;
    }

    // Group by matchup for SQS message grouping
    const byMatchup = new Map<
      number,
      {
        leagueId: number;
        players: Array<{
          matchupPlayerId: number;
          playerId: number;
          brefId: string;
          season: number;
          fieldingGamePos: string;
        }>;
        gameIds: number[];
      }
    >();

    for (const game of failedGames) {
      let entry = byMatchup.get(game.matchupId);
      if (!entry) {
        entry = {
          leagueId: game.leagueId,
          players: [],
          gameIds: [],
        };
        byMatchup.set(game.matchupId, entry);
      }
      entry.players.push({
        matchupPlayerId: game.matchupPlayerId,
        playerId: game.playerId,
        brefId: game.brefId || '',
        season: game.season,
        fieldingGamePos: game.fieldingGamePos || 'XX',
      });
      entry.gameIds.push(game.gameId);
    }

    LOGGER.info(
      `Found ${failedGames.length} failed player game(s) across ${byMatchup.size} matchup(s):\n`,
    );
    for (const [matchupId, data] of byMatchup) {
      LOGGER.info(`  Matchup ${matchupId} (league ${data.leagueId}):`);
      for (const p of data.players) {
        LOGGER.info(
          `    - Player ${p.playerId} (${p.brefId}) season ${p.season}`,
        );
      }
    }

    if (args.dryRun) {
      LOGGER.info('\n🔍 Dry run — no messages sent, no statuses updated.');
      return;
    }

    // Reset statuses to 'loading' and send SQS messages
    for (const [matchupId, data] of byMatchup) {
      // Reset player game statuses to 'loading'
      await db
        .update(PublicSchema.matchupPlayerGames)
        .set({ statsLoadingStatus: 'loading' })
        .where(inArray(PublicSchema.matchupPlayerGames.id, data.gameIds));

      // Reset matchup-level status to 'loading'
      await db
        .update(PublicSchema.matchups)
        .set({ statsLoadingStatus: 'loading' })
        .where(eq(PublicSchema.matchups.id, matchupId));

      // Split into batches and send SQS messages
      const batches: (typeof data.players)[] = [];
      for (let i = 0; i < data.players.length; i += BATCH_SIZE) {
        batches.push(data.players.slice(i, i + BATCH_SIZE));
      }

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const message = {
          matchupId,
          players: batch,
          batchIndex,
          totalBatches: batches.length,
        };

        const command = new SendMessageCommand({
          QueueUrl: SQS_QUEUE_URL,
          MessageBody: JSON.stringify(message),
          MessageGroupId: `matchup-${matchupId}`,
          MessageDeduplicationId: `retry-${matchupId}-${batchIndex}-${Date.now()}`,
        });

        await sqsClient.send(command);
        LOGGER.info(
          `  ✉️  Queued batch ${batchIndex + 1}/${batches.length} for matchup ${matchupId} (${batch.length} players)`,
        );
      }
    }

    LOGGER.info(
      `\n✅ Retried ${failedGames.length} failed player game(s) across ${byMatchup.size} matchup(s).`,
    );
  });
};
