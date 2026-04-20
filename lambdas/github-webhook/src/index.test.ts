import type { APIGatewayProxyEvent } from 'aws-lambda';

// Mock deps before importing handler
jest.mock('@legacy-sports/aws-utils', () => ({
  retrieveSecretParameterValue: jest.fn().mockResolvedValue('test-secret'),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('./verify-signature', () => ({
  verifyGitHubSignature: jest.fn().mockReturnValue(true),
  verifyJiraWebhookSecret: jest.fn().mockReturnValue(true),
}));

jest.mock('./handle-review-thread', () => ({
  handleReviewThreadEvent: jest
    .fn()
    .mockResolvedValue('Set bot-review=success for PR #1'),
}));

jest.mock('./handle-jira-transition', () => ({
  handleJiraTransitionEvent: jest
    .fn()
    .mockResolvedValue(
      'Dispatched jira-issue-updated for LS-1234 (In Progress → In Review)',
    ),
}));

// Set env vars before importing handler
process.env['WEBHOOK_SECRET_SECRET_NAME'] = 'test-webhook-secret';
process.env['BOT_APP_PRIVATE_KEY_SECRET_NAME'] = 'test-bot-key';
process.env['JIRA_WEBHOOK_SECRET_SECRET_NAME'] = 'test-jira-secret';
process.env['AGENT_AUTHOR_APP_PRIVATE_KEY_SECRET_NAME'] =
  'test-agent-author-key';
process.env['AGENT_AUTHOR_APP_ID'] = '3142924';
process.env['GITHUB_REPO'] = 'bkrupa/legacy-sports';

import {
  verifyGitHubSignature,
  verifyJiraWebhookSecret,
} from './verify-signature';
import { handleReviewThreadEvent } from './handle-review-thread';
import { handleJiraTransitionEvent } from './handle-jira-transition';
import { handler } from './index';

const mockVerify = verifyGitHubSignature as jest.Mock;
const mockVerifyJira = verifyJiraWebhookSecret as jest.Mock;
const mockHandle = handleReviewThreadEvent as jest.Mock;
const mockHandleJira = handleJiraTransitionEvent as jest.Mock;

function makeEvent(
  overrides: Partial<APIGatewayProxyEvent> = {},
): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/github-webhook',
    headers: {
      'X-Hub-Signature-256': 'sha256=abc123',
      'X-GitHub-Event': 'pull_request_review_thread',
    },
    body: JSON.stringify({
      action: 'resolved',
      pull_request: { number: 1, head: { sha: 'abc' } },
    }),
    isBase64Encoded: false,
    queryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '',
    ...overrides,
  };
}

function makeJiraEvent(
  overrides: Partial<APIGatewayProxyEvent> = {},
): APIGatewayProxyEvent {
  return makeEvent({
    path: '/github-webhook/jira',
    headers: { 'X-Jira-Webhook-Secret': 'test-jira-secret' },
    body: JSON.stringify({
      webhookEvent: 'jira:issue_updated',
      issue: { key: 'LS-1234' },
      changelog: {
        items: [
          { field: 'status', fromString: 'In Progress', toString: 'In Review' },
        ],
      },
    }),
    ...overrides,
  });
}

beforeEach(() => {
  mockVerify.mockReturnValue(true);
  mockVerifyJira.mockReturnValue(true);
  mockHandle.mockResolvedValue('Set bot-review=success for PR #1');
  mockHandleJira.mockResolvedValue(
    'Dispatched jira-issue-updated for LS-1234 (In Progress → In Review)',
  );
});

describe('handler — health check', () => {
  it('returns 200 for GET /github-webhook/health', async () => {
    const result = await handler(
      makeEvent({ httpMethod: 'GET', path: '/github-webhook/health' }),
    );
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ status: 'ok' });
  });
});

describe('handler — method check', () => {
  it('returns 405 for non-POST, non-GET-health requests', async () => {
    const result = await handler(makeEvent({ httpMethod: 'DELETE' }));
    expect(result.statusCode).toBe(405);
  });
});

describe('handler — signature verification', () => {
  it('returns 401 when X-Hub-Signature-256 header is missing', async () => {
    const result = await handler(
      makeEvent({ headers: { 'X-GitHub-Event': 'push' } }),
    );
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 when signature is invalid', async () => {
    mockVerify.mockReturnValue(false);
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(401);
  });
});

describe('handler — event routing', () => {
  it('returns 200 ignored for non-pull_request_review_thread events', async () => {
    const result = await handler(
      makeEvent({
        headers: {
          'X-Hub-Signature-256': 'sha256=abc',
          'X-GitHub-Event': 'push',
        },
      }),
    );
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({
      status: 'ignored',
      eventType: 'push',
    });
    expect(mockHandle).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const result = await handler(makeEvent({ body: 'not-json' }));
    expect(result.statusCode).toBe(400);
  });

  it('returns 200 and calls handler for pull_request_review_thread events', async () => {
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(mockHandle).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.body)).toMatchObject({ status: 'ok' });
  });

  it('returns 500 with generic message when handler throws', async () => {
    mockHandle.mockRejectedValue(new Error('GitHub API unreachable'));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'Internal server error' });
  });

  it('decodes base64-encoded bodies', async () => {
    const jsonBody = JSON.stringify({ action: 'resolved' });
    const b64 = Buffer.from(jsonBody).toString('base64');
    const result = await handler(
      makeEvent({ body: b64, isBase64Encoded: true }),
    );
    // Signature still passes because mockVerify always returns true
    expect(result.statusCode).toBe(200);
  });
});

describe('handler — Jira webhook route (/github-webhook/jira)', () => {
  it('returns 401 when X-Jira-Webhook-Secret header is missing', async () => {
    const result = await handler(makeJiraEvent({ headers: {} }));
    expect(result.statusCode).toBe(401);
    expect(mockHandleJira).not.toHaveBeenCalled();
  });

  it('returns 401 when Jira secret is invalid', async () => {
    mockVerifyJira.mockReturnValue(false);
    const result = await handler(makeJiraEvent());
    expect(result.statusCode).toBe(401);
    expect(mockHandleJira).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const result = await handler(makeJiraEvent({ body: 'not-json' }));
    expect(result.statusCode).toBe(400);
    expect(mockHandleJira).not.toHaveBeenCalled();
  });

  it('returns 200 and calls handler for valid Jira transition event', async () => {
    const result = await handler(makeJiraEvent());
    expect(result.statusCode).toBe(200);
    expect(mockHandleJira).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.body)).toMatchObject({ status: 'ok' });
  });

  it('returns 500 with generic message when handler throws', async () => {
    mockHandleJira.mockRejectedValue(new Error('GitHub dispatch unreachable'));
    const result = await handler(makeJiraEvent());
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'Internal server error' });
  });

  it('accepts lowercase x-jira-webhook-secret header', async () => {
    const result = await handler(
      makeJiraEvent({
        headers: { 'x-jira-webhook-secret': 'test-jira-secret' },
      }),
    );
    expect(result.statusCode).toBe(200);
  });
});
