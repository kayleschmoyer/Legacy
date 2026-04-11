import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';
import { verifyGitHubSignature } from './verify-signature';
import { handleReviewThreadEvent } from './handle-review-thread';

// ── Environment ───────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// ── Secret caching (promise memoisation per cold start) ───────────────────────
// Env vars are read lazily (inside the getter) so the module can be imported
// in tests before process.env is populated.

let webhookSecretPromise: Promise<string> | null = null;
let botKeyPromise: Promise<string> | null = null;

function getWebhookSecret(): Promise<string> {
  if (!webhookSecretPromise) {
    webhookSecretPromise = retrieveSecretParameterValue(
      requireEnv('WEBHOOK_SECRET_SECRET_NAME'),
    );
  }
  return webhookSecretPromise;
}

function getBotAppPrivateKey(): Promise<string> {
  if (!botKeyPromise) {
    botKeyPromise = retrieveSecretParameterValue(
      requireEnv('BOT_APP_PRIVATE_KEY_SECRET_NAME'),
    );
  }
  return botKeyPromise;
}

// ── Response helpers ──────────────────────────────────────────────────────────

function json(
  statusCode: number,
  body: Record<string, unknown>,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const { httpMethod, path, headers, body: rawBody, isBase64Encoded } = event;

  // Health check
  if (httpMethod === 'GET' && path.endsWith('/health')) {
    return json(200, { status: 'ok' });
  }

  if (httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  // Decode body
  const bodyStr =
    isBase64Encoded && rawBody
      ? Buffer.from(rawBody, 'base64').toString('utf8')
      : (rawBody ?? '');

  // Verify GitHub webhook signature — check header presence before hitting Secrets Manager
  const sigHeader =
    headers['X-Hub-Signature-256'] ?? headers['x-hub-signature-256'];
  if (!sigHeader) {
    LOGGER.warn('GitHub webhook rejected — missing X-Hub-Signature-256 header');
    return json(401, { error: 'Unauthorized' });
  }

  const secret = await getWebhookSecret();

  if (!verifyGitHubSignature(bodyStr, sigHeader, secret)) {
    LOGGER.warn('GitHub webhook rejected — invalid signature');
    return json(401, { error: 'Unauthorized' });
  }

  const eventType =
    headers['X-GitHub-Event'] ?? headers['x-github-event'] ?? '';

  LOGGER.info('Received GitHub webhook event', { eventType });

  if (eventType !== 'pull_request_review_thread') {
    // Return 200 for all other events — GitHub expects 200 or it retries
    return json(200, { status: 'ignored', eventType });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(bodyStr) as unknown;
  } catch {
    return json(400, { error: 'Invalid JSON payload' });
  }

  const botKey = await getBotAppPrivateKey();

  try {
    const result = await handleReviewThreadEvent(
      payload as Parameters<typeof handleReviewThreadEvent>[0],
      botKey,
    );
    LOGGER.info('Handled pull_request_review_thread event', { result });
    return json(200, { status: 'ok', result });
  } catch (error) {
    LOGGER.error('Error handling pull_request_review_thread event', { error });
    return json(500, { error: 'Internal server error' });
  }
};
