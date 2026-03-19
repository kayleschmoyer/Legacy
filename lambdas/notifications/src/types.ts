/**
 * Notification event payload sent to the notifications SQS queue.
 * Producers (draft-processor, stripe-webhook, etc.) publish these messages.
 */
export interface NotificationEvent {
  /** Target user ID. Required for single-user sends. */
  userId: number;
  /** Notification type matching NotificationTypes constants. */
  notificationType: string;
  /** Short human-readable title shown in the push notification banner. */
  title: string;
  /** Body text displayed beneath the title. */
  body: string;
  /** Optional structured data included for deep-link routing on the client. */
  data?: Record<string, unknown>;
}

/**
 * Result reported back per SQS record.
 */
export interface SendResult {
  userId: number;
  tokensAttempted: number;
  tokensSent: number;
  tokensFailed: number;
  historyId: number | null;
}
