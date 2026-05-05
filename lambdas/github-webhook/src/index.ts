import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';
import { verifyGitHubSignature } from './verify-signature';
import { handleJiraTransitionEvent } from './handle-jira-transition';
import { handleReviewThreadResolvedEvent } from './handle-review-thread-resolved';

// ── Environment ───────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// ── Secret caching (promise memoisation per cold start) ───────────────────────

let jiraWebhookSecretPromise: Promise<string> | null = null;
let githubWebhookSecretPromise: Promise<string> | null = null;
let agentAuthorAppKeyPromise: Promise<string> | null = null;

function getJiraWebhookSecret(): Promise<string> {
  if (!jiraWebhookSecretPromise) {
    jiraWebhookSecretPromise = retrieveSecretParameterValue(
      requireEnv('JIRA_WEBHOOK_SECRET_SECRET_NAME'),
    );
  }
  return jiraWebhookSecretPromise;
}

function getGitHubWebhookSecret(): Promise<string> {
  if (!githubWebhookSecretPromise) {
    githubWebhookSecretPromise = retrieveSecretParameterValue(
      requireEnv('GITHUB_WEBHOOK_SECRET_SECRET_NAME'),
    );
  }
  return githubWebhookSecretPromise;
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

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const { httpMethod, path, body: rawBody, isBase64Encoded } = event;
  // API Gateway can send a null headers object at runtime even though the
  // TypeScript type says otherwise — normalise once here.
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
    try {
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

  // ── GitHub webhook route (/github-webhook/github) ────────────────────────
  // Receives pull_request_review_thread events from the GitHub App webhook and
  // dispatches merge-queue.yml when a thread on a merge-when-ready PR resolves.
  // GitHub Actions does not support pull_request_review_thread as a workflow
  // trigger, so this webhook fills the gap.
  if (path.endsWith('/github')) {
    try {
      const githubSigHeader =
        headers['X-Hub-Signature-256'] ?? headers['x-hub-signature-256'];
      if (!githubSigHeader) {
        LOGGER.warn(
          'GitHub webhook rejected — missing X-Hub-Signature-256 header',
        );
        return json(401, { error: 'Unauthorized' });
      }

      const githubSecret = await getGitHubWebhookSecret();
      if (!verifyGitHubSignature(bodyStr, githubSigHeader, githubSecret)) {
        LOGGER.warn('GitHub webhook rejected — invalid HMAC signature');
        return json(401, { error: 'Unauthorized' });
      }

      const githubEvent =
        headers['X-GitHub-Event'] ?? headers['x-github-event'];
      if (githubEvent !== 'pull_request_review_thread') {
        LOGGER.info('GitHub webhook ignored — not pull_request_review_thread', {
          githubEvent,
        });
        return json(200, { status: 'ignored' });
      }

      let githubPayload: unknown;
      try {
        githubPayload = JSON.parse(bodyStr) as unknown;
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

      const result = await handleReviewThreadResolvedEvent(
        githubPayload as Parameters<typeof handleReviewThreadResolvedEvent>[0],
        appPrivateKey,
        agentAuthorAppId,
        githubRepo,
      );
      LOGGER.info('Handled GitHub webhook event', { result });
      return json(200, { status: 'ok', result });
    } catch (error) {
      LOGGER.error(
        'Error handling GitHub webhook event',
        error instanceof Error ? error : new Error(String(error)),
      );
      return json(500, { error: 'Internal server error' });
    }
  }

  // Return 200/ignored for any other POST (e.g. legacy GitHub webhook events
  // still pointed at /github-webhook during the transition period) to avoid
  // GitHub retrying on 404s and generating persistent noise.
  return json(200, { status: 'ignored' });
};
