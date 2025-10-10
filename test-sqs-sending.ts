#!/usr/bin/env tsx
/**
 * Test SQS Message Sending
 * 
 * This tests if we can actually send messages to the SQS queue from your local environment
 */

import { config } from 'dotenv';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

// Load environment variables
config();

async function testSqsSending() {
  console.log('🧪 Testing SQS Message Sending...\n');

  const queueUrl = process.env.SQS_AUTOMATIC_DRAFTS_URL;
  console.log(`Queue URL: ${queueUrl}`);
  
  if (!queueUrl) {
    console.error('❌ SQS_AUTOMATIC_DRAFTS_URL not configured');
    return;
  }

  const sqsClient = new SQSClient({ region: 'us-east-1' });

  try {
    console.log('📨 Attempting to send test message...');
    
    const testMessage = {
      messageType: 'START_DRAFT',
      payload: {
        leagueId: 999999,
        draftType: 'snake-draft',
        requestedBy: 1,
        timestamp: new Date().toISOString(),
      }
    };

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(testMessage),
      MessageGroupId: 'draft-processing',
      MessageDeduplicationId: `test-draft-999999-${Date.now()}`,
    });

    const result = await sqsClient.send(command);
    
    console.log('✅ SUCCESS! Message sent to SQS queue');
    console.log(`   Message ID: ${result.MessageId}`);
    console.log(`   Sequence Number: ${result.SequenceNumber}`);
    console.log();
    console.log('🎯 This proves your local GraphQL service CAN send SQS messages!');
    console.log('💡 You can safely remove the development mode check.');
    
  } catch (error) {
    console.error('❌ FAILED to send message:', error instanceof Error ? error.message : String(error));
    console.log();
    console.log('🚫 This means you should keep the development mode check.');
    console.log('   Possible issues:');
    console.log('   - AWS credentials expired');
    console.log('   - Insufficient permissions');
    console.log('   - Network connectivity issues');
  }
}

testSqsSending().catch(console.error);
