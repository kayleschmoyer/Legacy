import type {
  APIGatewayEvent,
  APIGatewayProxyResult,
  SNSEvent,
} from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';
import {
  getRollbarConfigFromEnv,
  initRollbar,
  withRollbar,
} from '@legacy-sports/rollbar';
import { parseRollbarPayload, verifySignature } from './rollbar-webhook';
import { formatAlarmEmbed, formatRollbarEmbed, postToDiscord } from './discord';
import type { CloudWatchAlarm } from './types';

// Initialize Rollbar on cold start so withRollbar can capture handler errors.
const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

// ─── Secret caching (promise memoization) ──────────────────────────────────
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

const ROLLBAR_WEBHOOK_SECRET_NAME = requireEnv('ROLLBAR_WEBHOOK_SECRET_NAME');
const DISCORD_WEBHOOK_URL_SECRET_NAME = requireEnv(
  'DISCORD_WEBHOOK_URL_SECRET_NAME',
);

let rollbarSecretPromise: Promise<string> | null = null;
let discordUrlPromise: Promise<string> | null = null;

function getRollbarWebhookSecret(): Promise<string> {
  if (!rollbarSecretPromise) {
    rollbarSecretPromise = retrieveSecretParameterValue(
      ROLLBAR_WEBHOOK_SECRET_NAME,
    );
  }
  return rollbarSecretPromise;
}

function getDiscordWebhookUrl(): Promise<string> {
  if (!discordUrlPromise) {
    discordUrlPromise = retrieveSecretParameterValue(
      DISCORD_WEBHOOK_URL_SECRET_NAME,
    );
  }
  return discordUrlPromise;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function jsonResponse(
  statusCode: number,
  body: Record<string, unknown>,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function isApiGatewayEvent(
  event: APIGatewayEvent | SNSEvent,
): event is APIGatewayEvent {
  return !('Records' in event);
}

// ─── SNS handler (CloudWatch Alarms) ────────────────────────────────────────

async function handleSnsEvent(event: SNSEvent): Promise<void> {
  const discordUrl = await getDiscordWebhookUrl();

  for (const record of event.Records) {
    const message = record.Sns.Message;
    let alarm: CloudWatchAlarm;
    try {
      alarm = JSON.parse(message) as CloudWatchAlarm;
    } catch {
      LOGGER.warn('Failed to parse SNS message as CloudWatch Alarm', {
        message,
      });
      continue;
    }

    if (!alarm.AlarmName || !alarm.NewStateValue) {
      LOGGER.warn('SNS message is not a valid CloudWatch Alarm', { message });
      continue;
    }

    const embed = formatAlarmEmbed(alarm);
    try {
      await postToDiscord(discordUrl, embed);
      LOGGER.info(`Posted alarm "${alarm.AlarmName}" to Discord`);
    } catch (error) {
      LOGGER.error('Failed to post CloudWatch alarm to Discord', {
        alarmName: alarm.AlarmName,
        error,
      });
    }
  }
}

// ─── API Gateway handler (Rollbar webhooks) ─────────────────────────────────

export async function handleApiGatewayEvent(
  event: APIGatewayEvent,
): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const path = event.path;

  // Health check
  if (method === 'GET' && path.endsWith('/health')) {
    return jsonResponse(200, { status: 'ok' });
  }

  // Rollbar webhook
  if (method === 'POST' && path.endsWith('/webhook')) {
    const encodedBody = event.body ?? '';
    const body =
      event.isBase64Encoded && encodedBody
        ? Buffer.from(encodedBody, 'base64').toString('utf8')
        : encodedBody;
    const signature =
      event.headers?.['X-Rollbar-Signature'] ??
      event.headers?.['x-rollbar-signature'];

    const secret = await getRollbarWebhookSecret();
    if (!verifySignature(body, signature, secret)) {
      LOGGER.warn('Rollbar webhook signature verification failed');
      return jsonResponse(401, { error: 'Invalid signature' });
    }

    const payload = parseRollbarPayload(body);
    if (!payload) {
      return jsonResponse(400, { error: 'Invalid payload' });
    }

    const embed = formatRollbarEmbed(payload);
    const discordUrl = await getDiscordWebhookUrl();
    await postToDiscord(discordUrl, embed);

    LOGGER.info(`Posted Rollbar event "${payload.event_name}" to Discord`);
    return jsonResponse(200, { status: 'ok' });
  }

  return jsonResponse(404, { error: 'Not found' });
}

// ─── Entrypoint ─────────────────────────────────────────────────────────────

export const baseHandler = async (
  event: APIGatewayEvent | SNSEvent,
): Promise<APIGatewayProxyResult | void> => {
  if (isApiGatewayEvent(event)) {
    return handleApiGatewayEvent(event);
  }
  await handleSnsEvent(event);
};

export const handler = withRollbar(baseHandler);
