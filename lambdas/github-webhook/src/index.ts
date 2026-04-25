import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  SQSEvent,
} from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';
import { verifyGitHubSignature } from './verify-signature';
import { handlePullRequestEvent } from './handle-pull-request';
import { handlePullRequestReviewEvent } from './handle-pull-request-review';
import { handleRaceCheckMessage } from './handle-race-check';
import { handleReviewThreadEvent } from './handle-review-thread';
import { handleWorkflowRunEvent } from './handle-workflow-run';
import { handleJiraTransitionEvent } from './handle-jira-transition';
import type { RaceCheckMessage } from './sqs-client';

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
let jiraWebhookSecretPromise: Promise<string> | null = null;
let agentAuthorAppKeyPromise: Promise<string> | null = null;

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

function getJiraWebhookSecret(): Promise<string> {
  if (!jiraWebhookSecretPromise) {
    jiraWebhookSecretPromise = retrieveSecretParameterValue(
      requireEnv('JIRA_WEBHOOK_SECRET_SECRET_NAME'),
    );
  }
  return jiraWebhookSecretPromise;
}

function getAgentAuthorAppKey(): Promise<string> {
  if (!agentAuthorAppKeyPromise) {
    agentAuthorAppKeyPromise = retrieveSecretParameterValue(
      requireEnv('AGENT_AUTHOR_APP_PRIVATE_KEY_SECRET_NAME'),
    );
  }
  return agentAuthorAppKeyPromise;
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

function isSqsEvent(event: APIGatewayProxyEvent | SQSEvent): event is SQSEvent {
  return (
    'Records' in event &&
    Array.isArray(event.Records) &&
    event.Records.length > 0 &&
    event.Records[0]?.eventSource === 'aws:sqs'
  );
}

export const handler = async (
  event: APIGatewayProxyEvent | SQSEvent,
): Promise<APIGatewayProxyResult> => {
  // ── SQS self-invocation route (race-check messages) ──────────────────────
  // SQS event source mapping deletes messages on successful completion and
  // re-delivers on throw; we let errors propagate so the retry/DLQ machinery
  // does its job. Batch size is 1 (configured in Terraform) so iteration is
  // nominal but kept for correctness.
  if (isSqsEvent(event)) {
    let botKey: string;
    try {
      botKey = await getBotAppPrivateKey();
    } catch (error) {
      LOGGER.error('Failed to retrieve bot app private key for SQS handler', {
        error,
      });
      throw error;
    }

    for (const record of event.Records) {
      let payload: RaceCheckMessage;
      try {
        payload = JSON.parse(record.body) as RaceCheckMessage;
      } catch (error) {
        // Malformed message — log and skip (do not throw, else SQS redelivers
        // the same bad message until DLQ).
        LOGGER.error('Skipping unparseable SQS message', {
          error,
          messageId: record.messageId,
        });
        continue;
      }

      const result = await handleRaceCheckMessage(payload, botKey);
      LOGGER.info('Handled race-check SQS message', {
        messageId: record.messageId,
        result,
      });
    }
    // SQS event source mapping ignores the response shape — any 2xx works.
    return json(200, { status: 'ok' });
  }

  const { httpMethod, path, body: rawBody, isBase64Encoded } = event;
  // API Gateway can send a null headers object at runtime even though the
  // TypeScript type says otherwise — normalise once here for both routes.
  const headers = event.headers ?? {};

  // Health check
  if (httpMethod === 'GET' && path.endsWith('/health')) {
    return json(200, { status: 'ok' });
  }

  if (httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  // Decode body (shared by both routes)
  const bodyStr =
    isBase64Encoded && rawBody
      ? Buffer.from(rawBody, 'base64').toString('utf8')
      : (rawBody ?? '');

  // ── Jira webhook route (/github-webhook/jira) ─────────────────────────────
  if (path.endsWith('/jira')) {
    // Jira's built-in webhook Secret field signs the request body with
    // HMAC-SHA256 and sends the digest in X-Hub-Signature: sha256=<hex> —
    // the same format GitHub uses, so we reuse verifyGitHubSignature.
    const jiraSigHeader =
      headers['X-Hub-Signature'] ?? headers['x-hub-signature'];
    if (!jiraSigHeader) {
      LOGGER.warn('Jira webhook rejected — missing X-Hub-Signature header');
      return json(401, { error: 'Unauthorized' });
    }

    const jiraSecret = await getJiraWebhookSecret();
    if (!verifyGitHubSignature(bodyStr, jiraSigHeader, jiraSecret)) {
      LOGGER.warn('Jira webhook rejected — invalid HMAC signature');
      return json(401, { error: 'Unauthorized' });
    }

    let jiraPayload: unknown;
    try {
      jiraPayload = JSON.parse(bodyStr) as unknown;
    } catch {
      return json(400, { error: 'Invalid JSON payload' });
    }

    const [appPrivateKey, githubRepo] = await Promise.all([
      getAgentAuthorAppKey(),
      Promise.resolve(requireEnv('GITHUB_REPO')),
    ]);
    const agentAuthorAppIdRaw = requireEnv('AGENT_AUTHOR_APP_ID');
    const agentAuthorAppId = Number(agentAuthorAppIdRaw);
    if (!Number.isFinite(agentAuthorAppId) || agentAuthorAppId <= 0) {
      throw new Error(
        `AGENT_AUTHOR_APP_ID must be a positive integer, got: "${agentAuthorAppIdRaw}"`,
      );
    }

    try {
      const result = await handleJiraTransitionEvent(
        jiraPayload as Parameters<typeof handleJiraTransitionEvent>[0],
        appPrivateKey,
        agentAuthorAppId,
        githubRepo,
      );
      LOGGER.info('Handled Jira webhook event', { result });
      return json(200, { status: 'ok', result });
    } catch (error) {
      LOGGER.error('Error handling Jira webhook event', { error });
      return json(500, { error: 'Internal server error' });
    }
  }

  // ── GitHub webhook route (/github-webhook) ────────────────────────────────

  // Verify GitHub webhook signature — check header presence before hitting Secrets Manager
  const sigHeader =
    headers['X-Hub-Signature-256'] ?? headers['x-hub-signature-256'];
  if (!sigHeader) {
    LOGGER.warn('GitHub webhook rejected — missing X-Hub-Signature-256 header');
    return json(401, { error: 'Unauthorized' });
  }

  let secret: string;
  try {
    secret = await getWebhookSecret();
  } catch (error) {
    LOGGER.error('Failed to retrieve webhook secret', { error });
    return json(500, { error: 'Internal server error' });
  }

  if (!verifyGitHubSignature(bodyStr, sigHeader, secret)) {
    LOGGER.warn('GitHub webhook rejected — invalid signature');
    return json(401, { error: 'Unauthorized' });
  }

  const eventType =
    headers['X-GitHub-Event'] ?? headers['x-github-event'] ?? '';

  LOGGER.info('Received GitHub webhook event', { eventType });

  const HANDLED_EVENTS = new Set([
    'pull_request',
    'pull_request_review',
    'pull_request_review_thread',
    'workflow_run',
  ]);

  if (!HANDLED_EVENTS.has(eventType)) {
    // Return 200 for all other events — GitHub expects 200 or it retries
    return json(200, { status: 'ignored', eventType });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(bodyStr) as unknown;
  } catch {
    return json(400, { error: 'Invalid JSON payload' });
  }

  let botKey: string;
  try {
    botKey = await getBotAppPrivateKey();
  } catch (error) {
    LOGGER.error('Failed to retrieve bot app private key', { error });
    return json(500, { error: 'Internal server error' });
  }

  try {
    let result: string;

    if (eventType === 'pull_request') {
      result = await handlePullRequestEvent(
        payload as Parameters<typeof handlePullRequestEvent>[0],
        botKey,
      );
    } else if (eventType === 'pull_request_review') {
      result = await handlePullRequestReviewEvent(
        payload as Parameters<typeof handlePullRequestReviewEvent>[0],
        botKey,
      );
    } else if (eventType === 'workflow_run') {
      result = await handleWorkflowRunEvent(
        payload as Parameters<typeof handleWorkflowRunEvent>[0],
        botKey,
      );
    } else {
      result = await handleReviewThreadEvent(
        payload as Parameters<typeof handleReviewThreadEvent>[0],
        botKey,
      );
    }

    LOGGER.info(`Handled ${eventType} event`, { result });
    return json(200, { status: 'ok', result });
  } catch (error) {
    LOGGER.error(`Error handling ${eventType} event`, { error });
    return json(500, { error: 'Internal server error' });
  }
};
