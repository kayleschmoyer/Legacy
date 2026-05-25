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
import { parseRollbarPayload, verifyWebhookToken } from './rollbar-webhook';
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
const ROLLBAR_WEBHOOK_SECRET_NAME = requireEnv(
  'ROLLBAR_WEBHOOK_SECRET_SECRET_NAME',
);

let discordUrlPromise: Promise<string> | null = null;
let webhookSecretPromise: Promise<string> | null = null;

function getDiscordWebhookUrl(): Promise<string> {
  if (!discordUrlPromise) {
    discordUrlPromise = retrieveSecretParameterValue(
      DISCORD_WEBHOOK_URL_SECRET_NAME,
    );
  }
  return discordUrlPromise;
}

function getWebhookSecret(): Promise<string> {
  if (!webhookSecretPromise) {
    webhookSecretPromise = retrieveSecretParameterValue(
      ROLLBAR_WEBHOOK_SECRET_NAME,
    );
  }
  return webhookSecretPromise;
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

/**
 * Parse an AWS Budget SNS notification from plain text.
 *
 * AWS Budgets sends plain-text messages to SNS (not JSON). The format contains
 * key-value lines like:
 *   Budget Name: my-budget
 *   Budget Type: COST
 *   Budgeted Amount: $200.00
 *   Alert Threshold: > $200.00 (100.0%)
 *   ACTUAL Amount: $205.50
 *   FORECASTED Amount: $250.00
 *   AWS Account 123456789012
 */
export function parsePlainTextBudgetNotification(
  message: string,
): BudgetNotification | null {
  const budgetName = message.match(/Budget Name:\s*(.+)/)?.[1]?.trim();
  const budgetType = message.match(/Budget Type:\s*(.+)/)?.[1]?.trim();
  const budgetLimit = message.match(/Budgeted Amount:\s*(.+)/)?.[1]?.trim();
  const actualSpend = message.match(/ACTUAL Amount:\s*(.+)/)?.[1]?.trim();
  const thresholdMatch = message.match(
    /Alert Threshold:\s*[><=]*\s*\$[\d,.]+\s*\((\d+(?:\.\d+)?)%\)/,
  );
  const thresholdPercentage = thresholdMatch?.[1];
  const accountId = message.match(/AWS Account\s+(\d{12})/)?.[1];

  if (
    !budgetName ||
    !budgetType ||
    !budgetLimit ||
    !actualSpend ||
    !thresholdPercentage ||
    !accountId
  ) {
    return null;
  }

  const notification: BudgetNotification = {
    accountId,
    budgetName,
    budgetType,
    budgetLimit,
    actualSpend,
    thresholdPercentage,
  };

  const forecastedSpend = message
    .match(/FORECASTED Amount:\s*(.+)/)?.[1]
    ?.trim();
  if (forecastedSpend) {
    notification.forecastedSpend = forecastedSpend;
  }

  return notification;
}

async function handleSnsEvent(event: SNSEvent): Promise<void> {
  const discordUrl = await getDiscordWebhookUrl();

  for (const record of event.Records) {
    const message = record.Sns.Message;
    let parsed: unknown;
    try {
      parsed = JSON.parse(message) as unknown;
    } catch {
      // AWS Budget notifications arrive as plain text, not JSON.
      // Try to parse the message as a plain-text budget notification before
      // giving up.
      const budget = parsePlainTextBudgetNotification(message);
      if (budget) {
        try {
          const embed = formatBudgetEmbed(budget);
          await postToDiscord(discordUrl, embed);
          LOGGER.info(`Posted budget alert "${budget.budgetName}" to Discord`);
        } catch (error) {
          LOGGER.warn('Failed to post budget notification to Discord', {
            message,
            error,
          });
        }
      } else {
        LOGGER.warn(
          'Failed to parse SNS message as JSON or plain-text budget',
          {
            message,
          },
        );
      }
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
      LOGGER.warn('Failed to post SNS notification to Discord', {
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
    const rawToken = event.queryStringParameters?.['auth'];
    if (!rawToken) {
      LOGGER.warn('Rollbar webhook rejected — missing auth token');
      return jsonResponse(403, { error: 'Forbidden' });
    }
    // API Gateway URL-decodes query parameters before passing them to Lambda,
    // converting `+` → space. Re-encode spaces as `+` so base64 tokens with
    // `+` characters are compared correctly against the stored secret.
    const token = rawToken.replace(/ /g, '+');
    const secret = await getWebhookSecret();
    if (!verifyWebhookToken(token, secret)) {
      LOGGER.warn('Rollbar webhook rejected — invalid auth token');
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
    if (!embed) {
      LOGGER.info(
        `Skipping Rollbar event "${payload.event_name}" — no actionable data`,
      );
      return jsonResponse(200, { status: 'skipped' });
    }

    const discordUrl = await getDiscordWebhookUrl();
    try {
      await postToDiscord(discordUrl, embed);
    } catch (error) {
      // Log at warn (not error) so this never routes back to Rollbar and
      // triggers another webhook to this lambda, creating a feedback loop.
      LOGGER.warn('Failed to post Rollbar event to Discord', { error });
      return jsonResponse(200, { status: 'discord_error' });
    }

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
