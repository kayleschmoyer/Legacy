import { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { and, eq } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils';
import {
  addBreadcrumb,
  captureError,
  getSentryConfigFromEnv,
  initSentry,
  withSentry,
} from '@legacy-sports/sentry';
import {
  PublicDb,
  PublicSchema,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import {
  cleanupCache,
  getAllGameBattingStats,
  getAllGameFieldingStats,
  getAllGamePitchingStats,
  getCacheStats,
} from '@legacy-sports/bref-client';

// Initialize Sentry
const sentryConfig = getSentryConfigFromEnv();
if (sentryConfig) {
  initSentry(sentryConfig);
}

/**
 * Message format for matchup stats loading
 * Contains a batch of players for a matchup to process sequentially
 * Supports batching to avoid Lambda timeouts
 */
interface LoadMatchupStatsMessage {
  matchupId: number;
  batchIndex?: number; // Optional: which batch this is (0-indexed)
  totalBatches?: number; // Optional: total number of batches for this matchup
  players: Array<{
    matchupPlayerId: number;
    playerId: number;
    brefId: string;
    season: number;
    battingGameNum: number;
    pitchingGameNum: number;
    fieldingGameNum: number;
    fieldingGamePos: string;
  }>;
}

/**
 * Select random unique game identifiers and update matchup_player_games
 * Called after all game stats are loaded for a player
 */
async function selectAndAssignGameIdentifiers(
  db: PublicDb,
  matchupPlayerId: number,
  playerId: number,
  season: number,
): Promise<void> {
  LOGGER.info(
    `Selecting game identifiers for matchup player ${matchupPlayerId}`,
  );

  // Get all unique game identifiers for this player/season across all stat types
  const uniqueGames = await db
    .selectDistinct({ gameIdentifier: PublicSchema.gameBatting.gameIdentifier })
    .from(PublicSchema.gameBatting)
    .where(
      and(
        eq(PublicSchema.gameBatting.playerId, playerId),
        eq(PublicSchema.gameBatting.season, season),
      ),
    )
    .union(
      db
        .selectDistinct({
          gameIdentifier: PublicSchema.gamePitching.gameIdentifier,
        })
        .from(PublicSchema.gamePitching)
        .where(
          and(
            eq(PublicSchema.gamePitching.playerId, playerId),
            eq(PublicSchema.gamePitching.season, season),
          ),
        ),
    )
    .union(
      db
        .selectDistinct({
          gameIdentifier: PublicSchema.gameFielding.gameIdentifier,
        })
        .from(PublicSchema.gameFielding)
        .where(
          and(
            eq(PublicSchema.gameFielding.playerId, playerId),
            eq(PublicSchema.gameFielding.season, season),
          ),
        ),
    );

  if (uniqueGames.length === 0) {
    LOGGER.warn(
      `No games found for player ${playerId} season ${season}, cannot select games`,
    );
    return;
  }

  LOGGER.info(
    `Found ${uniqueGames.length} unique games for player ${playerId} season ${season}`,
  );

  // Get number of games needed from matchup_player_games records
  const existingGames = await db
    .select()
    .from(PublicSchema.matchupPlayerGames)
    .where(
      eq(PublicSchema.matchupPlayerGames.matchupPlayerId, matchupPlayerId),
    );

  const gamesNeeded = existingGames.length;

  if (gamesNeeded === 0) {
    LOGGER.info(
      `No game slots found for matchup player ${matchupPlayerId}, skipping game selection`,
    );
    return;
  }

  // Randomly select N unique games
  const shuffled = uniqueGames
    .map((g) => ({ gameIdentifier: g.gameIdentifier, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, gamesNeeded);

  LOGGER.info(
    `Selected ${shuffled.length} random games from ${uniqueGames.length} available`,
  );

  // Update each matchup_player_games record with a game_identifier
  for (let i = 0; i < shuffled.length && i < existingGames.length; i++) {
    await db
      .update(PublicSchema.matchupPlayerGames)
      .set({
        gameIdentifier: shuffled[i].gameIdentifier,
      })
      .where(eq(PublicSchema.matchupPlayerGames.id, existingGames[i].id));
  }

  LOGGER.info(
    `Successfully assigned game identifiers for matchup player ${matchupPlayerId}`,
  );
}

async function loadPlayerGameStats(
  db: PublicDb,
  player: LoadMatchupStatsMessage['players'][0],
): Promise<void> {
  const { playerId, brefId, season, fieldingGamePos } = player;

  LOGGER.info(
    `Loading stats for player ${playerId} (${brefId}), season ${season}`,
  );

  const playerObj: {
    id: number;
    firstName: string;
    lastName: string;
    brefId: string;
    statsLastFetchedAt: Date;
  } = {
    id: playerId,
    firstName: '',
    lastName: '',
    brefId,
    statsLastFetchedAt: new Date(),
  };

  try {
    // Load batting stats - check if ANY game exists for this player/season, if not load ALL games
    LOGGER.debug(
      `Checking if batting stats exist for player ${playerId}, season ${season}`,
    );
    const existingBatting = await db
      .select()
      .from(PublicSchema.gameBatting)
      .where(
        and(
          eq(PublicSchema.gameBatting.playerId, playerId),
          eq(PublicSchema.gameBatting.season, season),
        ),
      )
      .limit(1);

    if (existingBatting.length === 0) {
      LOGGER.info(
        `No batting stats cached for player ${playerId} season ${season}, loading ALL games from Baseball Reference`,
      );
      const allBattingStats = await getAllGameBattingStats(playerObj, season);
      if (allBattingStats && allBattingStats.length > 0) {
        await db
          .insert(PublicSchema.gameBatting)
          .values(allBattingStats)
          .onConflictDoNothing();
        LOGGER.info(
          `Loaded ${allBattingStats.length} batting game records for player ${playerId}`,
        );
      }
    } else {
      LOGGER.debug(
        `Batting stats already cached for player ${playerId}, season ${season} (${existingBatting.length} games found)`,
      );
    }

    // Load pitching stats - same pattern
    LOGGER.debug(
      `Checking if pitching stats exist for player ${playerId}, season ${season}`,
    );
    const existingPitching = await db
      .select()
      .from(PublicSchema.gamePitching)
      .where(
        and(
          eq(PublicSchema.gamePitching.playerId, playerId),
          eq(PublicSchema.gamePitching.season, season),
        ),
      )
      .limit(1);

    if (existingPitching.length === 0) {
      LOGGER.info(
        `No pitching stats cached for player ${playerId} season ${season}, loading ALL games from Baseball Reference`,
      );
      const allPitchingStats = await getAllGamePitchingStats(playerObj, season);
      if (allPitchingStats && allPitchingStats.length > 0) {
        await db
          .insert(PublicSchema.gamePitching)
          .values(allPitchingStats)
          .onConflictDoNothing();
        LOGGER.info(
          `Loaded ${allPitchingStats.length} pitching game records for player ${playerId}`,
        );
      }
    } else {
      LOGGER.debug(
        `Pitching stats already cached for player ${playerId}, season ${season}`,
      );
    }

    // Load fielding stats - same pattern
    LOGGER.debug(
      `Checking if fielding stats exist for player ${playerId}, season ${season}`,
    );
    const existingFielding = await db
      .select()
      .from(PublicSchema.gameFielding)
      .where(
        and(
          eq(PublicSchema.gameFielding.playerId, playerId),
          eq(PublicSchema.gameFielding.season, season),
        ),
      )
      .limit(1);

    if (existingFielding.length === 0) {
      LOGGER.info(
        `No fielding stats cached for player ${playerId} season ${season}, loading ALL games from Baseball Reference`,
      );
      const allFieldingStats = await getAllGameFieldingStats(
        playerObj,
        season,
        fieldingGamePos,
      );
      if (allFieldingStats && allFieldingStats.length > 0) {
        await db
          .insert(PublicSchema.gameFielding)
          .values(allFieldingStats)
          .onConflictDoNothing();
        LOGGER.info(
          `Loaded ${allFieldingStats.length} fielding game records for player ${playerId}`,
        );
      }
    } else {
      LOGGER.debug(
        `Fielding stats already cached for player ${playerId}, season ${season}`,
      );
    }

    LOGGER.info(`Successfully loaded all stats for player ${playerId}`);

    // After loading all games, select N random unique game identifiers
    // and update matchup_player_games
    if (player.matchupPlayerId) {
      await selectAndAssignGameIdentifiers(
        db,
        player.matchupPlayerId,
        playerId,
        season,
      );

      // Mark this player's game as completed
      await db
        .update(PublicSchema.matchupPlayerGames)
        .set({ statsLoadingStatus: 'completed' })
        .where(
          eq(
            PublicSchema.matchupPlayerGames.matchupPlayerId,
            player.matchupPlayerId,
          ),
        );

      LOGGER.info(`Updated player ${playerId} status to 'completed'`);
    }
  } catch (error) {
    LOGGER.error(`Failed to load stats for player ${playerId}:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      playerId,
      brefId,
      season,
    });

    // Mark this player's game as failed
    if (player.matchupPlayerId) {
      await db
        .update(PublicSchema.matchupPlayerGames)
        .set({ statsLoadingStatus: 'failed' })
        .where(
          eq(
            PublicSchema.matchupPlayerGames.matchupPlayerId,
            player.matchupPlayerId,
          ),
        );

      LOGGER.info(`Updated player ${playerId} status to 'failed'`);
    }

    throw error;
  }
}

const baseHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  LOGGER.debug(JSON.stringify(event));
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
        let failedPlayerCount = 0;
        for (const player of message.players) {
          try {
            addBreadcrumb(`Loading stats for player ${player.playerId}`);
            await loadPlayerGameStats(db, player);
          } catch (error) {
            failedPlayerCount++;
            LOGGER.error(
              `Failed to load stats for player ${player.playerId} in matchup ${message.matchupId}`,
              {
                error: error instanceof Error ? error.message : String(error),
                playerId: player.playerId,
                brefId: player.brefId,
              },
            );
            // Continue processing other players even if one fails
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

        // Update matchup status only on the last batch or if there's only one batch
        const isLastBatch =
          message.totalBatches === undefined ||
          message.batchIndex === undefined ||
          message.batchIndex === message.totalBatches - 1;

        if (isLastBatch) {
          const finalStatus =
            failedPlayerCount === message.players.length
              ? 'failed'
              : 'completed';
          await db
            .update(PublicSchema.matchups)
            .set({ statsLoadingStatus: finalStatus })
            .where(eq(PublicSchema.matchups.id, message.matchupId));

          LOGGER.info(
            `Successfully processed matchup ${message.matchupId} (final batch)`,
            {
              batchIndex: message.batchIndex,
              totalBatches: message.totalBatches,
              batchPlayers: message.players.length,
              failedPlayers: failedPlayerCount,
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

        // Update matchup status to 'failed' if we have a matchupId
        if (parsedMessage?.matchupId) {
          try {
            await db
              .update(PublicSchema.matchups)
              .set({ statsLoadingStatus: 'failed' })
              .where(eq(PublicSchema.matchups.id, parsedMessage.matchupId));
            LOGGER.info(
              `Set matchup ${parsedMessage.matchupId} stats_loading_status to 'failed'`,
            );
          } catch (updateError) {
            LOGGER.error('Failed to update matchup status to failed', {
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

// Export the Sentry-wrapped handler
export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  return await withSentry(baseHandler)(event);
};
