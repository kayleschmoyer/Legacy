/**
 * MLB provider player-info handler (LS-8597, formerly a stub per LS-1864).
 *
 * Handles SQS messages requesting current team affiliation + jersey number
 * sync for a baseball player from the configured MLB data provider.
 *
 * Expected message shape:
 * {
 *   type: 'mlb-player-stats',
 *   mlbPlayerId: number,
 *   season: number,
 * }
 */
import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { eq } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';
import { PublicSchema, runWithPublicClient } from '@legacy-sports/db-client';
import { createMlbDataProvider } from '@legacy-sports/mlb-client';
import {
  addBreadcrumb,
  captureError,
  getRollbarConfigFromEnv,
  initRollbar,
} from '@legacy-sports/rollbar';

const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

export interface MlbStatsMessage {
  type: 'mlb-player-stats';
  mlbPlayerId: number;
  season: number;
}

export function isMlbStatsMessage(value: unknown): value is MlbStatsMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const msg = value as Record<string, unknown>;
  return (
    msg['type'] === 'mlb-player-stats' &&
    typeof msg['mlbPlayerId'] === 'number' &&
    Number.isFinite(msg['mlbPlayerId']) &&
    Number.isInteger(msg['mlbPlayerId']) &&
    typeof msg['season'] === 'number' &&
    Number.isFinite(msg['season']) &&
    Number.isInteger(msg['season'])
  );
}

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  addBreadcrumb('Processing MLB player-info sync event', {
    recordsCount: event.Records.length,
  });

  const provider = createMlbDataProvider();
  const batchItemFailures: { itemIdentifier: string }[] = [];

  return runWithPublicClient(getDbOptions(), async (db) => {
    for (const record of event.Records) {
      let message: unknown;
      try {
        message = JSON.parse(record.body);
      } catch {
        LOGGER.warn('Failed to parse MLB stats message body', {
          messageId: record.messageId,
          body: record.body?.substring(0, 200),
        });
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

      if (!isMlbStatsMessage(message)) {
        LOGGER.warn('Skipping non-mlb-player-stats message', {
          messageId: record.messageId,
        });
        continue;
      }

      try {
        const info = await provider.getPlayerInfo(message.mlbPlayerId);
        await db
          .update(PublicSchema.players)
          .set({
            mlbTeam: info.mlbTeamAbbreviation,
            jerseyNumber: info.jerseyNumber,
          })
          .where(eq(PublicSchema.players.mlbPlayerId, message.mlbPlayerId));

        LOGGER.info('Synced MLB player info', {
          mlbPlayerId: message.mlbPlayerId,
          mlbTeam: info.mlbTeamAbbreviation,
          jerseyNumber: info.jerseyNumber,
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        LOGGER.error('Failed to sync MLB player info', err, {
          mlbPlayerId: message.mlbPlayerId,
        });
        // `err` is the raw Error instance (first positional arg, per
        // captureError's (error: Error, context?) signature) — the object
        // below is the context param, not a wrapper around the error itself.
        captureError(err, {
          tags: { lambda: 'stats-lambda', operation: 'load_mlb_player_info' },
          extra: {
            messageId: record.messageId,
            mlbPlayerId: message.mlbPlayerId,
          },
        });
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures };
  });
};
