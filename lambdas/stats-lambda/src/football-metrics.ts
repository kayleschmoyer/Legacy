import {
  CloudWatchClient,
  PutMetricDataCommand,
  StandardUnit,
} from '@aws-sdk/client-cloudwatch';
import { LOGGER } from '@legacy-sports/logging';

const NAMESPACE = 'LegacySports/FootballIngest';

let cwClient: CloudWatchClient | null = null;

function getClient(): CloudWatchClient {
  if (!cwClient) {
    cwClient = new CloudWatchClient({});
  }
  return cwClient;
}

export type FootballHandler =
  | 'game_load'
  | 'season_load'
  | 'matchup_score'
  | 'pfr_fetch';

export async function emitFootballSuccess(
  handler: FootballHandler,
): Promise<void> {
  await putMetric(`football.${handler}.success`, 1, StandardUnit.Count);
}

export async function emitFootballFailure(
  handler: FootballHandler,
): Promise<void> {
  await putMetric(`football.${handler}.failure`, 1, StandardUnit.Count);
}

export async function emitPfrFetchLatency(latencyMs: number): Promise<void> {
  await putMetric(
    'football.pfr_fetch.latency_ms',
    latencyMs,
    StandardUnit.Milliseconds,
  );
}

async function putMetric(
  metricName: string,
  value: number,
  unit: StandardUnit,
): Promise<void> {
  try {
    await getClient().send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: metricName,
            Value: value,
            Unit: unit,
            Timestamp: new Date(),
          },
        ],
      }),
    );
  } catch (err) {
    // Metric emission failures must never interrupt handler execution.
    LOGGER.warn('Failed to emit CloudWatch metric', err as Error, {
      metricName,
      value,
    });
  }
}
