import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { LOGGER } from '@legacy-sports/logging';

// Draft processing message types for SQS queue
export interface StartDraftMessage {
  leagueId: number;
  draftType: 'random-draft' | 'snake-draft' | 'auction';
  requestedBy: number; // User ID who requested the draft
  timestamp: string;
}

// Message wrapper for SQS compatibility
export interface SqsDraftMessage {
  messageType: 'START_DRAFT';
  payload: StartDraftMessage;
}

// Response types for draft processing
export interface DraftProcessingResult {
  success: boolean;
  leagueId: number;
  message: string;
  error?: string;
}

export class DraftSqsService {
  private sqsClient: SQSClient;
  private queueUrl: string;

  constructor(queueUrl: string, region = 'us-east-1') {
    this.sqsClient = new SQSClient({ region });
    this.queueUrl = queueUrl;
  }

  /**
   * Send a start draft message to the SQS queue
   */
  async sendStartDraftMessage(message: StartDraftMessage): Promise<void> {
    try {
      const sqsMessage: SqsDraftMessage = {
        messageType: 'START_DRAFT',
        payload: message,
      };

      const command = new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(sqsMessage),
        MessageGroupId: 'draft-processing', // Required for FIFO queues
        MessageDeduplicationId: `draft-${message.leagueId}-${message.timestamp}`, // Ensure uniqueness
      });

      await this.sqsClient.send(command);

      LOGGER.info(
        `Successfully queued draft request for league ${message.leagueId}`,
      );
    } catch (error) {
      LOGGER.error(
        'Failed to send draft message to SQS:',
        error instanceof Error ? error.message : String(error),
      );
      throw new Error(
        `Failed to queue draft request: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
