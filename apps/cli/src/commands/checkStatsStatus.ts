/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';
import {
  getStatsRefreshSummary,
  PublicDb,
  runWithPublicClient,
} from '@legacy-sports/db-client';
import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';
import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import { EnvironmentVariable } from '../EnvironmentVariable';

interface HandleCheckStatsStatusArgs {
  watch?: boolean;
  interval?: number;
}

interface QueueStats {
  available: number;
  inFlight: number;
  delayed: number;
  dlq: number;
}

async function getQueueStats(): Promise<QueueStats | null> {
  try {
    const queueUrl = getEnvVarRequired(
      EnvironmentVariable.SQS_LOAD_SEASON_STATS_URL,
    );
    const sqsClient = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });

    const command = new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: [
        'ApproximateNumberOfMessages',
        'ApproximateNumberOfMessagesNotVisible',
        'ApproximateNumberOfMessagesDelayed',
        'RedrivePolicy',
      ],
    });

    const response = await sqsClient.send(command);

    // Get DLQ stats if RedrivePolicy exists
    let dlqCount = 0;
    if (response.Attributes?.RedrivePolicy) {
      try {
        const redrivePolicy = JSON.parse(response.Attributes.RedrivePolicy);
        const dlqArn = redrivePolicy.deadLetterTargetArn;

        // Extract DLQ URL from ARN
        const dlqName = dlqArn.split(':').pop();
        const dlqUrl = queueUrl.replace(/[^/]+$/, dlqName);

        const dlqCommand = new GetQueueAttributesCommand({
          QueueUrl: dlqUrl,
          AttributeNames: ['ApproximateNumberOfMessages'],
        });

        const dlqResponse = await sqsClient.send(dlqCommand);
        dlqCount = parseInt(
          dlqResponse.Attributes?.ApproximateNumberOfMessages || '0',
          10,
        );
      } catch (dlqError) {
        LOGGER.debug('Could not fetch DLQ stats:', dlqError);
      }
    }

    return {
      available: parseInt(
        response.Attributes?.ApproximateNumberOfMessages || '0',
        10,
      ),
      inFlight: parseInt(
        response.Attributes?.ApproximateNumberOfMessagesNotVisible || '0',
        10,
      ),
      delayed: parseInt(
        response.Attributes?.ApproximateNumberOfMessagesDelayed || '0',
        10,
      ),
      dlq: dlqCount,
    };
  } catch (error) {
    LOGGER.warn('Could not fetch SQS queue stats:', error);
    return null;
  }
}

async function displayStatsStatus(db: PublicDb): Promise<void> {
  const summary = await getStatsRefreshSummary(db);

  const totalProcessed = summary.totalPlayers - summary.neverFetched;
  const percentComplete = (
    (totalProcessed / summary.totalPlayers) *
    100
  ).toFixed(1);

  LOGGER.info('═══════════════════════════════════════════════════════════');
  LOGGER.info('📊 Season Stats Loading Status');
  LOGGER.info('═══════════════════════════════════════════════════════════');
  LOGGER.info('');
  LOGGER.info(
    `Total Players:           ${summary.totalPlayers.toLocaleString()}`,
  );
  LOGGER.info(
    `Processed:               ${totalProcessed.toLocaleString()} (${percentComplete}%)`,
  );
  LOGGER.info('');
  LOGGER.info('Breakdown:');
  LOGGER.info(
    `  ✅ Recent (<24h):      ${summary.recentStats.toLocaleString()}`,
  );
  LOGGER.info(
    `  ⚠️  Stale (>24h):       ${summary.staleStats.toLocaleString()}`,
  );
  LOGGER.info(
    `  ❌ Never Fetched:      ${summary.neverFetched.toLocaleString()}`,
  );
  LOGGER.info('');

  // Fetch and display queue stats
  const queueStats = await getQueueStats();
  if (queueStats) {
    const totalQueued =
      queueStats.available + queueStats.inFlight + queueStats.delayed;
    LOGGER.info('Queue Status:');
    LOGGER.info(
      `  📬 Queued:             ${queueStats.available.toLocaleString()}`,
    );
    LOGGER.info(
      `  ⚙️  Processing:         ${queueStats.inFlight.toLocaleString()}`,
    );
    if (queueStats.delayed > 0) {
      LOGGER.info(
        `  ⏱️  Delayed:            ${queueStats.delayed.toLocaleString()}`,
      );
    }
    if (queueStats.dlq > 0) {
      LOGGER.info(
        `  ⚠️  DLQ (Failed):       ${queueStats.dlq.toLocaleString()}`,
      );
    }
    LOGGER.info(`  📊 Total in Queue:     ${totalQueued.toLocaleString()}`);

    if (totalQueued > 0) {
      const estimatedMinutes = Math.round(totalQueued * 0.4); // ~24 seconds per player
      const estimatedHours = (estimatedMinutes / 60).toFixed(1);
      LOGGER.info(
        `  ⏰ ETA:                ~${estimatedHours}h (${estimatedMinutes} min)`,
      );
    }
    LOGGER.info('');
  }

  // Progress bar
  const barLength = 50;
  const filledLength = Math.round(
    (totalProcessed / summary.totalPlayers) * barLength,
  );
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
  LOGGER.info(`Progress: [${bar}] ${percentComplete}%`);
  LOGGER.info('');

  // Show recommendation
  if (summary.neverFetched > 0) {
    LOGGER.info(
      `💡 Recommendation: Load ${Math.min(summary.neverFetched, 500)} more players with:`,
    );
    LOGGER.info(
      `   pnpm exec nx run cli:load-career-stats -- --remote=true --limit=${Math.min(summary.neverFetched, 500)}`,
    );
  } else if (summary.staleStats > 100) {
    LOGGER.info(
      `💡 Recommendation: Refresh ${Math.min(summary.staleStats, 500)} stale players with:`,
    );
    LOGGER.info(
      `   pnpm exec nx run cli:load-career-stats -- --remote=true --limit=${Math.min(summary.staleStats, 500)} --prioritize-new=false`,
    );
  } else {
    LOGGER.info('✨ Stats are up to date!');
  }

  LOGGER.info('═══════════════════════════════════════════════════════════');
}

export async function handleCheckStatsStatus(
  args: HandleCheckStatsStatusArgs,
): Promise<void> {
  const opts = getDbOptions();

  if (args.watch) {
    LOGGER.info(`Starting watch mode (refresh every ${args.interval}s)...`);
    LOGGER.info('Press Ctrl+C to exit\n');

    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Clear console (for Windows PowerShell and Unix)
      if (process.platform === 'win32') {
        process.stdout.write('\x1Bc');
      } else {
        process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
      }

      await runWithPublicClient(opts, async (db: PublicDb) => {
        await displayStatsStatus(db);
      });

      LOGGER.info(`\nNext update in ${args.interval} seconds...`);

      // Wait for the specified interval
      await new Promise((resolve) => setTimeout(resolve, args.interval * 1000));
    }
  } else {
    // Single run
    await runWithPublicClient(opts, async (db: PublicDb) => {
      await displayStatsStatus(db);
    });
  }
}
