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
import { parseRollbarPayload, verifyOrigin } from './rollbar-webhook';
import {
  formatAlarmEmbed,
  formatBudgetEmbed,
  formatRollbarEmbed,
  postToDiscord,
} from './discord';
import type { BudgetNotification, CloudWatchAlarm } from './types';

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

const DISCORD_WEBHOOK_URL_SECRET_NAME = requireEnv(
  'DISCORD_WEBHOOK_URL_SECRET_NAME',
);

let discordUrlPromise: Promise<string> | null = null;

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

// ─── SNS handler (CloudWatch Alarms + Budget Notifications) ─────────────────

function isBudgetNotification(parsed: unknown): parsed is BudgetNotification {
  if (parsed === null || typeof parsed !== 'object') return false;
  const obj = parsed as Record<string, unknown>;
  return (
    typeof obj['budgetName'] === 'string' &&
    typeof obj['actualSpend'] === 'string' &&
    typeof obj['budgetLimit'] === 'string' &&
    typeof obj['thresholdPercentage'] === 'string' &&
    typeof obj['accountId'] === 'string'
  );
}

function isCloudWatchAlarm(parsed: unknown): parsed is CloudWatchAlarm {
  if (parsed === null || typeof parsed !== 'object') return false;
  const obj = parsed as Record<string, unknown>;
  return (
    typeof obj['AlarmName'] === 'string' &&
    typeof obj['NewStateValue'] === 'string'
  );
}

async function handleSnsEvent(event: SNSEvent): Promise<void> {
  const discordUrl = await getDiscordWebhookUrl();

  for (const record of event.Records) {
    const message = record.Sns.Message;
    let parsed: unknown;
    try {
      parsed = JSON.parse(message) as unknown;
    } catch {
      LOGGER.warn('Failed to parse SNS message as JSON', { message });
      continue;
    }

    try {
      if (isBudgetNotification(parsed)) {
        const embed = formatBudgetEmbed(parsed);
        await postToDiscord(discordUrl, embed);
        LOGGER.info(`Posted budget alert "${parsed.budgetName}" to Discord`);
      } else if (isCloudWatchAlarm(parsed)) {
        const embed = formatAlarmEmbed(parsed);
        await postToDiscord(discordUrl, embed);
        LOGGER.info(`Posted alarm "${parsed.AlarmName}" to Discord`);
      } else {
        LOGGER.warn('SNS message is not a recognized notification type', {
          message,
        });
      }
    } catch (error) {
      LOGGER.error('Failed to post SNS notification to Discord', {
        message,
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
    const sourceIp = event.requestContext?.identity?.sourceIp;
    if (!verifyOrigin(sourceIp)) {
      LOGGER.warn('Rollbar webhook rejected — unknown origin IP', { sourceIp });
      return jsonResponse(403, { error: 'Forbidden' });
    }

    const encodedBody = event.body ?? '';
    const body =
      event.isBase64Encoded && encodedBody
        ? Buffer.from(encodedBody, 'base64').toString('utf8')
        : encodedBody;

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
