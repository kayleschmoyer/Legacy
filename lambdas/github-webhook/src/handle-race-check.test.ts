import { handleRaceCheckMessage } from './handle-race-check';
import * as githubApp from './github-app';
import * as sqsClient from './sqs-client';
import type { RaceCheckMessage } from './sqs-client';

jest.mock('./github-app');
jest.mock('./sqs-client', () => ({
  enqueueRaceCheck: jest.fn(),
  MAX_RACE_CHECK_ATTEMPTS: 3,
  RACE_CHECK_DELAY_SECONDS: 90,
}));

const mockGetRepoInstallationToken =
  githubApp.getRepoInstallationToken as jest.Mock;
const mockGetPrMeta = githubApp.getPrMeta as jest.Mock;
const mockGetCheckRunNames = githubApp.getCheckRunNamesForRef as jest.Mock;
const mockGetPrReviews = githubApp.getPrReviews as jest.Mock;
const mockRequestCopilotReview = githubApp.requestCopilotReview as jest.Mock;
const mockCreateCheckRun = githubApp.createCheckRun as jest.Mock;
const mockGetCommitTreeSha = githubApp.getCommitTreeSha as jest.Mock;
const mockGetPrReviewThreads = githubApp.getPrReviewThreads as jest.Mock;
const mockEnqueue = sqsClient.enqueueRaceCheck as jest.Mock;

const HEAD_SHA = 'abc1234deadbeef';
const OTHER_SHA = 'ffeeddccbbaa9988';
const PRIOR_SHA = '1111222233334444';

function makeMessage(
  overrides: Partial<RaceCheckMessage> = {},
): RaceCheckMessage {
  return {
    type: 'race-check',
    owner: 'bkrupa',
    repo: 'legacy-sports',
    prNumber: 42,
    headSha: HEAD_SHA,
    attempt: 1,
    ...overrides,
  };
}

function defaultOpenPrMeta(overrides = {}) {
  return {
    state: 'open',
    headSha: HEAD_SHA,
    draft: false,
    requestedReviewerLogins: [],
    ...overrides,
  };
}

function copilotReview(overrides = {}) {
  return {
    state: 'COMMENTED',
    body: '',
    userLogin: 'copilot-pull-request-reviewer[bot]',
    submittedAt: '2026-04-26T16:00:00Z',
    commitId: PRIOR_SHA,
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockGetRepoInstallationToken.mockResolvedValue('tok-test');
  mockGetPrMeta.mockResolvedValue(defaultOpenPrMeta());
  mockGetCheckRunNames.mockResolvedValue([]);
  mockGetPrReviews.mockResolvedValue([]);
  mockRequestCopilotReview.mockResolvedValue({ added: true });
  mockCreateCheckRun.mockResolvedValue(undefined);
  // Default: trees differ → carry-forward never triggers in fast-exit tests.
  mockGetCommitTreeSha.mockImplementation((_t, _o, _r, sha: string) =>
    Promise.resolve(`tree-of-${sha}`),
  );
  mockGetPrReviewThreads.mockResolvedValue([]);
  mockEnqueue.mockResolvedValue(undefined);
});

describe('handleRaceCheckMessage — fast-exits', () => {
  it('ignores unknown message type', async () => {
    const result = await handleRaceCheckMessage(
      { ...makeMessage(), type: 'something-else' as unknown as 'race-check' },
      'pk',
    );
    expect(result).toMatch(/Ignored unknown SQS message/);
    expect(mockGetRepoInstallationToken).not.toHaveBeenCalled();
  });

  it('drops when PR is closed', async () => {
    mockGetPrMeta.mockResolvedValue(defaultOpenPrMeta({ state: 'closed' }));
    const result = await handleRaceCheckMessage(makeMessage(), 'pk');
    expect(result).toMatch(/PR is closed — dropping/);
    expect(mockRequestCopilotReview).not.toHaveBeenCalled();
  });

  it('drops when headSha has moved', async () => {
    mockGetPrMeta.mockResolvedValue(defaultOpenPrMeta({ headSha: OTHER_SHA }));
    const result = await handleRaceCheckMessage(makeMessage(), 'pk');
    expect(result).toMatch(/headSha moved/);
    expect(mockRequestCopilotReview).not.toHaveBeenCalled();
  });

  it('drops when PR is draft', async () => {
    mockGetPrMeta.mockResolvedValue(defaultOpenPrMeta({ draft: true }));
    const result = await handleRaceCheckMessage(makeMessage(), 'pk');
    expect(result).toMatch(/draft — dropping/);
    expect(mockRequestCopilotReview).not.toHaveBeenCalled();
  });

  it('drops when bot-review check already exists for headSha', async () => {
    mockGetCheckRunNames.mockResolvedValue(['bot-review']);
    const result = await handleRaceCheckMessage(makeMessage(), 'pk');
    expect(result).toMatch(/bot-review already set/);
    expect(mockRequestCopilotReview).not.toHaveBeenCalled();
  });

  it('drops when Copilot already reviewed the current SHA', async () => {
    mockGetPrReviews.mockResolvedValue([
      {
        userLogin: 'copilot-pull-request-reviewer[bot]',
        commitId: HEAD_SHA,
        state: 'COMMENTED',
      },
    ]);
    const result = await handleRaceCheckMessage(makeMessage(), 'pk');
    expect(result).toMatch(/normal flow will finish/);
    expect(mockRequestCopilotReview).not.toHaveBeenCalled();
  });

  it('drops when Copilot is still in requested_reviewers', async () => {
    mockGetPrMeta.mockResolvedValue(
      defaultOpenPrMeta({
        requestedReviewerLogins: ['copilot-pull-request-reviewer[bot]'],
      }),
    );
    const result = await handleRaceCheckMessage(makeMessage(), 'pk');
    expect(result).toMatch(/still in requested_reviewers/);
    expect(mockRequestCopilotReview).not.toHaveBeenCalled();
  });

  it('ignores reviews for a stale SHA from Copilot (continues to detect race)', async () => {
    // Copilot reviewed an older commit but not the current head — still a race.
    mockGetPrReviews.mockResolvedValue([
      {
        userLogin: 'copilot-pull-request-reviewer[bot]',
        commitId: OTHER_SHA,
        state: 'COMMENTED',
      },
    ]);
    await handleRaceCheckMessage(makeMessage({ attempt: 1 }), 'pk');
    expect(mockRequestCopilotReview).toHaveBeenCalled();
  });
});

describe('handleRaceCheckMessage — race recovery', () => {
  it('re-requests Copilot and enqueues a retry on attempt 1', async () => {
    const result = await handleRaceCheckMessage(
      makeMessage({ attempt: 1 }),
      'pk',
    );
    expect(mockRequestCopilotReview).toHaveBeenCalledWith(
      'tok-test',
      'bkrupa',
      'legacy-sports',
      42,
    );
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'race-check',
        owner: 'bkrupa',
        repo: 'legacy-sports',
        prNumber: 42,
        headSha: HEAD_SHA,
        attempt: 2,
      }),
      90,
    );
    expect(result).toMatch(/re-requested Copilot \(attempt 1\/3\)/);
    expect(mockCreateCheckRun).not.toHaveBeenCalled();
  });

  it('increments attempt counter on retry', async () => {
    await handleRaceCheckMessage(makeMessage({ attempt: 2 }), 'pk');
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 3 }),
      90,
    );
  });

  it('writes bot-review=failure when attempts are exhausted', async () => {
    const result = await handleRaceCheckMessage(
      makeMessage({ attempt: 3 }),
      'pk',
    );
    expect(mockRequestCopilotReview).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockCreateCheckRun).toHaveBeenCalledWith(
      'tok-test',
      'bkrupa',
      'legacy-sports',
      expect.objectContaining({
        name: 'bot-review',
        headSha: HEAD_SHA,
        conclusion: 'failure',
      }),
    );
    expect(result).toMatch(/exhausted 3 attempts/);
  });

  it('annotates the result with "silently dropped" only when the re-request truly silent-dropped', async () => {
    mockRequestCopilotReview.mockResolvedValue({
      added: false,
      kind: 'silent-drop',
      reason: 'silent drop',
    });
    const result = await handleRaceCheckMessage(
      makeMessage({ attempt: 1 }),
      'pk',
    );
    expect(result).toMatch(/silently dropped/);
  });

  it('annotates the result with HTTP 422 wording for 422 responses (not silent-drop)', async () => {
    mockRequestCopilotReview.mockResolvedValue({
      added: false,
      kind: 'http-422',
      reason: 'HTTP 422: already requested',
    });
    const result = await handleRaceCheckMessage(
      makeMessage({ attempt: 1 }),
      'pk',
    );
    expect(result).toMatch(/HTTP 422/);
    expect(result).not.toMatch(/silently dropped/);
  });

  it('annotates the result with unparseable wording for unparseable responses (not silent-drop)', async () => {
    mockRequestCopilotReview.mockResolvedValue({
      added: false,
      kind: 'unparseable-response',
      reason: 'unparseable',
    });
    const result = await handleRaceCheckMessage(
      makeMessage({ attempt: 1 }),
      'pk',
    );
    expect(result).toMatch(/unparseable/);
    expect(result).not.toMatch(/silently dropped/);
  });
});

describe('handleRaceCheckMessage — diff-aware carry-forward', () => {
  // Set up a prior Copilot review on PRIOR_SHA, with the same tree as HEAD_SHA.
  // The fast-exit checks (5 = Copilot reviewed current SHA) must miss because
  // commitId !== headSha; only carry-forward should trigger.
  function setupSameTree() {
    mockGetPrReviews.mockResolvedValue([copilotReview()]);
    mockGetCommitTreeSha.mockImplementation((_t, _o, _r, sha: string) => {
      if (sha === HEAD_SHA || sha === PRIOR_SHA)
        return Promise.resolve('shared-tree');
      return Promise.resolve(`tree-of-${sha}`);
    });
  }

  it('writes bot-review=success when prior Copilot review covers an identical tree and threads are clean', async () => {
    setupSameTree();
    mockGetPrReviewThreads.mockResolvedValue([
      // Resolved Copilot thread — does not block
      {
        isResolved: true,
        isOutdated: true,
        authorLogin: 'copilot-pull-request-reviewer',
      },
    ]);

    const result = await handleRaceCheckMessage(makeMessage(), 'pk');

    expect(mockCreateCheckRun).toHaveBeenCalledWith(
      'tok-test',
      'bkrupa',
      'legacy-sports',
      expect.objectContaining({
        name: 'bot-review',
        headSha: HEAD_SHA,
        conclusion: 'success',
        title: 'Copilot review carried forward',
      }),
    );
    expect(mockRequestCopilotReview).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(result).toMatch(/carried forward bot-review=success/);
  });

  it('writes bot-review=failure when prior review covers identical tree but unresolved non-Copilot threads remain', async () => {
    setupSameTree();
    mockGetPrReviewThreads.mockResolvedValue([
      {
        isResolved: false,
        isOutdated: false,
        authorLogin: 'human-reviewer',
      },
    ]);

    const result = await handleRaceCheckMessage(makeMessage(), 'pk');

    expect(mockCreateCheckRun).toHaveBeenCalledWith(
      'tok-test',
      'bkrupa',
      'legacy-sports',
      expect.objectContaining({
        conclusion: 'failure',
        title: 'Review blocked',
      }),
    );
    expect(result).toMatch(/carried forward bot-review=failure/);
  });

  it('treats prior APPROVED review as cleared so its own unresolved threads do not block', async () => {
    mockGetPrReviews.mockResolvedValue([copilotReview({ state: 'APPROVED' })]);
    mockGetCommitTreeSha.mockImplementation((_t, _o, _r, sha: string) => {
      if (sha === HEAD_SHA || sha === PRIOR_SHA)
        return Promise.resolve('shared-tree');
      return Promise.resolve(`tree-of-${sha}`);
    });
    mockGetPrReviewThreads.mockResolvedValue([
      // Unresolved Copilot thread on a previously-cleared review — superseded.
      {
        isResolved: false,
        isOutdated: false,
        authorLogin: 'copilot-pull-request-reviewer[bot]',
      },
    ]);

    const result = await handleRaceCheckMessage(makeMessage(), 'pk');

    expect(mockCreateCheckRun).toHaveBeenCalledWith(
      'tok-test',
      'bkrupa',
      'legacy-sports',
      expect.objectContaining({ conclusion: 'success' }),
    );
    expect(result).toMatch(/carried forward bot-review=success/);
  });

  it('falls through to race recovery when no prior Copilot review has the same tree SHA', async () => {
    // Prior review exists but trees differ — carry-forward should not trigger.
    mockGetPrReviews.mockResolvedValue([copilotReview()]);
    // Default mockGetCommitTreeSha returns distinct trees per SHA.

    await handleRaceCheckMessage(makeMessage({ attempt: 1 }), 'pk');

    // Falls through to retry path (re-requests + enqueues next attempt).
    expect(mockRequestCopilotReview).toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalled();
    expect(mockCreateCheckRun).not.toHaveBeenCalled();
  });

  it('skips a prior review whose commit no longer exists (tree lookup returns null)', async () => {
    mockGetPrReviews.mockResolvedValue([copilotReview()]);
    mockGetCommitTreeSha.mockImplementation((_t, _o, _r, sha: string) => {
      if (sha === HEAD_SHA) return Promise.resolve('shared-tree');
      if (sha === PRIOR_SHA) return Promise.resolve(null); // force-pushed away
      return Promise.resolve(`tree-of-${sha}`);
    });

    await handleRaceCheckMessage(makeMessage({ attempt: 1 }), 'pk');

    // No carry-forward → race recovery
    expect(mockCreateCheckRun).not.toHaveBeenCalled();
    expect(mockRequestCopilotReview).toHaveBeenCalled();
  });

  it('does not trigger carry-forward when the head commit tree cannot be fetched', async () => {
    mockGetPrReviews.mockResolvedValue([copilotReview()]);
    mockGetCommitTreeSha.mockImplementation((_t, _o, _r, sha: string) => {
      if (sha === HEAD_SHA) return Promise.resolve(null);
      return Promise.resolve('shared-tree');
    });

    await handleRaceCheckMessage(makeMessage({ attempt: 1 }), 'pk');

    expect(mockCreateCheckRun).not.toHaveBeenCalled();
    expect(mockRequestCopilotReview).toHaveBeenCalled();
  });

  it('fetches each unique commit tree exactly once (dedup across multiple reviews of the same SHA)', async () => {
    // Two reviews on the same prior SHA + the head SHA = two unique commits.
    mockGetPrReviews.mockResolvedValue([
      copilotReview({ submittedAt: '2026-04-26T16:00:00Z' }),
      copilotReview({ submittedAt: '2026-04-26T17:00:00Z' }),
    ]);
    mockGetCommitTreeSha.mockImplementation((_t, _o, _r, sha: string) => {
      if (sha === HEAD_SHA || sha === PRIOR_SHA)
        return Promise.resolve('shared-tree');
      return Promise.resolve(`tree-of-${sha}`);
    });

    await handleRaceCheckMessage(makeMessage(), 'pk');

    // Only HEAD_SHA + PRIOR_SHA — two calls total, no per-review amplification.
    expect(mockGetCommitTreeSha).toHaveBeenCalledTimes(2);
    const calls = mockGetCommitTreeSha.mock.calls as Array<
      [string, string, string, string]
    >;
    const fetchedShas = calls.map((c) => c[3]);
    expect(new Set(fetchedShas)).toEqual(new Set([HEAD_SHA, PRIOR_SHA]));
  });
});
