import { loadCareerStats } from '@legacy-sports/data-loaders';
import { clearCache } from '@legacy-sports/bref-client';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { LOGGER } from '@legacy-sports/logging';
import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import {
  getPlayersOrderedByLastFetch,
  getPlayersWithoutStats,
  getStatsRefreshSummary,
  PublicDb,
  PublicSchema,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import type { Player } from '@legacy-sports/db-client';
import { getDbOptions } from '@legacy-sports/utils';
import { EnvironmentVariable } from '../EnvironmentVariable';

interface HandleLoadCareerStatsArgs {
  remote: boolean;
  limit?: number;
  'prioritize-new'?: boolean;
  'show-summary'?: boolean;
}

const CACHE_CLEAR_INTERVAL = 100; // Clear the bref HTML cache every N players

// Shared SQS client (created once, reused across all insertIntoSqs calls)
let sharedSqsClient: SQSClient | undefined;
function getSqsClient(): SQSClient {
  if (!sharedSqsClient) {
    sharedSqsClient = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }
  return sharedSqsClient;
}

async function insertIntoSqs(playerId: string): Promise<void> {
  const queueUrl = getEnvVarRequired(EnvironmentVariable.SQS_QUEUE_URL);

  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(playerId),
    MessageGroupId: 'stats-loading', // Required for FIFO queues
    MessageDeduplicationId: `${playerId}-${Date.now()}`, // Ensure uniqueness
  });

  await getSqsClient().send(command);
}

async function getPlayersLimited(
  db: PublicDb,
  limit: number,
): Promise<Player[]> {
  return await db.select().from(PublicSchema.players).limit(limit);
}

async function getAllPlayers(db: PublicDb): Promise<Player[]> {
  return await db.select().from(PublicSchema.players);
}

async function getPlayersPrioritized(
  db: PublicDb,
  limit?: number,
  prioritizeNew = true,
): Promise<Player[]> {
  if (!prioritizeNew) {
    // Use the original logic if not prioritizing new players
    return limit ? await getPlayersLimited(db, limit) : await getAllPlayers(db);
  }

  // First get players without any stats (highest priority)
  const playersWithoutStats = await getPlayersWithoutStats(db, limit);

  if (!limit || playersWithoutStats.length >= limit) {
    return playersWithoutStats;
  }

  // If we need more players, get the remaining from oldest-first
  const remaining = limit - playersWithoutStats.length;
  const playersOldestFirst = await getPlayersOrderedByLastFetch(db, remaining);

  // Filter out any duplicates (players that already have null statsLastFetchedAt)
  const additionalPlayers = playersOldestFirst.filter(
    (player) => player.statsLastFetchedAt !== null,
  );

  return [...playersWithoutStats, ...additionalPlayers];
}

export async function handleLoadCareerStats(
  args: HandleLoadCareerStatsArgs,
): Promise<void> {
  LOGGER.debug(
    `Loading Player Stats (limit: ${args.limit}, prioritize-new: ${args['prioritize-new']})`,
  );

  const opts = getDbOptions();

  await runWithPublicClient(opts, async (db: PublicDb) => {
    // Show summary if requested
    if (args['show-summary']) {
      const summary = await getStatsRefreshSummary(db);
      LOGGER.info('Stats Refresh Summary:', summary);
      LOGGER.info(`  Total players: ${summary.totalPlayers}`);
      LOGGER.info(`  Never fetched: ${summary.neverFetched}`);
      LOGGER.info(`  Stale stats (>24h): ${summary.staleStats}`);
      LOGGER.info(`  Recent stats (<24h): ${summary.recentStats}`);
      LOGGER.info('');
    }

    // Get players using prioritization strategy
    const players = await getPlayersPrioritized(
      db,
      args.limit,
      args['prioritize-new'],
    );

    const errors: unknown[] = [];

    if (args['prioritize-new']) {
      const playersWithoutStats = players.filter(
        (p: Player) => p.statsLastFetchedAt === null,
      );
      const playersWithStats = players.filter(
        (p: Player) => p.statsLastFetchedAt !== null,
      );

      LOGGER.info(`Processing ${players.length} players for stats loading`);
      LOGGER.info(
        `  ${playersWithoutStats.length} players without any stats (highest priority)`,
      );
      LOGGER.info(
        `  ${playersWithStats.length} players with existing stats (oldest first)`,
      );
    } else {
      LOGGER.info(
        `Processing ${players.length} players for stats loading (no prioritization)`,
      );
    }

    for (const [index, player] of players.entries()) {
      const statusInfo = player.statsLastFetchedAt
        ? `(last fetched: ${player.statsLastFetchedAt.toISOString()})`
        : '(never fetched - HIGH PRIORITY)';

      LOGGER.info(
        `[${index + 1}/${players.length}] Loading Player ${player.brefId} ${statusInfo}`,
      );

      try {
        if (args.remote) {
          await insertIntoSqs(player.brefId);
        } else {
          await loadCareerStats(db, player.brefId);
        }
      } catch (err) {
        LOGGER.error(`Error processing ${player.brefId}:`, String(err));
        errors.push(err);
      }

      // Periodically clear the in-memory HTML cache to prevent unbounded heap growth.
      // Each player page can be hundreds of KB; without clearing, thousands of cached
      // pages will exhaust the Node.js heap over a long run.
      if ((index + 1) % CACHE_CLEAR_INTERVAL === 0) {
        clearCache();
        LOGGER.debug(
          `Cache cleared after ${index + 1} players (every ${CACHE_CLEAR_INTERVAL})`,
        );
      }
    }

    LOGGER.info(`Processed ${players.length} players`);
    if (errors.length > 0) {
      LOGGER.error(
        `Errors encountered: ${errors.length} out of ${players.length} players failed`,
      );
      LOGGER.debug(`Error details: ${JSON.stringify(errors)}`);
    } else {
      LOGGER.info('All players processed successfully! 🎉');
    }
  });
}
