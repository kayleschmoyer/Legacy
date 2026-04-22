import { handleWorkflowRunEvent } from './handle-workflow-run';
import * as githubApp from './github-app';

jest.mock('./github-app');

const mockGetInstallationToken = githubApp.getInstallationToken as jest.Mock;
const mockListPullRequestsForCommit =
  githubApp.listPullRequestsForCommit as jest.Mock;
const mockGetPrReviewThreads = githubApp.getPrReviewThreads as jest.Mock;
const mockGetPrReviews = githubApp.getPrReviews as jest.Mock;
const mockCreateCheckRun = githubApp.createCheckRun as jest.Mock;
const mockAddLabel = githubApp.addLabel as jest.Mock;

const BASE_PAYLOAD = {
  workflow_run: {
    name: 'Copilot code review',
    head_sha: 'abc1234',
    head_repository: { full_name: 'bkrupa/legacy-sports' },
  },
  repository: {
    name: 'legacy-sports',
    owner: { login: 'bkrupa' },
    full_name: 'bkrupa/legacy-sports',
  },
  installation: { id: 99 },
};

const OPEN_PR = {
  number: 42,
  state: 'open',
  headSha: 'abc1234',
  headRepoFullName: 'bkrupa/legacy-sports',
  updatedAt: '2024-01-01T00:00:00Z',
};

/** Copilot COMMENTED review — threads are active */
const COPILOT_COMMENTED_REVIEW = {
  state: 'CHANGES_REQUESTED',
  body: 'Please fix this.',
  userLogin: 'copilot-pull-request-reviewer[bot]',
  submittedAt: '2024-01-01T00:00:00Z',
  commitId: 'abc1234',
};

/** Copilot APPROVED review — threads superseded */
const COPILOT_APPROVED_REVIEW = {
  state: 'APPROVED',
  body: 'Looks good!',
  userLogin: 'copilot-pull-request-reviewer[bot]',
  submittedAt: '2024-01-02T00:00:00Z',
  commitId: 'abc1234',
};

beforeEach(() => {
  jest.resetAllMocks();
  mockGetInstallationToken.mockResolvedValue('tok-test');
  mockListPullRequestsForCommit.mockResolvedValue([OPEN_PR]);
  mockGetPrReviewThreads.mockResolvedValue([]);
  mockGetPrReviews.mockResolvedValue([COPILOT_APPROVED_REVIEW]);
  mockCreateCheckRun.mockResolvedValue(undefined);
  mockAddLabel.mockResolvedValue(undefined);
});

// ── ignored events ────────────────────────────────────────────────────────────

describe('handleWorkflowRunEvent — ignored events', () => {
  it('ignores non-completed actions', async () => {
    const result = await handleWorkflowRunEvent(
      { ...BASE_PAYLOAD, action: 'in_progress' },
      'private-key',
    );
    expect(result).toMatch(/Ignored workflow_run action="in_progress"/);
    expect(mockGetInstallationToken).not.toHaveBeenCalled();
  });

  it('ignores non-Copilot workflows', async () => {
    const result = await handleWorkflowRunEvent(
      {
        ...BASE_PAYLOAD,
        action: 'completed',
        workflow_run: {
          ...BASE_PAYLOAD.workflow_run,
          name: 'Legacy Sports CI Orchestrator',
        },
      },
      'private-key',
    );
    expect(result).toMatch(/Ignored workflow="Legacy Sports CI Orchestrator"/);
    expect(mockGetInstallationToken).not.toHaveBeenCalled();
  });

  it('ignores fork workflow_runs', async () => {
    const result = await handleWorkflowRunEvent(
      {
        ...BASE_PAYLOAD,
        action: 'completed',
        workflow_run: {
          ...BASE_PAYLOAD.workflow_run,
          head_repository: { full_name: 'fork-user/legacy-sports' },
        },
      },
      'private-key',
    );
    expect(result).toMatch(/Ignored fork workflow_run/);
    expect(mockGetInstallationToken).not.toHaveBeenCalled();
  });

  it('warns and returns when installation.id is absent', async () => {
    const result = await handleWorkflowRunEvent(
      { ...BASE_PAYLOAD, action: 'completed', installation: undefined },
      'private-key',
    );
    expect(result).toMatch(/missing installation\.id/);
    expect(mockGetInstallationToken).not.toHaveBeenCalled();
  });
});

// ── no PR / no Copilot review ─────────────────────────────────────────────────

describe('handleWorkflowRunEvent — early skips', () => {
  it('skips when no open PR is found for the commit', async () => {
    mockListPullRequestsForCommit.mockResolvedValue([]);

    const result = await handleWorkflowRunEvent(
      { ...BASE_PAYLOAD, action: 'completed' },
      'private-key',
    );
    expect(result).toMatch(/No open PR found/);
    expect(mockGetPrReviews).not.toHaveBeenCalled();
  });

  it('skips PRs that are closed or from a different repo', async () => {
    mockListPullRequestsForCommit.mockResolvedValue([
      { ...OPEN_PR, state: 'closed' },
      { ...OPEN_PR, headRepoFullName: 'other-user/legacy-sports' },
    ]);

    const result = await handleWorkflowRunEvent(
      { ...BASE_PAYLOAD, action: 'completed' },
      'private-key',
    );
    expect(result).toMatch(/No open PR found/);
  });

  it('skips when no Copilot review exists for the current SHA', async () => {
    mockGetPrReviews.mockResolvedValue([
      { ...COPILOT_APPROVED_REVIEW, commitId: 'old-sha' }, // wrong SHA
    ]);

    const result = await handleWorkflowRunEvent(
      { ...BASE_PAYLOAD, action: 'completed' },
      'private-key',
    );
    expect(result).toMatch(/No Copilot review found/);
    expect(mockCreateCheckRun).not.toHaveBeenCalled();
  });

  it('selects the newest PR when multiple open PRs share the same head SHA', async () => {
    mockListPullRequestsForCommit.mockResolvedValue([
      { ...OPEN_PR, number: 10, updatedAt: '2024-01-01T00:00:00Z' },
      { ...OPEN_PR, number: 99, updatedAt: '2024-01-03T00:00:00Z' }, // newest
      { ...OPEN_PR, number: 50, updatedAt: '2024-01-02T00:00:00Z' },
    ]);

    await handleWorkflowRunEvent(
      { ...BASE_PAYLOAD, action: 'completed' },
      'private-key',
    );

    // getPrReviewThreads and getPrReviews should be called with PR #99
    expect(mockGetPrReviewThreads).toHaveBeenCalledWith(
      'tok-test',
      'bkrupa',
      'legacy-sports',
      99,
    );
  });
});

// ── success path ──────────────────────────────────────────────────────────────

describe('handleWorkflowRunEvent — success', () => {
  it('sets bot-review=success and adds merge-when-ready when Copilot approved and no unresolved threads', async () => {
    const result = await handleWorkflowRunEvent(
      { ...BASE_PAYLOAD, action: 'completed' },
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

  it('sets success when Copilot could not review any files', async () => {
    mockGetPrReviews.mockResolvedValue([
      {
        ...COPILOT_COMMENTED_REVIEW,
        body: "I wasn't able to review any files in this pull request.",
      },
    ]);

    const result = await handleWorkflowRunEvent(
      { ...BASE_PAYLOAD, action: 'completed' },
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

  it('sets success when Copilot generated no new comments (re-review)', async () => {
    mockGetPrReviews.mockResolvedValue([
      {
        ...COPILOT_COMMENTED_REVIEW,
        body: 'Copilot generated no new comments on this re-review.',
      },
    ]);

    const result = await handleWorkflowRunEvent(
      { ...BASE_PAYLOAD, action: 'completed' },
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

  it('sets success when Copilot left a PR-overview COMMENTED review but no inline threads', async () => {
    // copilotCleared=false (COMMENTED state, no clearing phrase)
    // but no review threads were created → should succeed
    mockGetPrReviews.mockResolvedValue([COPILOT_COMMENTED_REVIEW]);
    mockGetPrReviewThreads.mockResolvedValue([]); // no threads at all

    const result = await handleWorkflowRunEvent(
      { ...BASE_PAYLOAD, action: 'completed' },
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

// ── failure path ──────────────────────────────────────────────────────────────

describe('handleWorkflowRunEvent — failure', () => {
  it('sets bot-review=failure when Copilot left unresolved inline threads', async () => {
    mockGetPrReviews.mockResolvedValue([COPILOT_COMMENTED_REVIEW]);
    mockGetPrReviewThreads.mockResolvedValue([
      {
        isResolved: false,
        isOutdated: false,
        authorLogin: 'copilot-pull-request-reviewer[bot]',
      },
    ]);

    const result = await handleWorkflowRunEvent(
      { ...BASE_PAYLOAD, action: 'completed' },
      'private-key',
    );

    expect(mockCreateCheckRun).toHaveBeenCalledWith(
      'tok-test',
      'bkrupa',
      'legacy-sports',
      expect.objectContaining({ conclusion: 'failure', name: 'bot-review' }),
    );
    expect(mockAddLabel).not.toHaveBeenCalled();
    expect(result).toMatch(/bot-review=failure/);
  });

  it('sets failure when unresolved human threads remain regardless of copilotCleared', async () => {
    mockGetPrReviewThreads.mockResolvedValue([
      { isResolved: false, isOutdated: false, authorLogin: 'human-reviewer' },
    ]);

    const result = await handleWorkflowRunEvent(
      { ...BASE_PAYLOAD, action: 'completed' },
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

  it('ignores outdated threads (does not block)', async () => {
    mockGetPrReviewThreads.mockResolvedValue([
      {
        isResolved: false,
        isOutdated: true,
        authorLogin: 'copilot-pull-request-reviewer',
      },
    ]);

    const result = await handleWorkflowRunEvent(
      { ...BASE_PAYLOAD, action: 'completed' },
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

// ── copilotCleared bypass ─────────────────────────────────────────────────────

describe('handleWorkflowRunEvent — copilotCleared bypass', () => {
  it('bypasses unresolved Copilot threads when Copilot APPROVED', async () => {
    mockGetPrReviewThreads.mockResolvedValue([
      {
        isResolved: false,
        isOutdated: false,
        authorLogin: 'copilot-pull-request-reviewer',
      },
    ]);
    // APPROVED review → copilotCleared=true → Copilot threads ignored
    mockGetPrReviews.mockResolvedValue([COPILOT_APPROVED_REVIEW]);

    const result = await handleWorkflowRunEvent(
      { ...BASE_PAYLOAD, action: 'completed' },
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

  it('still blocks on human threads when Copilot APPROVED', async () => {
    mockGetPrReviewThreads.mockResolvedValue([
      { isResolved: false, isOutdated: false, authorLogin: 'human-reviewer' },
    ]);
    mockGetPrReviews.mockResolvedValue([COPILOT_APPROVED_REVIEW]);

    const result = await handleWorkflowRunEvent(
      { ...BASE_PAYLOAD, action: 'completed' },
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
