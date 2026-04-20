import { handleJiraTransitionEvent } from './handle-jira-transition';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock getRepoInstallationToken so tests don't need a real RSA key or multi-step
// JWT → installation → access-token flow.
jest.mock('./github-app', () => ({
  getRepoInstallationToken: jest
    .fn()
    .mockResolvedValue('ghs_installation_token'),
  REQUEST_TIMEOUT_MS: 15_000,
}));

const APP_PRIVATE_KEY =
  '-----BEGIN RSA PRIVATE KEY-----\nMOCK\n-----END RSA PRIVATE KEY-----';
const APP_ID = 3142924;
const GITHUB_REPO = 'bkrupa/legacy-sports';

const statusTransitionPayload = {
  webhookEvent: 'jira:issue_updated',
  issue: { key: 'LS-1234' },
  changelog: {
    items: [
      { field: 'status', fromString: 'In Progress', toString: 'In Review' },
    ],
  },
};

// Capture fetch calls
let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 204 });
  global.fetch = fetchMock;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('handleJiraTransitionEvent', () => {
  it('dispatches jira-issue-updated for a status change', async () => {
    const result = await handleJiraTransitionEvent(
      statusTransitionPayload,
      APP_PRIVATE_KEY,
      APP_ID,
      GITHUB_REPO,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.github.com/repos/bkrupa/legacy-sports/dispatches',
    );
    expect(init.method).toBe('POST');
    // Should use the installation token returned by getRepoInstallationToken
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer ghs_installation_token',
    );

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.event_type).toBe('jira-issue-updated');
    expect(body.client_payload).toEqual({
      issue_key: 'LS-1234',
      from_status: 'In Progress',
      to_status: 'In Review',
    });

    expect(result).toContain('LS-1234');
    expect(result).toContain('In Progress → In Review');
  });

  it('ignores non-issue_updated webhookEvents', async () => {
    const result = await handleJiraTransitionEvent(
      { webhookEvent: 'jira:issue_created', issue: { key: 'LS-1234' } },
      APP_PRIVATE_KEY,
      APP_ID,
      GITHUB_REPO,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toContain('Ignored');
  });

  it('ignores issue_updated events without a status change', async () => {
    const result = await handleJiraTransitionEvent(
      {
        webhookEvent: 'jira:issue_updated',
        issue: { key: 'LS-1234' },
        changelog: {
          items: [
            {
              field: 'summary',
              fromString: 'Old title',
              toString: 'New title',
            },
          ],
        },
      },
      APP_PRIVATE_KEY,
      APP_ID,
      GITHUB_REPO,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toContain('no status change');
  });

  it('ignores payload with missing issue key', async () => {
    const result = await handleJiraTransitionEvent(
      { webhookEvent: 'jira:issue_updated' },
      APP_PRIVATE_KEY,
      APP_ID,
      GITHUB_REPO,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toContain('missing issue key');
  });

  it('throws when GitHub dispatch returns a non-ok status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: jest.fn().mockResolvedValue('Unprocessable Entity'),
    });

    await expect(
      handleJiraTransitionEvent(
        statusTransitionPayload,
        APP_PRIVATE_KEY,
        APP_ID,
        GITHUB_REPO,
      ),
    ).rejects.toThrow('HTTP 422');
  });

  it('throws on invalid GITHUB_REPO format', async () => {
    await expect(
      handleJiraTransitionEvent(
        statusTransitionPayload,
        APP_PRIVATE_KEY,
        APP_ID,
        'not-a-valid-repo',
      ),
    ).rejects.toThrow('Invalid GITHUB_REPO format');
  });

  it('uses "unknown" for null fromString/toString in changelog', async () => {
    const result = await handleJiraTransitionEvent(
      {
        webhookEvent: 'jira:issue_updated',
        issue: { key: 'LS-999' },
        changelog: {
          items: [{ field: 'status', fromString: null, toString: null }],
        },
      },
      APP_PRIVATE_KEY,
      APP_ID,
      GITHUB_REPO,
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.client_payload).toEqual({
      issue_key: 'LS-999',
      from_status: 'unknown',
      to_status: 'unknown',
    });
    expect(result).toContain('LS-999');
  });
});
