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
}));

jest.mock('./handle-jira-transition', () => ({
  handleJiraTransitionEvent: jest
    .fn()
    .mockResolvedValue(
      'Dispatched jira-issue-updated for LS-1234 (In Progress → In Review)',
    ),
}));

// Set env vars before importing handler
process.env['JIRA_WEBHOOK_SECRET_SECRET_NAME'] = 'test-jira-secret';
process.env['AGENT_AUTHOR_APP_PRIVATE_KEY_SECRET_NAME'] =
  'test-agent-author-key';
process.env['AGENT_AUTHOR_APP_ID'] = '3142924';
process.env['GITHUB_REPO'] = 'bkrupa/legacy-sports';

import { verifyGitHubSignature } from './verify-signature';
import { handleJiraTransitionEvent } from './handle-jira-transition';
import { handler } from './index';

const mockVerify = verifyGitHubSignature as jest.Mock;
const mockHandleJira = handleJiraTransitionEvent as jest.Mock;

function makeEvent(
  overrides: Partial<APIGatewayProxyEvent> = {},
): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/github-webhook/jira',
    headers: { 'X-Hub-Signature': 'sha256=abc123' },
    body: JSON.stringify({
      webhookEvent: 'jira:issue_updated',
      issue: { key: 'LS-1234' },
      changelog: {
        items: [
          { field: 'status', fromString: 'In Progress', toString: 'In Review' },
        ],
      },
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

beforeEach(() => {
  mockVerify.mockReturnValue(true);
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

describe('handler — unrecognised POST path', () => {
  it('returns 200/ignored for non-/jira POST paths (avoids GitHub webhook retry noise)', async () => {
    const result = await handler(
      makeEvent({ path: '/github-webhook/unknown' }),
    );
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ status: 'ignored' });
  });
});

describe('handler — Jira webhook route (/github-webhook/jira)', () => {
  it('returns 401 when X-Hub-Signature header is missing', async () => {
    const result = await handler(makeEvent({ headers: {} }));
    expect(result.statusCode).toBe(401);
    expect(mockHandleJira).not.toHaveBeenCalled();
  });

  it('returns 401 when HMAC signature is invalid', async () => {
    mockVerify.mockReturnValueOnce(false);
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(401);
    expect(mockHandleJira).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const result = await handler(makeEvent({ body: 'not-json' }));
    expect(result.statusCode).toBe(400);
    expect(mockHandleJira).not.toHaveBeenCalled();
  });

  it('returns 200 and calls handler for valid Jira transition event', async () => {
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(mockHandleJira).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.body)).toMatchObject({ status: 'ok' });
  });

  it('returns 500 with generic message when handler throws', async () => {
    mockHandleJira.mockRejectedValue(new Error('GitHub dispatch unreachable'));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'Internal server error' });
  });

  it('accepts lowercase x-hub-signature header', async () => {
    const result = await handler(
      makeEvent({
        headers: { 'x-hub-signature': 'sha256=abc123' },
      }),
    );
    expect(result.statusCode).toBe(200);
  });

  it('decodes base64-encoded bodies', async () => {
    const jsonBody = JSON.stringify({
      webhookEvent: 'jira:issue_updated',
      issue: { key: 'LS-1234' },
      changelog: {
        items: [
          { field: 'status', fromString: 'To Do', toString: 'In Progress' },
        ],
      },
    });
    const b64 = Buffer.from(jsonBody).toString('base64');
    const result = await handler(
      makeEvent({ body: b64, isBase64Encoded: true }),
    );
    expect(result.statusCode).toBe(200);
  });
});
