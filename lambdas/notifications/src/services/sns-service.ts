import {
  CreatePlatformEndpointCommand,
  DeleteEndpointCommand,
  PublishCommand,
  SetEndpointAttributesCommand,
  SNSClient,
} from '@aws-sdk/client-sns';
import { LOGGER } from '@legacy-sports/logging';

const logger = LOGGER;

// Initialize SNS client
const snsClient = new SNSClient({
  region: process.env['AWS_REGION'] || 'us-east-1',
});

// Platform Application ARNs (set via environment variables)
const IOS_PLATFORM_ARN = process.env['SNS_IOS_PLATFORM_ARN'] || '';
const ANDROID_PLATFORM_ARN = process.env['SNS_ANDROID_PLATFORM_ARN'] || '';
const EXPO_PLATFORM_ARN = process.env['SNS_EXPO_PLATFORM_ARN'] || '';

export interface SendPushNotificationInput {
  endpointArn: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface CreateEndpointInput {
  deviceToken: string;
  platform: 'ios' | 'android' | 'expo';
  customUserData?: string;
}

/**
 * Create or update a platform endpoint for push notifications
 */
export async function createPlatformEndpoint(
  input: CreateEndpointInput,
): Promise<string> {
  const platformArn = getPlatformArn(input.platform);

  if (!platformArn) {
    throw new Error(
      `Platform ARN not configured for platform: ${input.platform}`,
    );
  }

  try {
    const command = new CreatePlatformEndpointCommand({
      PlatformApplicationArn: platformArn,
      Token: input.deviceToken,
      CustomUserData: input.customUserData,
    });

    const response = await snsClient.send(command);

    if (!response.EndpointArn) {
      throw new Error('Failed to create platform endpoint - no ARN returned');
    }

    logger.info('Created platform endpoint', {
      platform: input.platform,
      endpointArn: response.EndpointArn,
    });

    return response.EndpointArn;
  } catch (error: unknown) {
    logger.error('Error creating platform endpoint', {
      error,
      platform: input.platform,
    });
    throw error;
  }
}

/**
 * Send a push notification via SNS
 */
export async function sendPushNotification(
  input: SendPushNotificationInput,
): Promise<string> {
  try {
    // Format message for different platforms
    const message = JSON.stringify({
      default: input.message,
      APNS: JSON.stringify({
        aps: {
          alert: {
            title: input.title,
            body: input.message,
          },
          sound: 'default',
          badge: 1,
        },
        data: input.data || {},
      }),
      APNS_SANDBOX: JSON.stringify({
        aps: {
          alert: {
            title: input.title,
            body: input.message,
          },
          sound: 'default',
          badge: 1,
        },
        data: input.data || {},
      }),
      GCM: JSON.stringify({
        notification: {
          title: input.title,
          body: input.message,
          sound: 'default',
        },
        data: input.data || {},
      }),
    });

    const command = new PublishCommand({
      TargetArn: input.endpointArn,
      Message: message,
      MessageStructure: 'json',
    });

    const response = await snsClient.send(command);

    logger.info('Push notification sent successfully', {
      endpointArn: input.endpointArn,
      messageId: response.MessageId,
    });

    return response.MessageId || '';
  } catch (error: unknown) {
    logger.error('Error sending push notification', {
      error,
      endpointArn: input.endpointArn,
    });
    throw error;
  }
}

/**
 * Update endpoint attributes (e.g., enable/disable)
 */
export async function updateEndpointAttributes(
  endpointArn: string,
  enabled: boolean,
): Promise<void> {
  try {
    const command = new SetEndpointAttributesCommand({
      EndpointArn: endpointArn,
      Attributes: {
        Enabled: enabled ? 'true' : 'false',
      },
    });

    await snsClient.send(command);

    logger.info('Updated endpoint attributes', {
      endpointArn,
      enabled,
    });
  } catch (error: unknown) {
    logger.error('Error updating endpoint attributes', {
      error,
      endpointArn,
    });
    throw error;
  }
}

/**
 * Delete a platform endpoint
 */
export async function deleteEndpoint(endpointArn: string): Promise<void> {
  try {
    const command = new DeleteEndpointCommand({
      EndpointArn: endpointArn,
    });

    await snsClient.send(command);

    logger.info('Deleted endpoint', { endpointArn });
  } catch (error: unknown) {
    logger.error('Error deleting endpoint', {
      error,
      endpointArn,
    });
    throw error;
  }
}

/**
 * Get platform ARN based on platform type
 */
function getPlatformArn(platform: 'ios' | 'android' | 'expo'): string {
  switch (platform) {
    case 'ios':
      return IOS_PLATFORM_ARN;
    case 'android':
      return ANDROID_PLATFORM_ARN;
    case 'expo':
      return EXPO_PLATFORM_ARN;
    default:
      return '';
  }
}

/**
 * Validate endpoint ARN format
 */
export function isValidEndpointArn(arn: string): boolean {
  return /^arn:aws:sns:[a-z0-9-]+:\d{12}:endpoint\/[A-Z_]+\/[a-zA-Z0-9_-]+\/[a-f0-9-]+$/.test(
    arn,
  );
}
