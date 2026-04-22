import { handleReviewThreadEvent } from './handle-review-thread';
import * as githubApp from './github-app';

jest.mock('./github-app');

const mockGetInstallationToken = githubApp.getInstallationToken as jest.Mock;
const mockGetPrReviewThreads = githubApp.getPrReviewThreads as jest.Mock;
const mockGetPrReviews = githubApp.getPrReviews as jest.Mock;
const mockCreateCheckRun = githubApp.createCheckRun as jest.Mock;
const mockAddLabel = githubApp.addLabel as jest.Mock;

const BASE_PAYLOAD = {
  pull_request: { number: 42, head: { sha: 'abc1234' } },
  repository: { name: 'legacy-sports', owner: { login: 'bkrupa' } },
  installation: { id: 99 },
};

/** Copilot COMMENTED review — threads are active */
const COPILOT_COMMENTED_REVIEW = {
  state: 'CHANGES_REQUESTED',
  body: 'Please address the following.',
  userLogin: 'copilot-pull-request-reviewer[bot]',
  submittedAt: '2024-01-01T00:00:00Z',
  commitId: 'abc1234', // must match BASE_PAYLOAD.pull_request.head.sha
};

/** Copilot APPROVED review — threads are superseded */
const COPILOT_APPROVED_REVIEW = {
  state: 'APPROVED',
  body: 'Looks good!',
  userLogin: 'copilot-pull-request-reviewer[bot]',
  submittedAt: '2024-01-02T00:00:00Z',
  commitId: 'abc1234', // must match BASE_PAYLOAD.pull_request.head.sha
};

beforeEach(() => {
  jest.resetAllMocks();
  mockGetInstallationToken.mockResolvedValue('tok-test');
  mockGetPrReviews.mockResolvedValue([]);
  mockCreateCheckRun.mockResolvedValue(undefined);
  mockAddLabel.mockResolvedValue(undefined);
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
  it('sets bot-review=success when no unresolved threads remain', async () => {
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
    expect(mockAddLabel).toHaveBeenCalledWith(
      'tok-test',
      'bkrupa',
      'legacy-sports',
      42,
      'merge-when-ready',
    );
    expect(result).toMatch(/bot-review=success/);
  });

  it('sets bot-review=failure when unresolved threads remain', async () => {
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

  it('sets bot-review=failure for unresolved threads by non-Copilot authors', async () => {
    mockGetPrReviewThreads.mockResolvedValue([
      { isResolved: false, isOutdated: false, authorLogin: 'human-reviewer' },
    ]);

    const result = await handleReviewThreadEvent(
      { ...BASE_PAYLOAD, action: 'resolved' },
      'private-key',
    );

    expect(mockCreateCheckRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ conclusion: 'failure' }),
    );
    expect(result).toMatch(/bot-review=failure/);
  });

  it('sets bot-review=success when only outdated non-Copilot threads remain', async () => {
    mockGetPrReviewThreads.mockResolvedValue([
      { isResolved: false, isOutdated: true, authorLogin: 'human-reviewer' },
    ]);

    const result = await handleReviewThreadEvent(
      { ...BASE_PAYLOAD, action: 'resolved' },
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

describe('handleReviewThreadEvent — copilotCleared bypass', () => {
  it('ignores unresolved Copilot threads when Copilot APPROVED', async () => {
    mockGetPrReviewThreads.mockResolvedValue([
      {
        isResolved: false,
        isOutdated: false,
        authorLogin: 'copilot-pull-request-reviewer',
      },
    ]);
    mockGetPrReviews.mockResolvedValue([COPILOT_APPROVED_REVIEW]);

    const result = await handleReviewThreadEvent(
      { ...BASE_PAYLOAD, action: 'resolved' },
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

  it('still blocks on unresolved human threads when Copilot APPROVED', async () => {
    mockGetPrReviewThreads.mockResolvedValue([
      { isResolved: false, isOutdated: false, authorLogin: 'human-reviewer' },
    ]);
    mockGetPrReviews.mockResolvedValue([COPILOT_APPROVED_REVIEW]);

    const result = await handleReviewThreadEvent(
      { ...BASE_PAYLOAD, action: 'resolved' },
      'private-key',
    );

    expect(mockCreateCheckRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ conclusion: 'failure' }),
    );
    expect(result).toMatch(/bot-review=failure/);
  });

  it("ignores unresolved Copilot threads when Copilot couldn't review files", async () => {
    mockGetPrReviewThreads.mockResolvedValue([
      {
        isResolved: false,
        isOutdated: false,
        authorLogin: 'copilot-pull-request-reviewer[bot]',
      },
    ]);
    mockGetPrReviews.mockResolvedValue([
      {
        ...COPILOT_COMMENTED_REVIEW,
        body: "I wasn't able to review any files in this pull request.",
        commitId: 'abc1234',
      },
    ]);

    const result = await handleReviewThreadEvent(
      { ...BASE_PAYLOAD, action: 'resolved' },
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

  it('does NOT apply copilotCleared when latest Copilot review is CHANGES_REQUESTED', async () => {
    mockGetPrReviewThreads.mockResolvedValue([
      {
        isResolved: false,
        isOutdated: false,
        authorLogin: 'copilot-pull-request-reviewer',
      },
    ]);
    mockGetPrReviews.mockResolvedValue([COPILOT_COMMENTED_REVIEW]);

    const result = await handleReviewThreadEvent(
      { ...BASE_PAYLOAD, action: 'resolved' },
      'private-key',
    );

    expect(mockCreateCheckRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ conclusion: 'failure' }),
    );
    expect(result).toMatch(/bot-review=failure/);
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
