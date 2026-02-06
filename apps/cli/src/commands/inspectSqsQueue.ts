import {
  GetQueueAttributesCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { getEnvVarRequired } from '@legacy-sports/env-utilities';
import { EnvironmentVariable } from '../EnvironmentVariable';

/**
 * CLI command to inspect and manage the SQS draft queue
 *
 * This command allows you to:
 * - Check queue attributes (message count, visibility timeout, etc.)
 * - Peek at messages without consuming them
 * - List messages in the queue
 * - Purge the queue (development only)
 */

interface QueueMessage {
  messageId: string;
  receiptHandle: string;
  body: string;
  attributes?: Record<string, string>;
  messageAttributes?: Record<string, unknown>;
}

interface CommandArgs {
  action: string;
  queueType: string;
  maxMessages: number;
}

interface ParsedDraftMessage {
  messageType: string;
  payload: {
    leagueId: number;
    draftType: string;
    requestedBy: number;
    timestamp: string;
  };
}

class SqsQueueInspector {
  private sqsClient: SQSClient;
  private queueUrl: string;

  constructor(queueUrl: string, region = 'us-east-1') {
    this.sqsClient = new SQSClient({ region });
    this.queueUrl = queueUrl;
  }

  /**
   * Get queue attributes and statistics
   */
  async getQueueAttributes(): Promise<void> {
    try {
      console.log('🔍 Fetching SQS Queue Attributes...');
      console.log(`📍 Queue URL: ${this.queueUrl}\n`);

      const command = new GetQueueAttributesCommand({
        QueueUrl: this.queueUrl,
        AttributeNames: [
          'ApproximateNumberOfMessages',
          'ApproximateNumberOfMessagesNotVisible',
          'ApproximateNumberOfMessagesDelayed',
          'CreatedTimestamp',
          'LastModifiedTimestamp',
          'VisibilityTimeout',
          'MessageRetentionPeriod',
          'DelaySeconds',
          'ReceiveMessageWaitTimeSeconds',
          'FifoQueue',
          'ContentBasedDeduplication',
        ],
      });

      const result = await this.sqsClient.send(command);

      if (result.Attributes) {
        console.log('📊 Queue Statistics:');
        console.log('==================');
        console.log(
          `🔢 Messages Available: ${result.Attributes.ApproximateNumberOfMessages}`,
        );
        console.log(
          `⏳ Messages In Flight: ${result.Attributes.ApproximateNumberOfMessagesNotVisible}`,
        );
        console.log(
          `⏱️  Messages Delayed: ${result.Attributes.ApproximateNumberOfMessagesDelayed || '0'}`,
        );
        console.log(
          `🏗️  Queue Type: ${result.Attributes.FifoQueue === 'true' ? 'FIFO' : 'Standard'}`,
        );
        console.log(
          `⏰ Visibility Timeout: ${result.Attributes.VisibilityTimeout || '0'} seconds`,
        );
        console.log(
          `📅 Created: ${new Date(parseInt(result.Attributes.CreatedTimestamp || '0') * 1000).toISOString()}`,
        );
        console.log(
          `📝 Last Modified: ${new Date(parseInt(result.Attributes.LastModifiedTimestamp || '0') * 1000).toISOString()}\n`,
        );

        const totalMessages =
          parseInt(result.Attributes.ApproximateNumberOfMessages || '0') +
          parseInt(
            result.Attributes.ApproximateNumberOfMessagesNotVisible || '0',
          );

        if (totalMessages === 0) {
          console.log('✅ Queue is empty - no messages found');
        } else {
          console.log(`📬 Total messages in queue: ${totalMessages}`);
          console.log('   💡 Use --peek or --list to see message contents');
        }
      }
    } catch (error) {
      console.error('❌ Failed to get queue attributes:', error);
      throw error;
    }
  }

  /**
   * Peek at messages without consuming them (short visibility timeout)
   */
  async peekMessages(maxMessages = 10): Promise<void> {
    try {
      console.log(
        `👀 Peeking at up to ${maxMessages} messages (won't consume them)...`,
      );

      const command = new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: Math.min(maxMessages, 10), // SQS max is 10
        VisibilityTimeout: 1, // Very short timeout so messages become visible again quickly
        WaitTimeSeconds: 2, // Short polling
        AttributeNames: ['All'],
        MessageAttributeNames: ['All'],
      });

      const result = await this.sqsClient.send(command);

      if (!result.Messages || result.Messages.length === 0) {
        console.log('📭 No messages found in queue');
        return;
      }

      console.log(`\n📨 Found ${result.Messages.length} message(s):`);
      console.log('='.repeat(50));

      result.Messages.forEach((message, index) => {
        console.log(`\n📋 Message ${index + 1}:`);
        console.log(`   🆔 Message ID: ${message.MessageId}`);
        console.log(
          `   📅 Sent: ${
            message.Attributes?.SentTimestamp
              ? new Date(
                  parseInt(message.Attributes.SentTimestamp),
                ).toISOString()
              : 'Unknown'
          }`,
        );

        // Try to parse the message body as draft message
        try {
          const parsedBody = JSON.parse(
            message.Body || '{}',
          ) as ParsedDraftMessage;

          if (parsedBody.messageType === 'START_DRAFT') {
            console.log(`   🎯 Message Type: START_DRAFT`);
            console.log(`   🏟️  League ID: ${parsedBody.payload.leagueId}`);
            console.log(`   🎲 Draft Type: ${parsedBody.payload.draftType}`);
            console.log(
              `   👤 Requested By: ${parsedBody.payload.requestedBy}`,
            );
            console.log(`   ⏰ Timestamp: ${parsedBody.payload.timestamp}`);
          } else {
            console.log(`   📄 Message Type: ${parsedBody.messageType}`);
            console.log(
              `   📝 Raw Body: ${message.Body?.substring(0, 200)}...`,
            );
          }
        } catch {
          console.log(`   ⚠️  Could not parse message body as JSON`);
          console.log(`   📝 Raw Body: ${message.Body?.substring(0, 200)}...`);
        }
      });

      console.log(
        '\n💡 Note: Messages will become visible again after 1 second (peek mode)',
      );
    } catch (error) {
      console.error('❌ Failed to peek at messages:', error);
      throw error;
    }
  }

  /**
   * List messages and consume them (for detailed inspection)
   */
  async listMessages(maxMessages = 10): Promise<QueueMessage[]> {
    try {
      console.log(
        `📋 Listing up to ${maxMessages} messages (will consume them)...`,
      );
      console.log('⚠️  WARNING: This will remove messages from the queue!\n');

      const command = new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: Math.min(maxMessages, 10),
        VisibilityTimeout: 300, // 5 minutes to inspect
        WaitTimeSeconds: 5, // Long polling
        AttributeNames: ['All'],
        MessageAttributeNames: ['All'],
      });

      const result = await this.sqsClient.send(command);

      if (!result.Messages || result.Messages.length === 0) {
        console.log('📭 No messages found in queue');
        return [];
      }

      const messages: QueueMessage[] = result.Messages.map((msg) => ({
        messageId: msg.MessageId || '',
        receiptHandle: msg.ReceiptHandle || '',
        body: msg.Body || '',
        attributes: msg.Attributes,
        messageAttributes: msg.MessageAttributes,
      }));

      console.log(`📨 Retrieved ${messages.length} message(s) for inspection:`);
      console.log('='.repeat(60));

      messages.forEach((message, index) => {
        console.log(`\n📬 Message ${index + 1}:`);
        console.log(`   🆔 ID: ${message.messageId}`);
        console.log(
          `   🎫 Receipt Handle: ${message.receiptHandle.substring(0, 50)}...`,
        );

        try {
          const parsed = JSON.parse(message.body) as ParsedDraftMessage;
          console.log(`   📄 Parsed Content:`, JSON.stringify(parsed, null, 4));
        } catch {
          console.log(`   📝 Raw Body:`, message.body);
        }

        if (message.attributes) {
          console.log(`   📊 Attributes:`);
          Object.entries(message.attributes).forEach(([key, value]) => {
            console.log(`      ${key}: ${value}`);
          });
        }
      });

      return messages;
    } catch (error) {
      console.error('❌ Failed to list messages:', error);
      throw error;
    }
  }

  /**
   * Purge all messages from the queue (development only)
   */
  async purgeQueue(): Promise<void> {
    try {
      console.log('🗑️  Purging all messages from queue...');
      console.log('⚠️  This action cannot be undone!');

      const command = new PurgeQueueCommand({
        QueueUrl: this.queueUrl,
      });

      await this.sqsClient.send(command);

      console.log('✅ Queue purge initiated successfully');
      console.log(
        '💡 It may take up to 60 seconds for all messages to be deleted',
      );
    } catch (error) {
      console.error('❌ Failed to purge queue:', error);
      throw error;
    }
  }
}

// CLI command handler function
export const handleInspectSqsQueue = async (argv: CommandArgs) => {
  try {
    console.log('🔍 SQS Queue Inspector');
    console.log('=====================\n');

    // Determine queue URL based on type
    const queueUrl =
      argv.queueType === 'drafts'
        ? getEnvVarRequired(EnvironmentVariable.SQS_AUTOMATIC_DRAFTS_URL)
        : getEnvVarRequired(EnvironmentVariable.SQS_QUEUE_URL);

    const inspector = new SqsQueueInspector(queueUrl);

    switch (argv.action) {
      case 'attributes':
        await inspector.getQueueAttributes();
        break;

      case 'peek':
        await inspector.getQueueAttributes();
        await inspector.peekMessages(argv.maxMessages);
        break;

      case 'list': {
        await inspector.getQueueAttributes();
        const messages = await inspector.listMessages(argv.maxMessages);

        if (messages.length > 0) {
          console.log('\n💡 Messages have been consumed from the queue.');
          console.log(
            '   They will be deleted automatically unless you process them.',
          );
        }
        break;
      }

      case 'purge':
        await inspector.getQueueAttributes();

        // Safety check for production
        if (process.env.NODE_ENV === 'production') {
          throw new Error(
            'Queue purging is not allowed in production environment',
          );
        }

        await inspector.purgeQueue();
        break;
    }

    console.log('\n✅ SQS queue inspection completed');
  } catch (error) {
    console.error('\n❌ SQS inspection failed:', error);
    process.exit(1);
  }
};
