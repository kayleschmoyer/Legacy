import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { LOGGER } from '@legacy-sports/logging';

/**
 * Notification event payload matching the NotificationEvent interface
 * consumed by the notifications Lambda.
 */
export interface PushNotificationEvent {
  userId: number;
  notificationType: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Publishes push notification events to the notifications SQS queue.
 * The notifications Lambda processes these events and delivers them
 * via Expo (mobile) or Web Push (browser).
 */
export class NotificationPublisher {
  private sqsClient: SQSClient;
  private queueUrl: string;

  constructor(queueUrl: string, region?: string) {
    const resolvedRegion = region ?? process.env['AWS_REGION'] ?? 'us-east-1';
    this.sqsClient = new SQSClient({ region: resolvedRegion });
    this.queueUrl = queueUrl;
  }

  /**
   * Publish a single notification event to the queue.
   * Non-fatal: logs warnings on failure but does not throw.
   */
  async publish(event: PushNotificationEvent): Promise<void> {
    try {
      const command = new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(event),
      });

      await this.sqsClient.send(command);

      LOGGER.info('Published push notification event', {
        userId: event.userId,
        notificationType: event.notificationType,
      });
    } catch (error) {
      LOGGER.warn('Failed to publish push notification event (non-fatal)', {
        userId: event.userId,
        notificationType: event.notificationType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Publish notification events to multiple users.
   */
  async publishToMany(
    userIds: number[],
    notification: Omit<PushNotificationEvent, 'userId'>,
  ): Promise<void> {
    const BATCH_SIZE = 10;

    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((userId) => this.publish({ ...notification, userId })),
      );
    }
  }
}

/**
 * Create a NotificationPublisher from the NOTIFICATION_QUEUE_URL env var.
 * Returns null if the env var is not set (non-fatal — push notifications
 * are optional in dev).
 */
export function createNotificationPublisher(): NotificationPublisher | null {
  const queueUrl = process.env['NOTIFICATION_QUEUE_URL'];
  if (!queueUrl) {
    const message =
      'NOTIFICATION_QUEUE_URL not set, push notifications disabled';
    if (process.env['NODE_ENV'] === 'development') {
      LOGGER.debug(message);
    } else {
      LOGGER.warn(message);
    }
    return null;
  }
  return new NotificationPublisher(queueUrl);
}
