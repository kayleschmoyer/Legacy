import { handlePullRequestReviewEvent } from './handle-pull-request-review';
import * as githubApp from './github-app';

jest.mock('./github-app');

const mockGetInstallationToken = githubApp.getInstallationToken as jest.Mock;
const mockGetPrReviewThreads = githubApp.getPrReviewThreads as jest.Mock;
const mockGetPrReviews = githubApp.getPrReviews as jest.Mock;
const mockCreateCheckRun = githubApp.createCheckRun as jest.Mock;
const mockAddLabel = githubApp.addLabel as jest.Mock;

const SAME_REPO = { full_name: 'bkrupa/legacy-sports' };

const BASE_PAYLOAD = {
  action: 'submitted',
  review: {
    state: 'APPROVED',
    body: 'Looks good!',
    user: { login: 'copilot-pull-request-reviewer[bot]' },
  },
  pull_request: {
    number: 42,
    draft: false,
    head: { sha: 'abc1234', repo: SAME_REPO },
    base: { repo: SAME_REPO },
  },
  repository: { name: 'legacy-sports', owner: { login: 'bkrupa' } },
  installation: { id: 99 },
};

const COPILOT_APPROVED_REVIEW = {
  state: 'APPROVED',
  body: null,
  userLogin: 'copilot-pull-request-reviewer[bot]',
  submittedAt: '2024-01-01T00:00:00Z',
  commitId: 'abc1234',
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
  mockGetInstallationToken.mockResolvedValue('tok-test');
  mockGetPrReviewThreads.mockResolvedValue([]);
  mockGetPrReviews.mockResolvedValue([COPILOT_APPROVED_REVIEW]);
  mockCreateCheckRun.mockResolvedValue(undefined);
  mockAddLabel.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('handlePullRequestReviewEvent — ignored cases', () => {
  it('ignores non-submitted actions', async () => {
    const result = await handlePullRequestReviewEvent(
      { ...BASE_PAYLOAD, action: 'dismissed' },
      'pk',
    );
    expect(result).toMatch(/Ignored.*dismissed/);
    expect(mockGetInstallationToken).not.toHaveBeenCalled();
  });

  it('ignores draft PRs', async () => {
    const result = await handlePullRequestReviewEvent(
      {
        ...BASE_PAYLOAD,
        pull_request: { ...BASE_PAYLOAD.pull_request, draft: true },
      },
      'pk',
    );
    expect(result).toMatch(/draft/);
    expect(mockGetInstallationToken).not.toHaveBeenCalled();
  });

  it('ignores fork PRs', async () => {
    const result = await handlePullRequestReviewEvent(
      {
        ...BASE_PAYLOAD,
        pull_request: {
          ...BASE_PAYLOAD.pull_request,
          head: {
            sha: 'abc',
            repo: { full_name: 'fork-user/legacy-sports' },
          },
        },
      },
      'pk',
    );
    expect(result).toMatch(/fork PR/);
    expect(mockGetInstallationToken).not.toHaveBeenCalled();
  });

  it('ignores missing installation.id', async () => {
    const result = await handlePullRequestReviewEvent(
      { ...BASE_PAYLOAD, installation: undefined },
      'pk',
    );
    expect(result).toMatch(/missing installation\.id/);
    expect(mockGetInstallationToken).not.toHaveBeenCalled();
  });
});

describe('handlePullRequestReviewEvent — Copilot APPROVED', () => {
  it('sets success when no threads remain', async () => {
    mockGetPrReviewThreads.mockResolvedValue([]);
    const result = await handlePullRequestReviewEvent(BASE_PAYLOAD, 'pk');
    expect(result).toMatch(/success/);
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
  });

  it('sets failure when non-Copilot threads remain after Copilot approval', async () => {
    mockGetPrReviewThreads.mockResolvedValue([
      { isResolved: false, isOutdated: false, authorLogin: 'human-reviewer' },
    ]);
    const result = await handlePullRequestReviewEvent(BASE_PAYLOAD, 'pk');
    expect(result).toMatch(/failure/);
    expect(mockCreateCheckRun).toHaveBeenCalledWith(
      'tok-test',
      'bkrupa',
      'legacy-sports',
      expect.objectContaining({ conclusion: 'failure' }),
    );
  });

  it('ignores Copilot threads when Copilot approved', async () => {
    mockGetPrReviewThreads.mockResolvedValue([
      {
        isResolved: false,
        isOutdated: false,
        authorLogin: 'copilot-pull-request-reviewer[bot]',
      },
    ]);
    const result = await handlePullRequestReviewEvent(BASE_PAYLOAD, 'pk');
    expect(result).toMatch(/success/);
  });
});

describe('handlePullRequestReviewEvent — Copilot COMMENTED', () => {
  const commentedPayload = {
    ...BASE_PAYLOAD,
    review: {
      state: 'CHANGES_REQUESTED',
      body: 'Please fix these issues.',
      user: { login: 'copilot-pull-request-reviewer[bot]' },
    },
  };

  it('sets failure immediately without fetching threads', async () => {
    const result = await handlePullRequestReviewEvent(commentedPayload, 'pk');
    expect(result).toMatch(/failure/);
    expect(mockCreateCheckRun).toHaveBeenCalledWith(
      'tok-test',
      'bkrupa',
      'legacy-sports',
      expect.objectContaining({ conclusion: 'failure' }),
    );
    expect(mockGetPrReviewThreads).not.toHaveBeenCalled();
  });
});

describe("handlePullRequestReviewEvent — Copilot couldn't review files", () => {
  it('treats as cleared when body includes sentinel phrase', async () => {
    mockGetPrReviewThreads.mockResolvedValue([]);
    const result = await handlePullRequestReviewEvent(
      {
        ...BASE_PAYLOAD,
        review: {
          state: 'COMMENTED',
          body: "I wasn't able to review any files in this PR.",
          user: { login: 'copilot-pull-request-reviewer[bot]' },
        },
      },
      'pk',
    );
    expect(result).toMatch(/success/);
  });
});

describe('handlePullRequestReviewEvent — non-Copilot review', () => {
  const humanPayload = {
    ...BASE_PAYLOAD,
    review: {
      state: 'APPROVED',
      body: 'LGTM',
      user: { login: 'human-reviewer' },
    },
  };

  it('sets success when all threads resolved and Copilot has reviewed', async () => {
    mockGetPrReviewThreads.mockResolvedValue([]);
    const promise = handlePullRequestReviewEvent(humanPayload, 'pk');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result).toMatch(/success/);
    expect(mockAddLabel).toHaveBeenCalled();
  });

  it('sets failure when unresolved threads remain', async () => {
    mockGetPrReviewThreads.mockResolvedValue([
      { isResolved: false, isOutdated: false, authorLogin: 'human-reviewer' },
    ]);
    const promise = handlePullRequestReviewEvent(humanPayload, 'pk');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result).toMatch(/failure/);
  });

  it('skips setting check when no Copilot review exists yet', async () => {
    mockGetPrReviews.mockResolvedValue([]);
    mockGetPrReviewThreads.mockResolvedValue([]);
    const promise = handlePullRequestReviewEvent(humanPayload, 'pk');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result).toMatch(/no-copilot-review/);
    expect(mockCreateCheckRun).not.toHaveBeenCalled();
  });
});
