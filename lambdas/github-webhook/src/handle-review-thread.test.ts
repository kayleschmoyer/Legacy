import { handleReviewThreadEvent } from './handle-review-thread';
import * as githubApp from './github-app';

jest.mock('./github-app');

const mockGetInstallationToken = githubApp.getInstallationToken as jest.Mock;
const mockGetPrReviewThreads = githubApp.getPrReviewThreads as jest.Mock;
const mockCreateCheckRun = githubApp.createCheckRun as jest.Mock;

const BASE_PAYLOAD = {
  pull_request: { number: 42, head: { sha: 'abc1234' } },
  repository: { name: 'legacy-sports', owner: { login: 'bkrupa' } },
  installation: { id: 99 },
};

beforeEach(() => {
  jest.resetAllMocks();
  mockGetInstallationToken.mockResolvedValue('tok-test');
  mockCreateCheckRun.mockResolvedValue(undefined);
});

describe('handleReviewThreadEvent — ignored actions', () => {
  it('returns early for unknown actions without touching GitHub', async () => {
    const result = await handleReviewThreadEvent(
      { ...BASE_PAYLOAD, action: 'created' },
      'private-key',
    );
    expect(result).toMatch(/Ignored action="created"/);
    expect(mockGetInstallationToken).not.toHaveBeenCalled();
    expect(mockCreateCheckRun).not.toHaveBeenCalled();
  });
});

describe('handleReviewThreadEvent — missing installation', () => {
  it('warns and returns ignored result when installation.id is absent', async () => {
    const payload = {
      ...BASE_PAYLOAD,
      action: 'resolved',
      installation: undefined,
    };
    const result = await handleReviewThreadEvent(payload, 'private-key');
    expect(result).toMatch(/missing installation\.id/);
    expect(mockGetInstallationToken).not.toHaveBeenCalled();
    expect(mockCreateCheckRun).not.toHaveBeenCalled();
  });
});

describe('handleReviewThreadEvent — resolved action', () => {
  it('sets bot-review=success when no unresolved Copilot threads remain', async () => {
    mockGetPrReviewThreads.mockResolvedValue([
      {
        isResolved: true,
        isOutdated: false,
        authorLogin: 'copilot-pull-request-reviewer',
      },
      {
        isResolved: false,
        isOutdated: true,
        authorLogin: 'copilot-pull-request-reviewer',
      },
    ]);

    const result = await handleReviewThreadEvent(
      { ...BASE_PAYLOAD, action: 'resolved' },
      'private-key',
    );

    expect(mockGetInstallationToken).toHaveBeenCalledWith(
      3142924,
      'private-key',
      99,
    );
    expect(mockCreateCheckRun).toHaveBeenCalledWith(
      'tok-test',
      'bkrupa',
      'legacy-sports',
      expect.objectContaining({ conclusion: 'success', name: 'bot-review' }),
    );
    expect(result).toMatch(/bot-review=success/);
  });

  it('sets bot-review=failure when unresolved Copilot threads remain', async () => {
    mockGetPrReviewThreads.mockResolvedValue([
      {
        isResolved: false,
        isOutdated: false,
        authorLogin: 'copilot-pull-request-reviewer',
      },
    ]);

    const result = await handleReviewThreadEvent(
      { ...BASE_PAYLOAD, action: 'resolved' },
      'private-key',
    );

    expect(mockCreateCheckRun).toHaveBeenCalledWith(
      'tok-test',
      'bkrupa',
      'legacy-sports',
      expect.objectContaining({ conclusion: 'failure', name: 'bot-review' }),
    );
    expect(result).toMatch(/bot-review=failure/);
  });

  it('ignores threads by non-Copilot authors', async () => {
    mockGetPrReviewThreads.mockResolvedValue([
      { isResolved: false, isOutdated: false, authorLogin: 'human-reviewer' },
    ]);

    await handleReviewThreadEvent(
      { ...BASE_PAYLOAD, action: 'resolved' },
      'private-key',
    );

    expect(mockCreateCheckRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ conclusion: 'success' }),
    );
  });
});

describe('handleReviewThreadEvent — unresolved action', () => {
  it('sets bot-review=failure immediately when a thread is re-opened', async () => {
    mockGetPrReviewThreads.mockResolvedValue([
      {
        isResolved: false,
        isOutdated: false,
        authorLogin: 'copilot-pull-request-reviewer',
      },
      {
        isResolved: true,
        isOutdated: false,
        authorLogin: 'copilot-pull-request-reviewer',
      },
    ]);

    const result = await handleReviewThreadEvent(
      { ...BASE_PAYLOAD, action: 'unresolved' },
      'private-key',
    );

    expect(mockCreateCheckRun).toHaveBeenCalledWith(
      'tok-test',
      'bkrupa',
      'legacy-sports',
      expect.objectContaining({ conclusion: 'failure', name: 'bot-review' }),
    );
    expect(result).toMatch(/bot-review=failure/);
  });

  it('sets bot-review=success when the re-opened thread is outdated', async () => {
    mockGetPrReviewThreads.mockResolvedValue([
      {
        isResolved: false,
        isOutdated: true,
        authorLogin: 'copilot-pull-request-reviewer',
      },
    ]);

    const result = await handleReviewThreadEvent(
      { ...BASE_PAYLOAD, action: 'unresolved' },
      'private-key',
    );

    expect(mockCreateCheckRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ conclusion: 'success' }),
    );
    expect(result).toMatch(/bot-review=success/);
  });
});
