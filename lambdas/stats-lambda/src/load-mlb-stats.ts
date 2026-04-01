/**
 * MLB provider stats handler — stub implementation.
 *
 * Handles SQS messages requesting player stat sync from the configured
 * MLB data provider (MLB Stats API, BALLDONTLIE, Rolling Insights, etc.).
 *
 * Full implementation added in LS-1864 when the @legacy-sports/mlb-client
 * library is available. Until then this handler logs and returns success
 * so the queue does not back up during development.
 *
 * Expected message shape:
 * {
 *   type: 'mlb-player-stats',
 *   mlbPlayerId: number,
 *   season: number,
 * }
 */
import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';

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

export const handler = (event: SQSEvent): SQSBatchResponse => {
  LOGGER.info('MLB stats handler received messages (stub)', {
    recordsCount: event.Records.length,
  });

  // Stub — LS-1864 will wire up @legacy-sports/mlb-client here.
  // Log each message and return success to avoid blocking the queue.
  for (const record of event.Records) {
    try {
      const message: unknown = JSON.parse(record.body);
      LOGGER.info('MLB stats message received (stub — not yet processed)', {
        messageId: record.messageId,
        message,
      });
    } catch {
      LOGGER.warn('Failed to parse MLB stats message body', {
        messageId: record.messageId,
        body: record.body?.substring(0, 200),
      });
    }
  }

  return { batchItemFailures: [] };
};
