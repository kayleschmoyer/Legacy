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
import { IDPStats } from '@legacy-sports/pfr-client';
import type { LoadFootballSeasonStatsMessage } from './load-game-types';
import { IDP_POSITIONS, validatePfrId } from './constants';
import { emitFootballFailure, emitFootballSuccess } from './football-metrics';

export function isFootballSeasonMessage(
  value: unknown,
): value is LoadFootballSeasonStatsMessage {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  return (
    msg['type'] === 'football-season-stats' && Array.isArray(msg['players'])
  );
}

async function loadFootballPlayerSeasonStats(
  db: PublicDb,
  player: LoadFootballSeasonStatsMessage['players'][0],
): Promise<void> {
  const { playerId, pfrId, season, isDst, position } = player;

  validatePfrId(pfrId);

  const pfrPlayer = { id: playerId, pfrId };

  LOGGER.info(
    `Loading football season stats for player ${playerId} (${pfrId}), season ${season}, isDst=${String(isDst)}, position=${position}`,
  );

  if (isDst) {
    // football_season_defense table is not yet in schema — pending follow-up migration.
    LOGGER.warn(
      `DST season stats loading skipped: football_season_defense table not yet available`,
      { playerId, season },
    );
    return;
  }

  if (IDP_POSITIONS.includes(position)) {
    // IDP season stats → football_season_defense_idp (schema exists)
    const existing = await db
      .select()
      .from(PublicSchema.footballSeasonDefenseIdp)
      .where(
        and(
          eq(PublicSchema.footballSeasonDefenseIdp.playerId, playerId),
          eq(PublicSchema.footballSeasonDefenseIdp.season, season),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      LOGGER.debug(
        `IDP season stats already cached for player ${playerId} season ${season}`,
      );
      return;
    }

    LOGGER.info(
      `No IDP season stats cached for player ${playerId} season ${season}, loading from PFR`,
    );

    const seasonTotals = await IDPStats.getSeasonTotals(pfrPlayer, season);
    if (seasonTotals) {
      await db
        .insert(PublicSchema.footballSeasonDefenseIdp)
        .values({
          playerId: seasonTotals.playerId,
          season: seasonTotals.season,
          team: seasonTotals.team,
          g: seasonTotals.g,
          gs: seasonTotals.gs,
          soloTkl: seasonTotals.soloTkl,
          astTkl: seasonTotals.astTkl,
          totalTkl: seasonTotals.totalTkl,
          sacks:
            seasonTotals.sacks !== null ? String(seasonTotals.sacks) : null,
          int: seasonTotals.int,
          pd: seasonTotals.pd,
          ff: seasonTotals.ff,
          fr: seasonTotals.fr,
          defTd: seasonTotals.defTd,
          safeties: seasonTotals.safeties,
          pfrRowId: seasonTotals.pfrRowId,
        })
        .onConflictDoNothing();
      LOGGER.info(
        `Loaded IDP season stats for player ${playerId} season ${season}`,
      );
    } else {
      LOGGER.debug(
        `No IDP season totals returned from PFR for player ${playerId} season ${season}`,
      );
    }
    return;
  }

  // Offensive/kicking season stats — football_season_passing/rushing/receiving/kicking
  // tables are not yet in schema (pending follow-up migration for offensive season tables).
  LOGGER.warn(
    `Offensive season stats loading skipped: football_season_passing/rushing/receiving/kicking tables not yet available`,
    { playerId, season, position },
  );
}

const baseHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  LOGGER.debug('Processing football season stats SQS event', {
    recordCount: event.Records.length,
  });
  addBreadcrumb(
    `Processing ${event.Records.length} football season stats SQS records`,
  );

  return await runWithPublicClient(getDbOptions(), async (db) => {
    const batchItemFailures: { itemIdentifier: string }[] = [];

    for (const record of event.Records) {
      try {
        if (!record.body) {
          batchItemFailures.push({ itemIdentifier: record.messageId });
          continue;
        }

        let message: LoadFootballSeasonStatsMessage;
        try {
          message = JSON.parse(record.body) as LoadFootballSeasonStatsMessage;
        } catch (parseErr) {
          const err =
            parseErr instanceof Error ? parseErr : new Error(String(parseErr));
          LOGGER.error('Failed to parse football season stats message', err, {
            messageId: record.messageId,
          });
          batchItemFailures.push({ itemIdentifier: record.messageId });
          continue;
        }

        if (!message.players || !Array.isArray(message.players)) {
          batchItemFailures.push({ itemIdentifier: record.messageId });
          continue;
        }

        LOGGER.info(
          `Processing football season stats for ${message.players.length} players`,
        );

        let failedCount = 0;
        for (const player of message.players) {
          try {
            await loadFootballPlayerSeasonStats(db, player);
          } catch (error) {
            failedCount++;
            const err =
              error instanceof Error ? error : new Error(String(error));
            LOGGER.error(
              `Failed to load football season stats for player ${player.playerId}`,
              err,
              { playerId: player.playerId },
            );
          }
        }

        LOGGER.info(`Football season stats processing complete`, {
          total: message.players.length,
          failed: failedCount,
        });
        await emitFootballSuccess('season_load');
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        LOGGER.error('Failed to process football season stats record', err, {
          messageId: record.messageId,
        });
        captureError(err, {
          context: 'load-football-season',
          messageId: record.messageId,
        });
        await emitFootballFailure('season_load');
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures };
  });
};

export const handler = baseHandler;
