import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { and, eq } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';
import { addBreadcrumb, captureError } from '@legacy-sports/rollbar';
import { getDbOptions } from '@legacy-sports/utils/node';
import {
  type PublicDb,
  PublicSchema,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { CareerStats, IDPStats, TeamDefense } from '@legacy-sports/pfr-client';
import type {
  LoadFootballMatchupStatsMessage,
  RetryableError,
} from './load-game-types';
import { PLAYER_PROCESSING_BUDGET_MS } from './load-game-types';
import { isRateLimitError, isRetryableError } from './retry-strategy';
import {
  checkMatchupCompletion,
  selectAndAssignFootballGameIdentifiers,
  updateMatchupStatus,
} from './game-state-manager';
import { calculateAndUpdateFootballMatchupScores } from './handlers/calculate-football-matchup-scores';
import { IDP_POSITIONS, validateNflTeam, validatePfrId } from './constants';
import { emitFootballFailure, emitFootballSuccess } from './football-metrics';

const MAX_RETRIES = 3;

export function isFootballGameMessage(
  value: unknown,
): value is LoadFootballMatchupStatsMessage {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  return (
    msg['type'] === 'football-game-stats' &&
    typeof msg['matchupId'] === 'number' &&
    Array.isArray(msg['players'])
  );
}

async function loadFootballPlayerGameStats(
  db: PublicDb,
  player: LoadFootballMatchupStatsMessage['players'][0],
): Promise<void> {
  const { playerId, pfrId, season, isDst, position, nflTeam, matchupPlayerId } =
    player;

  validatePfrId(pfrId);
  if (isDst && nflTeam) validateNflTeam(nflTeam);

  const pfrPlayer = { id: playerId, pfrId };

  LOGGER.info(
    `Loading football stats for player ${playerId} (${pfrId}), season ${season}, isDst=${String(isDst)}, position=${position}`,
  );

  try {
    if (isDst) {
      if (!nflTeam) {
        throw new Error(
          `nflTeam is required for DST player ${playerId} (${pfrId})`,
        );
      }

      const existing = await db
        .select()
        .from(PublicSchema.gameFootballDefense)
        .where(
          and(
            eq(PublicSchema.gameFootballDefense.playerId, playerId),
            eq(PublicSchema.gameFootballDefense.season, season),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        LOGGER.info(
          `No DST stats cached for player ${playerId} season ${season}, loading from PFR`,
        );
        const games = await TeamDefense.getGameLog(pfrPlayer, nflTeam, season);
        if (games.length > 0) {
          await db
            .insert(PublicSchema.gameFootballDefense)
            .values(
              games.map((g) => ({
                playerId: g.playerId,
                season: g.season,
                gameNum: g.gameNum,
                gameIdentifier: g.gameIdentifier,
                sacks: g.sacks,
                interceptions: g.int,
                fumblesRec: g.fumRec,
                defTd: g.defTd,
                safeties: g.safeties,
                ptsAllowed: g.ptsAllowed,
                ydsAllowed: g.ydsAllowed,
                passYdsAllowed: g.passYdsAllowed,
                rushYdsAllowed: g.rushYdsAllowed,
              })),
            )
            .onConflictDoNothing();
          LOGGER.info(
            `Loaded ${games.length} DST game records for player ${playerId}`,
          );
        }
      } else {
        LOGGER.debug(
          `DST stats already cached for player ${playerId} season ${season}`,
        );
      }
    } else if (IDP_POSITIONS.includes(position)) {
      const existing = await db
        .select()
        .from(PublicSchema.gameFootballDefenseIdp)
        .where(
          and(
            eq(PublicSchema.gameFootballDefenseIdp.playerId, playerId),
            eq(PublicSchema.gameFootballDefenseIdp.season, season),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        LOGGER.info(
          `No IDP stats cached for player ${playerId} season ${season}, loading from PFR`,
        );
        const games = await IDPStats.getGameLog(pfrPlayer, season);
        if (games.length > 0) {
          await db
            .insert(PublicSchema.gameFootballDefenseIdp)
            .values(
              games.map((g) => ({
                playerId: g.playerId,
                season: g.season,
                gameNum: g.gameNum,
                gameIdentifier: g.gameIdentifier,
                soloTkl: g.soloTkl,
                astTkl: g.astTkl,
                sacks: g.sacks !== null ? String(g.sacks) : null,
                interceptions: g.int,
                pd: g.pd,
                ff: g.ff,
                fr: g.fr,
                defTd: g.defTd,
                safeties: g.safeties,
              })),
            )
            .onConflictDoNothing();
          LOGGER.info(
            `Loaded ${games.length} IDP game records for player ${playerId}`,
          );
        }
      } else {
        LOGGER.debug(
          `IDP stats already cached for player ${playerId} season ${season}`,
        );
      }
    } else {
      // Offensive / kicking player — check if ANY offensive stat exists before scraping
      const [
        existingPassing,
        existingRushing,
        existingReceiving,
        existingKicking,
      ] = await Promise.all([
        db
          .select()
          .from(PublicSchema.gameFootballPassing)
          .where(
            and(
              eq(PublicSchema.gameFootballPassing.playerId, playerId),
              eq(PublicSchema.gameFootballPassing.season, season),
            ),
          )
          .limit(1),
        db
          .select()
          .from(PublicSchema.gameFootballRushing)
          .where(
            and(
              eq(PublicSchema.gameFootballRushing.playerId, playerId),
              eq(PublicSchema.gameFootballRushing.season, season),
            ),
          )
          .limit(1),
        db
          .select()
          .from(PublicSchema.gameFootballReceiving)
          .where(
            and(
              eq(PublicSchema.gameFootballReceiving.playerId, playerId),
              eq(PublicSchema.gameFootballReceiving.season, season),
            ),
          )
          .limit(1),
        db
          .select()
          .from(PublicSchema.gameFootballKicking)
          .where(
            and(
              eq(PublicSchema.gameFootballKicking.playerId, playerId),
              eq(PublicSchema.gameFootballKicking.season, season),
            ),
          )
          .limit(1),
      ]);

      const hasAny =
        existingPassing.length > 0 ||
        existingRushing.length > 0 ||
        existingReceiving.length > 0 ||
        existingKicking.length > 0;

      if (!hasAny) {
        LOGGER.info(
          `No offensive stats cached for player ${playerId} season ${season}, loading from PFR`,
        );
        const gameLog = await CareerStats.getGameLog(pfrPlayer, season);

        if (gameLog.passing.length > 0) {
          await db
            .insert(PublicSchema.gameFootballPassing)
            .values(
              gameLog.passing.map((g) => ({
                playerId: g.playerId,
                season: g.season,
                gameNum: g.gameNum,
                gameIdentifier: g.gameIdentifier,
                cmp: g.cmp,
                att: g.att,
                yds: g.yds,
                td: g.td,
                interceptions: g.int,
                sacked: g.sacked,
                sackYds: g.sackYds,
                rating: g.rating,
              })),
            )
            .onConflictDoNothing();
          LOGGER.info(
            `Loaded ${gameLog.passing.length} passing game records for player ${playerId}`,
          );
        }

        if (gameLog.rushing.length > 0) {
          await db
            .insert(PublicSchema.gameFootballRushing)
            .values(
              gameLog.rushing.map((g) => ({
                playerId: g.playerId,
                season: g.season,
                gameNum: g.gameNum,
                gameIdentifier: g.gameIdentifier,
                att: g.att,
                yds: g.yds,
                td: g.td,
                lng: g.lng,
                fumbles: g.fumbles,
              })),
            )
            .onConflictDoNothing();
          LOGGER.info(
            `Loaded ${gameLog.rushing.length} rushing game records for player ${playerId}`,
          );
        }

        if (gameLog.receiving.length > 0) {
          await db
            .insert(PublicSchema.gameFootballReceiving)
            .values(
              gameLog.receiving.map((g) => ({
                playerId: g.playerId,
                season: g.season,
                gameNum: g.gameNum,
                gameIdentifier: g.gameIdentifier,
                rec: g.rec,
                tgt: g.tgt,
                yds: g.yds,
                td: g.td,
                lng: g.lng,
                fumbles: g.fumbles,
              })),
            )
            .onConflictDoNothing();
          LOGGER.info(
            `Loaded ${gameLog.receiving.length} receiving game records for player ${playerId}`,
          );
        }

        if (gameLog.kicking.length > 0) {
          await db
            .insert(PublicSchema.gameFootballKicking)
            .values(
              gameLog.kicking.map((g) => ({
                playerId: g.playerId,
                season: g.season,
                gameNum: g.gameNum,
                gameIdentifier: g.gameIdentifier,
                fgm: g.fgm,
                fga: g.fga,
                fg0_19m: g.fg019m,
                fg0_19a: g.fg019a,
                fg20_29m: g.fg2029m,
                fg20_29a: g.fg2029a,
                fg30_39m: g.fg3039m,
                fg30_39a: g.fg3039a,
                fg40_49m: g.fg4049m,
                fg40_49a: g.fg4049a,
                fg50m: g.fg50m,
                fg50a: g.fg50a,
                xpm: g.xpm,
                xpa: g.xpa,
                lng: g.lng,
              })),
            )
            .onConflictDoNothing();
          LOGGER.info(
            `Loaded ${gameLog.kicking.length} kicking game records for player ${playerId}`,
          );
        }
      } else {
        LOGGER.debug(
          `Offensive stats already cached for player ${playerId} season ${season}`,
        );
      }
    }

    await selectAndAssignFootballGameIdentifiers(
      db,
      matchupPlayerId,
      playerId,
      season,
      isDst,
      position,
    );

    await db
      .update(PublicSchema.matchupPlayerGames)
      .set({ statsLoadingStatus: 'completed' })
      .where(
        eq(PublicSchema.matchupPlayerGames.matchupPlayerId, matchupPlayerId),
      );

    LOGGER.info(`Successfully loaded football stats for player ${playerId}`);
  } catch (error) {
    const retryable = isRetryableError(error);
    const err = error instanceof Error ? error : new Error(String(error));

    LOGGER.error(`Failed to load football stats for player ${playerId}`, err, {
      playerId,
      pfrId,
      season,
      isRetryable: retryable,
    });

    if (retryable) {
      const retryableError = new Error(
        `RETRYABLE: ${error instanceof Error ? error.message : String(error)}`,
      ) as RetryableError;
      retryableError.originalError = error;
      retryableError.isRetryableTimeout = true;
      retryableError.isRateLimit = isRateLimitError(error);
      throw retryableError;
    }

    await db
      .update(PublicSchema.matchupPlayerGames)
      .set({ statsLoadingStatus: 'failed' })
      .where(
        eq(PublicSchema.matchupPlayerGames.matchupPlayerId, matchupPlayerId),
      );

    throw error;
  }
}

const baseHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  LOGGER.debug('Processing football game stats SQS event', {
    recordCount: event.Records.length,
    messageIds: event.Records.map((r) => r.messageId),
  });
  addBreadcrumb(
    `Processing ${event.Records.length} football game stats SQS records`,
  );

  return await runWithPublicClient(getDbOptions(), async (db) => {
    const batchItemFailures: { itemIdentifier: string }[] = [];

    for (const record of event.Records) {
      try {
        addBreadcrumb(`Processing record ${record.messageId}`);

        if (!record.body) {
          batchItemFailures.push({ itemIdentifier: record.messageId });
          continue;
        }

        let message: LoadFootballMatchupStatsMessage;
        try {
          message = JSON.parse(record.body) as LoadFootballMatchupStatsMessage;
        } catch (parseError) {
          const err = new Error(
            `Failed to parse football game stats message for record ${record.messageId}`,
          );
          LOGGER.error(err.message, err, {
            cause:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
          });
          captureError(err, {
            messageId: record.messageId,
            messageBody: record.body,
          });
          batchItemFailures.push({ itemIdentifier: record.messageId });
          continue;
        }

        if (
          !message.matchupId ||
          !message.players ||
          !Array.isArray(message.players)
        ) {
          batchItemFailures.push({ itemIdentifier: record.messageId });
          continue;
        }

        const retryCount = record.attributes?.ApproximateReceiveCount
          ? parseInt(record.attributes.ApproximateReceiveCount, 10)
          : 1;

        const batchInfo =
          message.batchIndex !== undefined && message.totalBatches !== undefined
            ? `batch ${message.batchIndex + 1}/${message.totalBatches}`
            : 'single batch';

        LOGGER.info(
          `Processing football matchup ${message.matchupId} (${batchInfo}) with ${message.players.length} players`,
        );

        let failedPlayerCount = 0;
        let retryablePlayerCount = 0;
        let hitRateLimit = false;
        let hitTimeBudget = false;
        const invocationStart = Date.now();

        for (const player of message.players) {
          const elapsed = Date.now() - invocationStart;
          if (elapsed > PLAYER_PROCESSING_BUDGET_MS) {
            LOGGER.warn(
              `Time budget exceeded before player ${player.playerId} — stopping early`,
              { matchupId: message.matchupId },
            );
            hitTimeBudget = true;
            break;
          }

          try {
            addBreadcrumb(
              `Loading football stats for player ${player.playerId}`,
            );
            await loadFootballPlayerGameStats(db, player);
          } catch (error) {
            failedPlayerCount++;

            const isRetryable =
              error &&
              typeof error === 'object' &&
              'isRetryableTimeout' in error &&
              (error as RetryableError).isRetryableTimeout === true;

            if (isRetryable) retryablePlayerCount++;

            const isRateLimit =
              error &&
              typeof error === 'object' &&
              'isRateLimit' in error &&
              (error as RetryableError).isRateLimit === true;

            if (isRateLimit) {
              hitRateLimit = true;
              LOGGER.warn(`Rate limited — aborting remaining players`, {
                matchupId: message.matchupId,
              });
              break;
            }
          }
        }

        if (hitTimeBudget) {
          batchItemFailures.push({ itemIdentifier: record.messageId });
          await updateMatchupStatus(db, message.matchupId, 'retry');
          continue;
        }

        const shouldRetry =
          retryablePlayerCount > 0 && retryCount < MAX_RETRIES;

        if (shouldRetry) {
          batchItemFailures.push({ itemIdentifier: record.messageId });
          await updateMatchupStatus(db, message.matchupId, 'retry');
          continue;
        }

        const isLastBatch =
          message.totalBatches === undefined ||
          message.batchIndex === undefined ||
          message.batchIndex === message.totalBatches - 1;

        if (isLastBatch) {
          const finalStatus: 'completed' | 'failed' =
            failedPlayerCount === message.players.length
              ? 'failed'
              : 'completed';

          let matchupMainStatus: 'in_progress' | 'completed' | undefined;

          if (finalStatus === 'completed') {
            matchupMainStatus = await checkMatchupCompletion(
              db,
              message.matchupId,
            );

            try {
              const scoreResult = await calculateAndUpdateFootballMatchupScores(
                db,
                message.matchupId,
                true,
              );
              LOGGER.info(
                `Calculated football scores for matchup ${message.matchupId}`,
                {
                  team1Score: scoreResult.team1Score,
                  team2Score: scoreResult.team2Score,
                },
              );
            } catch (scoreError) {
              const scoreErr =
                scoreError instanceof Error
                  ? scoreError
                  : new Error(String(scoreError));
              LOGGER.error(
                `Failed to calculate football scores for matchup ${message.matchupId}`,
                scoreErr,
                { matchupId: message.matchupId },
              );
              captureError(scoreErr, {
                matchupId: message.matchupId,
                context: 'football-post-stats-score-calculation',
              });
            }
          }

          await updateMatchupStatus(db, message.matchupId, finalStatus, {
            status: matchupMainStatus,
          });

          LOGGER.info(
            `Set football matchup ${message.matchupId} stats_loading_status to '${finalStatus}'`,
            {
              successfulPlayers: message.players.length - failedPlayerCount,
              failedPlayers: failedPlayerCount,
              hitRateLimit,
            },
          );
        }

        addBreadcrumb(`Processed football matchup ${message.matchupId} stats`);
        await emitFootballSuccess('game_load');
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        LOGGER.error(
          `Failed to process football record ${record.messageId}`,
          err,
        );

        let parsedMessage: LoadFootballMatchupStatsMessage | undefined;
        try {
          parsedMessage = JSON.parse(
            record.body,
          ) as LoadFootballMatchupStatsMessage;
        } catch {
          // ignore
        }

        const retryCount = record.attributes?.ApproximateReceiveCount
          ? parseInt(record.attributes.ApproximateReceiveCount, 10)
          : 1;

        if (isRetryableError(error) && retryCount < MAX_RETRIES) {
          batchItemFailures.push({ itemIdentifier: record.messageId });
          if (parsedMessage?.matchupId) {
            await updateMatchupStatus(db, parsedMessage.matchupId, 'retry');
          }
          continue;
        }

        if (parsedMessage?.matchupId) {
          await updateMatchupStatus(db, parsedMessage.matchupId, 'failed');
        }

        captureError(err, {
          tags: {
            lambda: 'stats-lambda',
            operation: 'load_football_game_stats',
          },
          extra: { messageId: record.messageId, message: parsedMessage },
        });

        await emitFootballFailure('game_load');
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures };
  });
};

export const handler = baseHandler;
