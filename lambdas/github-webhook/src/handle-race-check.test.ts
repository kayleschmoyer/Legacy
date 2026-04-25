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
const mockEnqueue = sqsClient.enqueueRaceCheck as jest.Mock;

const HEAD_SHA = 'abc1234deadbeef';
const OTHER_SHA = 'ffeeddccbbaa9988';

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

beforeEach(() => {
  jest.resetAllMocks();
  mockGetRepoInstallationToken.mockResolvedValue('tok-test');
  mockGetPrMeta.mockResolvedValue(defaultOpenPrMeta());
  mockGetCheckRunNames.mockResolvedValue([]);
  mockGetPrReviews.mockResolvedValue([]);
  mockRequestCopilotReview.mockResolvedValue(undefined);
  mockCreateCheckRun.mockResolvedValue(undefined);
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
});
