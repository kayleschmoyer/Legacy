import { handlePullRequestEvent } from './handle-pull-request';
import * as githubApp from './github-app';
import * as sqsClient from './sqs-client';

jest.mock('./github-app');
jest.mock('./sqs-client', () => ({
  enqueueRaceCheck: jest.fn(),
  RACE_CHECK_DELAY_SECONDS: 90,
  MAX_RACE_CHECK_ATTEMPTS: 3,
}));

const mockGetInstallationToken = githubApp.getInstallationToken as jest.Mock;
const mockGetRepoInstallationToken =
  githubApp.getRepoInstallationToken as jest.Mock;
const mockGetPrReviews = githubApp.getPrReviews as jest.Mock;
const mockCreateCheckRun = githubApp.createCheckRun as jest.Mock;
const mockRequestCopilotReview = githubApp.requestCopilotReview as jest.Mock;
const mockAddLabel = githubApp.addLabel as jest.Mock;
const mockEnqueueRaceCheck = sqsClient.enqueueRaceCheck as jest.Mock;

const SAME_REPO = {
  full_name: 'bkrupa/legacy-sports',
};

const BASE_PR = {
  number: 42,
  draft: false,
  head: { sha: 'abc1234', repo: SAME_REPO },
  base: { repo: SAME_REPO },
  user: { login: 'human-dev' },
};

const BASE_PAYLOAD = {
  pull_request: BASE_PR,
  repository: { name: 'legacy-sports', owner: { login: 'bkrupa' } },
  installation: { id: 99 },
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
  mockGetInstallationToken.mockResolvedValue('tok-test');
  mockGetRepoInstallationToken.mockResolvedValue('tok-test');
  mockGetPrReviews.mockResolvedValue([]);
  mockCreateCheckRun.mockResolvedValue(undefined);
  mockRequestCopilotReview.mockResolvedValue({ added: true });
  mockAddLabel.mockResolvedValue(undefined);
  mockEnqueueRaceCheck.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('handlePullRequestEvent — ignored cases', () => {
  it('ignores unknown actions', async () => {
    const result = await handlePullRequestEvent(
      { ...BASE_PAYLOAD, action: 'closed' },
      'pk',
    );
    expect(result).toMatch(/Ignored pull_request action="closed"/);
    expect(mockRequestCopilotReview).not.toHaveBeenCalled();
  });

  it('falls back to repo installation lookup when installation.id is missing', async () => {
    const result = await handlePullRequestEvent(
      { ...BASE_PAYLOAD, action: 'opened', installation: undefined },
      'pk',
    );
    expect(result).toMatch(/Requested Copilot review/);
    expect(mockGetInstallationToken).not.toHaveBeenCalled();
    expect(mockGetRepoInstallationToken).toHaveBeenCalledWith(
      3142924,
      'pk',
      'bkrupa',
      'legacy-sports',
    );
  });

  it('ignores fork PRs', async () => {
    const forkPr = {
      ...BASE_PR,
      head: { sha: 'abc', repo: { full_name: 'fork-user/legacy-sports' } },
    };
    const result = await handlePullRequestEvent(
      { ...BASE_PAYLOAD, action: 'opened', pull_request: forkPr },
      'pk',
    );
    expect(result).toMatch(/fork PR/);
    expect(mockGetInstallationToken).not.toHaveBeenCalled();
  });

  it('ignores draft PRs on opened', async () => {
    const draftPr = { ...BASE_PR, draft: true };
    const result = await handlePullRequestEvent(
      { ...BASE_PAYLOAD, action: 'opened', pull_request: draftPr },
      'pk',
    );
    expect(result).toMatch(/draft PR/);
    expect(mockRequestCopilotReview).not.toHaveBeenCalled();
  });
});

describe('handlePullRequestEvent — bot-authored PRs', () => {
  it.each(['dependabot[bot]', 'legacy-sports-code-bot[bot]'])(
    'auto-passes bot-review for %s',
    async (login) => {
      const botPr = { ...BASE_PR, user: { login } };
      const result = await handlePullRequestEvent(
        { ...BASE_PAYLOAD, action: 'opened', pull_request: botPr },
        'pk',
      );
      expect(result).toMatch(/Auto-passed/);
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
      expect(mockRequestCopilotReview).not.toHaveBeenCalled();
    },
  );
});

describe('handlePullRequestEvent — normal PR lifecycle', () => {
  it.each(['opened', 'synchronize', 'reopened', 'ready_for_review'])(
    'requests Copilot review on %s (no in_progress check run)',
    async (action) => {
      const result = await handlePullRequestEvent(
        { ...BASE_PAYLOAD, action },
        'pk',
      );
      expect(result).toMatch(/Requested Copilot review/);
      expect(mockRequestCopilotReview).toHaveBeenCalledWith(
        'tok-test',
        'bkrupa',
        'legacy-sports',
        42,
      );
      expect(mockCreateCheckRun).not.toHaveBeenCalled();
    },
  );

  it.each(['opened', 'synchronize', 'reopened', 'ready_for_review'])(
    'enqueues race-check after requesting Copilot on %s',
    async (action) => {
      await handlePullRequestEvent({ ...BASE_PAYLOAD, action }, 'pk');
      expect(mockEnqueueRaceCheck).toHaveBeenCalledWith(
        {
          type: 'race-check',
          owner: 'bkrupa',
          repo: 'legacy-sports',
          prNumber: 42,
          headSha: 'abc1234',
          attempt: 1,
        },
        90,
      );
    },
  );

  it('does not fail the webhook when enqueueRaceCheck throws', async () => {
    mockEnqueueRaceCheck.mockRejectedValue(new Error('SQS down'));
    const result = await handlePullRequestEvent(
      { ...BASE_PAYLOAD, action: 'synchronize' },
      'pk',
    );
    expect(result).toMatch(/Requested Copilot review/);
    expect(mockRequestCopilotReview).toHaveBeenCalled();
  });

  it('does not enqueue race-check for bot-authored PRs', async () => {
    const botPr = { ...BASE_PR, user: { login: 'dependabot[bot]' } };
    await handlePullRequestEvent(
      { ...BASE_PAYLOAD, action: 'opened', pull_request: botPr },
      'pk',
    );
    expect(mockEnqueueRaceCheck).not.toHaveBeenCalled();
  });

  it('does not enqueue race-check on review_request_removed', async () => {
    const promise = handlePullRequestEvent(
      {
        ...BASE_PAYLOAD,
        action: 'review_request_removed',
        requested_reviewer: { login: 'copilot-pull-request-reviewer[bot]' },
      },
      'pk',
    );
    await jest.runAllTimersAsync();
    await promise;
    expect(mockEnqueueRaceCheck).not.toHaveBeenCalled();
  });
});

describe('handlePullRequestEvent — review_request_removed', () => {
  function makeRemovedPayload(removedLogin: string) {
    return {
      ...BASE_PAYLOAD,
      action: 'review_request_removed',
      requested_reviewer: { login: removedLogin },
    };
  }

  it('ignores removal of non-Copilot reviewer', async () => {
    const result = await handlePullRequestEvent(
      makeRemovedPayload('human-reviewer'),
      'pk',
    );
    expect(result).toMatch(/non-Copilot reviewer/);
    expect(mockGetPrReviews).not.toHaveBeenCalled();
  });

  it('sets clean pass when Copilot removed without review for current SHA', async () => {
    mockGetPrReviews.mockResolvedValue([]);
    const promise = handlePullRequestEvent(
      makeRemovedPayload('copilot-pull-request-reviewer[bot]'),
      'pk',
    );
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result).toMatch(
      /bot-review=success.*Copilot removed without review/,
    );
    expect(mockCreateCheckRun).toHaveBeenCalledWith(
      'tok-test',
      'bkrupa',
      'legacy-sports',
      expect.objectContaining({ conclusion: 'success' }),
    );
    expect(mockAddLabel).toHaveBeenCalledWith(
      'tok-test',
      'bkrupa',
      'legacy-sports',
      42,
      'merge-when-ready',
    );
  });

  it('defers to pull_request_review handler when Copilot posted review for current SHA', async () => {
    mockGetPrReviews.mockResolvedValue([
      {
        state: 'COMMENTED',
        body: null,
        userLogin: 'copilot-pull-request-reviewer[bot]',
        submittedAt: '2024-01-01T00:00:00Z',
        commitId: 'abc1234',
      },
    ]);
    const promise = handlePullRequestEvent(
      makeRemovedPayload('copilot-pull-request-reviewer[bot]'),
      'pk',
    );
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result).toMatch(/pull_request_review handler/);
    expect(mockCreateCheckRun).not.toHaveBeenCalled();
  });
});
