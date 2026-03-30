import { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import {
  addBreadcrumb,
  getRollbarConfigFromEnv,
  initRollbar,
  withRollbar,
} from '@legacy-sports/rollbar';
import { formatVersionInfo, getVersionInfo } from '@legacy-sports/utils/node';
import { deliverNotification } from './deliver';
import type { NotificationEvent } from './types';

// Initialize Rollbar
const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

const versionInfo = getVersionInfo('legacy-sports-notifications');
LOGGER.info('Notifications Lambda initialized', {
  versionFormatted: formatVersionInfo(versionInfo),
  ...versionInfo,
});

const baseHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  addBreadcrumb('Processing notifications lambda event', {
    recordsCount: event.Records.length,
  });

  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      const payload: unknown = JSON.parse(record.body);

      if (!isNotificationEvent(payload)) {
        LOGGER.error('Invalid notification event payload', {
          messageId: record.messageId,
          body: record.body,
        });
        // Move to DLQ — don't retry malformed messages
        batchItemFailures.push({ itemIdentifier: record.messageId });
        continue;
      }

      addBreadcrumb('Delivering notification', {
        userId: payload.userId,
        notificationType: payload.notificationType,
      });

      await deliverNotification(payload);
    } catch (error) {
      LOGGER.error(
        'Failed to process notification record',
        error instanceof Error ? error : new Error(String(error)),
        {
          messageId: record.messageId,
          ...(!(error instanceof Error) && { originalError: error }),
        },
      );
      // Report failure so SQS retries this record
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};

function isNotificationEvent(value: unknown): value is NotificationEvent {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['userId'] === 'number' &&
    typeof v['notificationType'] === 'string' &&
    typeof v['title'] === 'string' &&
    typeof v['body'] === 'string'
  );
}

export const handler = withRollbar(baseHandler);
