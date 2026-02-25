import { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { and, count, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils';
import {
  addBreadcrumb,
  captureError,
  getSentryConfigFromEnv,
  initSentry,
  withSentry,
} from '@legacy-sports/sentry';
import { createNotificationService } from '@legacy-sports/aws-utils';
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

// Initialize WebSocket notification service
const notificationService = createNotificationService();

/**
 * Message format for matchup stats loading
 * Contains a batch of players for a matchup to process sequentially
 * Supports batching to avoid Lambda timeouts
 *
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
    fieldingGamePos: string;
  }>;
}

/**
 * Select random unique game identifiers and update matchup_player_games
 * Called after all game stats are loaded for a player.
 * Only updates records that don't already have a game_identifier assigned
 * (i.e., records from the uncached path where game selection couldn't pick a game).
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

  // Get all unique game identifiers for this player/season from batting stats
  // (batting is the most reliable - every player bats)
  const allUniqueGames = await db
    .selectDistinct({ gameIdentifier: PublicSchema.gameBatting.gameIdentifier })
    .from(PublicSchema.gameBatting)
    .where(
      and(
        eq(PublicSchema.gameBatting.playerId, playerId),
        eq(PublicSchema.gameBatting.season, season),
      ),
    );

  // Filter out empty string game_identifiers (stale data from pre-refactor scrapes)
  const uniqueGames = allUniqueGames.filter(
    (g) => g.gameIdentifier !== '' && g.gameIdentifier !== null,
  );

  if (uniqueGames.length === 0) {
    LOGGER.warn(
      `No valid game identifiers found for player ${playerId} season ${season} (${allUniqueGames.length} total, all empty), cannot select games`,
    );
    return;
  }

  LOGGER.info(
    `Found ${uniqueGames.length} unique games for player ${playerId} season ${season}`,
  );

  // Get records that need game_identifier assignment (null gameIdentifier)
  const unassignedGames = await db
    .select()
    .from(PublicSchema.matchupPlayerGames)
    .where(
      and(
        eq(PublicSchema.matchupPlayerGames.matchupPlayerId, matchupPlayerId),
        isNull(PublicSchema.matchupPlayerGames.gameIdentifier),
      ),
    );

  if (unassignedGames.length === 0) {
    LOGGER.info(
      `All game slots already have game_identifiers for matchup player ${matchupPlayerId}`,
    );
    return;
  }

  // Get already-used game identifiers to avoid duplicates
  const usedGames = await db
    .select({ gameIdentifier: PublicSchema.matchupPlayerGames.gameIdentifier })
    .from(PublicSchema.matchupPlayerGames)
    .where(
      and(
        eq(PublicSchema.matchupPlayerGames.matchupPlayerId, matchupPlayerId),
        isNotNull(PublicSchema.matchupPlayerGames.gameIdentifier),
      ),
    );

  const usedIds = new Set(
    usedGames
      .map((g) => g.gameIdentifier)
      .filter((id): id is string => id !== null),
  );

  // Filter to available (not already used) games
  const availableGames = uniqueGames.filter(
    (g) => !usedIds.has(g.gameIdentifier),
  );

  // Randomly select N unique games for unassigned slots
  const shuffled = availableGames
    .map((g) => ({ gameIdentifier: g.gameIdentifier, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, unassignedGames.length);

  LOGGER.info(
    `Selected ${shuffled.length} random games from ${availableGames.length} available (${usedIds.size} already used)`,
  );

  // Update each unassigned matchup_player_games record with a game_identifier
  for (let i = 0; i < shuffled.length && i < unassignedGames.length; i++) {
    await db
      .update(PublicSchema.matchupPlayerGames)
      .set({
        gameIdentifier: shuffled[i].gameIdentifier,
      })
      .where(eq(PublicSchema.matchupPlayerGames.id, unassignedGames[i].id));
  }

  LOGGER.info(
    `Successfully assigned game identifiers for matchup player ${matchupPlayerId}`,
  );
}

/**
 * Check if an error is a retryable Baseball-Reference error (timeout, rate limit, or overload).
 * Rate limit (429) and overload (529) errors should be retried after SQS visibility timeout delay.
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const errorMessage = error.message.toLowerCase();

  // Check for HTTP 429 (Too Many Requests) or 529 (Site Overloaded)
  const isRateLimited =
    errorMessage.includes('status code 429') ||
    errorMessage.includes('status code 529');

  // Check for HTTP 504 (Gateway Timeout) or 524 (Cloudflare timeout)
  const isTimeoutStatus =
    errorMessage.includes('status code 504') ||
    errorMessage.includes('status code 524');

  // Also check for generic timeout messages
  const isTimeoutMessage =
    errorMessage.includes('timeout') || errorMessage.includes('timed out');

  return isRateLimited || isTimeoutStatus || isTimeoutMessage;
}

/**
 * Check if an error is specifically a rate limit or overload error (429/529).
 * Used to abort remaining players in a batch early (no point hitting an overloaded service).
 */
function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes('status code 429') || msg.includes('status code 529');
}

/**
 * Purge stale game stats that have empty game_identifier values.
 * These were scraped by pre-refactor code that didn't populate game_identifier.
 * Deleting them allows a fresh re-scrape that produces proper identifiers.
 */
async function purgeStaleStats(
  db: PublicDb,
  playerId: number,
  season: number,
): Promise<void> {
  const staleBatting = await db
    .select({ cnt: count() })
    .from(PublicSchema.gameBatting)
    .where(
      and(
        eq(PublicSchema.gameBatting.playerId, playerId),
        eq(PublicSchema.gameBatting.season, season),
        eq(PublicSchema.gameBatting.gameIdentifier, ''),
      ),
    );

  const staleCount = staleBatting[0]?.cnt ?? 0;
  if (staleCount === 0) return;

  LOGGER.warn(
    `Found ${staleCount} stale batting records with empty game_identifier for player ${playerId} season ${season} — purging all stale stats to force re-scrape`,
  );

  // Delete stale batting
  await db
    .delete(PublicSchema.gameBatting)
    .where(
      and(
        eq(PublicSchema.gameBatting.playerId, playerId),
        eq(PublicSchema.gameBatting.season, season),
        eq(PublicSchema.gameBatting.gameIdentifier, ''),
      ),
    );

  // Delete stale pitching
  await db
    .delete(PublicSchema.gamePitching)
    .where(
      and(
        eq(PublicSchema.gamePitching.playerId, playerId),
        eq(PublicSchema.gamePitching.season, season),
        eq(PublicSchema.gamePitching.gameIdentifier, ''),
      ),
    );

  // Delete stale fielding
  await db
    .delete(PublicSchema.gameFielding)
    .where(
      and(
        eq(PublicSchema.gameFielding.playerId, playerId),
        eq(PublicSchema.gameFielding.season, season),
        eq(PublicSchema.gameFielding.gameIdentifier, ''),
      ),
    );

  LOGGER.info(`Purged stale stats for player ${playerId} season ${season}`);
}

async function loadPlayerGameStats(
  db: PublicDb,
  player: LoadMatchupStatsMessage['players'][0],
  matchupId: number,
  leagueId: number | null,
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
    allStarSelections: number;
    goldGloves: number;
    silverSluggers: number;
    mvpAwards: number;
    cyYoungAwards: number;
    worldSeriesRings: number;
    hallOfFame: boolean;
    rookieOfTheYear: boolean;
  } = {
    id: playerId,
    firstName: '',
    lastName: '',
    brefId,
    statsLastFetchedAt: new Date(),
    allStarSelections: 0,
    goldGloves: 0,
    silverSluggers: 0,
    mvpAwards: 0,
    cyYoungAwards: 0,
    worldSeriesRings: 0,
    hallOfFame: false,
    rookieOfTheYear: false,
  };

  try {
    // Purge stale stats with empty game_identifier (from pre-refactor scrapes)
    await purgeStaleStats(db, playerId, season);

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

      // Send notification that player stats are updated (using cached leagueId)
      try {
        if (notificationService && leagueId !== null) {
          await notificationService.notifyPlayerStatsUpdated(
            playerId,
            matchupId,
            leagueId,
            { playerId, status: 'completed' },
          );
          LOGGER.debug(
            `Sent player stats updated notification for player ${playerId}`,
          );
        }
      } catch (notifyError) {
        LOGGER.warn('Failed to send player stats updated notification', {
          error:
            notifyError instanceof Error
              ? notifyError.message
              : String(notifyError),
          playerId,
        });
      }
    }
  } catch (error) {
    const retryable = isRetryableError(error);

    LOGGER.error(`Failed to load stats for player ${playerId}:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      playerId,
      brefId,
      season,
      isRetryable: retryable,
    });

    // For retryable errors (429, timeout), leave status as 'loading' so
    // the SQS retry can process the player again without false 'failed' state
    if (retryable) {
      interface RetryableError extends Error {
        originalError: unknown;
        isRetryableTimeout: boolean;
        isRateLimit: boolean;
      }
      const retryableError = new Error(
        `RETRYABLE: ${error instanceof Error ? error.message : String(error)}`,
      ) as RetryableError;
      retryableError.originalError = error;
      retryableError.isRetryableTimeout = true;
      retryableError.isRateLimit = isRateLimitError(error);
      throw retryableError;
    }

    // Non-retryable error — mark this player's game as failed
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

      LOGGER.info(`Updated player ${playerId} game status to 'failed'`);
    }

    throw error;
  }
}

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
        // Must match SQS maxReceiveCount in terraform/sqs.tf redrive_policy
        const maxRetries = 3;

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

        for (const player of message.players) {
          try {
            addBreadcrumb(`Loading stats for player ${player.playerId}`);
            await loadPlayerGameStats(db, player, message.matchupId, leagueId);
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
          await db
            .update(PublicSchema.matchups)
            .set({ statsLoadingStatus: 'retry' })
            .where(eq(PublicSchema.matchups.id, message.matchupId));

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
            // Query matchup to get gamesPerMatchup and count selected games
            const matchupResult = await db
              .select({
                gamesPerMatchup: PublicSchema.matchups.gamesPerMatchup,
              })
              .from(PublicSchema.matchups)
              .where(eq(PublicSchema.matchups.id, message.matchupId))
              .limit(1);

            const gamesPerMatchup = matchupResult[0]?.gamesPerMatchup ?? 0;

            // Count distinct game_num values for this matchup
            const selectedGamesResult = await db
              .select({
                count: sql<number>`COUNT(DISTINCT ${PublicSchema.matchupPlayerGames.gameNum})`,
              })
              .from(PublicSchema.matchupPlayerGames)
              .innerJoin(
                PublicSchema.matchupPlayers,
                eq(
                  PublicSchema.matchupPlayerGames.matchupPlayerId,
                  PublicSchema.matchupPlayers.id,
                ),
              )
              .where(
                eq(PublicSchema.matchupPlayers.matchupId, message.matchupId),
              );

            const selectedGamesCount = selectedGamesResult[0]?.count ?? 0;

            // If all games are selected and stats loaded, mark matchup as completed
            if (selectedGamesCount >= gamesPerMatchup && gamesPerMatchup > 0) {
              matchupMainStatus = 'completed';
              LOGGER.info(
                `All games complete for matchup ${message.matchupId} (${selectedGamesCount}/${gamesPerMatchup})`,
              );
            } else {
              matchupMainStatus = 'in_progress';
              LOGGER.info(
                `Matchup ${message.matchupId} still in progress (${selectedGamesCount}/${gamesPerMatchup} games)`,
              );
            }
          }

          const updateData: {
            statsLoadingStatus: 'completed' | 'failed';
            status?: 'in_progress' | 'completed';
          } = { statsLoadingStatus: finalStatus };

          if (matchupMainStatus) {
            updateData.status = matchupMainStatus;
          }

          await db
            .update(PublicSchema.matchups)
            .set(updateData)
            .where(eq(PublicSchema.matchups.id, message.matchupId));

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
        const maxRetries = 5;
        const isRetryable = isRetryableError(error);

        if (isRetryable && retryCount < maxRetries) {
          LOGGER.warn(
            `Returning message to queue for retry due to timeout error (attempt ${retryCount}/${maxRetries})`,
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
              await db
                .update(PublicSchema.matchups)
                .set({ statsLoadingStatus: 'retry' })
                .where(eq(PublicSchema.matchups.id, parsedMessage.matchupId));

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
            await db
              .update(PublicSchema.matchups)
              .set({ statsLoadingStatus: 'failed' })
              .where(eq(PublicSchema.matchups.id, parsedMessage.matchupId));

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

// Export the Sentry-wrapped handler
export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  return await withSentry(baseHandler)(event);
};
