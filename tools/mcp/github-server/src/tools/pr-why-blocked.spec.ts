jest.mock('../github-api', () => ({ githubGraphQL: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { diagnose, partitionChecks } from './pr-why-blocked';

// ── Minimal PR fixture ────────────────────────────────────────────────────────

type PRInput = Parameters<typeof diagnose>[0];

function makePR(overrides: Partial<PRInput> = {}): PRInput {
  return {
    number: 42,
    title: 'Test PR',
    state: 'OPEN',
    url: 'https://github.com/owner/repo/pull/42',
    isDraft: false,
    mergeable: 'MERGEABLE',
    isInMergeQueue: false,
    reviewDecision: null,
    autoMergeRequest: null,
    labels: { pageInfo: { hasNextPage: false }, nodes: [] },
    commits: { nodes: [] },
    reviews: { pageInfo: { hasNextPage: false }, nodes: [] },
    reviewRequests: { pageInfo: { hasNextPage: false }, nodes: [] },
    reviewThreads: {
      totalCount: 0,
      pageInfo: { hasNextPage: false },
      nodes: [],
    },
    ...overrides,
  };
}

function withLabel(pr: PRInput, ...names: string[]): PRInput {
  return {
    ...pr,
    labels: {
      pageInfo: { hasNextPage: false },
      nodes: [...pr.labels.nodes, ...names.map((name) => ({ name }))],
    },
  };
}

function withCheckRun(
  pr: PRInput,
  name: string,
  status: string,
  conclusion: string | null,
): PRInput {
  const node = { __typename: 'CheckRun' as const, name, status, conclusion };
  const existing =
    pr.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? [];
  return {
    ...pr,
    commits: {
      nodes: [
        {
          commit: {
            statusCheckRollup: { contexts: { nodes: [...existing, node] } },
          },
        },
      ],
    },
  };
}

function withReview(
  pr: PRInput,
  login: string,
  state: string,
  submittedAt = '2024-01-01T00:00:00Z',
): PRInput {
  return {
    ...pr,
    reviews: {
      pageInfo: { hasNextPage: false },
      nodes: [...pr.reviews.nodes, { author: { login }, state, submittedAt }],
    },
  };
}

function withThread(
  pr: PRInput,
  isResolved: boolean,
  isOutdated = false,
): PRInput {
  return {
    ...pr,
    reviewThreads: {
      totalCount: pr.reviewThreads.totalCount + 1,
      pageInfo: { hasNextPage: false },
      nodes: [...pr.reviewThreads.nodes, { isResolved, isOutdated }],
    },
  };
}

// ── partitionChecks ───────────────────────────────────────────────────────────

describe('partitionChecks', () => {
  it('returns empty counts for no nodes', () => {
    expect(partitionChecks([])).toEqual({
      failing: [],
      pending: [],
      passing: 0,
    });
  });

  it('skips null nodes', () => {
    expect(partitionChecks([null])).toEqual({
      failing: [],
      pending: [],
      passing: 0,
    });
  });

  it('classifies a failed CheckRun', () => {
    const result = partitionChecks([
      {
        __typename: 'CheckRun',
        name: 'lint',
        status: 'COMPLETED',
        conclusion: 'FAILURE',
      },
    ]);
    expect(result.failing).toEqual(['lint']);
    expect(result.pending).toEqual([]);
  });

  it('classifies a timed-out CheckRun as failing', () => {
    const result = partitionChecks([
      {
        __typename: 'CheckRun',
        name: 'test',
        status: 'COMPLETED',
        conclusion: 'TIMED_OUT',
      },
    ]);
    expect(result.failing).toEqual(['test']);
  });

  it('classifies an in-progress CheckRun as pending', () => {
    const result = partitionChecks([
      {
        __typename: 'CheckRun',
        name: 'build',
        status: 'IN_PROGRESS',
        conclusion: null,
      },
    ]);
    expect(result.pending).toEqual(['build']);
  });

  it('classifies a queued CheckRun as pending', () => {
    const result = partitionChecks([
      {
        __typename: 'CheckRun',
        name: 'build',
        status: 'QUEUED',
        conclusion: null,
      },
    ]);
    expect(result.pending).toEqual(['build']);
  });

  it('classifies a successful CheckRun as passing', () => {
    const result = partitionChecks([
      {
        __typename: 'CheckRun',
        name: 'ci',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
      },
    ]);
    expect(result.passing).toBe(1);
    expect(result.failing).toEqual([]);
    expect(result.pending).toEqual([]);
  });

  it('classifies a skipped CheckRun as passing', () => {
    const result = partitionChecks([
      {
        __typename: 'CheckRun',
        name: 'e2e',
        status: 'COMPLETED',
        conclusion: 'SKIPPED',
      },
    ]);
    expect(result.passing).toBe(1);
  });

  it('handles StatusContext SUCCESS', () => {
    const result = partitionChecks([
      { __typename: 'StatusContext', context: 'ci/travis', state: 'SUCCESS' },
    ]);
    expect(result.passing).toBe(1);
  });

  it('handles StatusContext PENDING', () => {
    const result = partitionChecks([
      { __typename: 'StatusContext', context: 'ci/travis', state: 'PENDING' },
    ]);
    expect(result.pending).toEqual(['ci/travis']);
  });

  it('handles StatusContext FAILURE', () => {
    const result = partitionChecks([
      { __typename: 'StatusContext', context: 'ci/travis', state: 'FAILURE' },
    ]);
    expect(result.failing).toEqual(['ci/travis']);
  });

  it('mixes passing, failing, and pending correctly', () => {
    const result = partitionChecks([
      {
        __typename: 'CheckRun',
        name: 'lint',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
      },
      {
        __typename: 'CheckRun',
        name: 'test',
        status: 'COMPLETED',
        conclusion: 'FAILURE',
      },
      {
        __typename: 'CheckRun',
        name: 'build',
        status: 'IN_PROGRESS',
        conclusion: null,
      },
    ]);
    expect(result.passing).toBe(1);
    expect(result.failing).toEqual(['test']);
    expect(result.pending).toEqual(['build']);
  });
});

// ── diagnose ─────────────────────────────────────────────────────────────────

describe('diagnose', () => {
  describe('terminal states', () => {
    it('returns DONE/MERGED for a merged PR', () => {
      const result = diagnose(makePR({ state: 'MERGED' }));
      expect(result.status).toBe('DONE');
      expect(result.reason).toBe('MERGED');
    });

    it('returns DONE/CLOSED for a closed PR', () => {
      const result = diagnose(makePR({ state: 'CLOSED' }));
      expect(result.status).toBe('DONE');
      expect(result.reason).toBe('CLOSED');
    });
  });

  describe('draft', () => {
    it('returns BLOCKED/DRAFT when PR is still a draft', () => {
      const result = diagnose(makePR({ isDraft: true }));
      expect(result.status).toBe('BLOCKED');
      expect(result.reason).toBe('DRAFT');
    });
  });

  describe('merge conflicts', () => {
    it('returns BLOCKED/MERGE_CONFLICT when mergeable is CONFLICTING', () => {
      const result = diagnose(makePR({ mergeable: 'CONFLICTING' }));
      expect(result.status).toBe('BLOCKED');
      expect(result.reason).toBe('MERGE_CONFLICT');
    });
  });

  describe('CI', () => {
    it('returns BLOCKED/CI_FAILING when checks are failing', () => {
      const pr = withCheckRun(makePR(), 'lint', 'COMPLETED', 'FAILURE');
      const result = diagnose(pr);
      expect(result.status).toBe('BLOCKED');
      expect(result.reason).toBe('CI_FAILING');
      expect(
        (result.details as { failingChecks: string[] }).failingChecks,
      ).toContain('lint');
    });

    it('returns WAITING/CI_PENDING when checks are still running', () => {
      const pr = withCheckRun(makePR(), 'build', 'IN_PROGRESS', null);
      const result = diagnose(pr);
      expect(result.status).toBe('WAITING');
      expect(result.reason).toBe('CI_PENDING');
    });

    it('prioritises CI_FAILING over CI_PENDING', () => {
      let pr = withCheckRun(makePR(), 'lint', 'COMPLETED', 'FAILURE');
      pr = withCheckRun(pr, 'build', 'IN_PROGRESS', null);
      expect(diagnose(pr).reason).toBe('CI_FAILING');
    });
  });

  describe('review changes requested', () => {
    it('returns BLOCKED/CHANGES_REQUESTED when reviewer requested changes and no ready label', () => {
      const pr = withReview(
        makePR({ reviewDecision: 'CHANGES_REQUESTED' }),
        'reviewer',
        'CHANGES_REQUESTED',
      );
      const result = diagnose(pr);
      expect(result.status).toBe('BLOCKED');
      expect(result.reason).toBe('CHANGES_REQUESTED');
    });

    it('returns WAITING/AWAITING_RE_REVIEW when changes requested but bot:ready-for-review is applied', () => {
      let pr = withReview(
        makePR({ reviewDecision: 'CHANGES_REQUESTED' }),
        'reviewer',
        'CHANGES_REQUESTED',
      );
      pr = withLabel(pr, 'bot:ready-for-review');
      const result = diagnose(pr);
      expect(result.status).toBe('WAITING');
      expect(result.reason).toBe('AWAITING_RE_REVIEW');
    });

    it('detects CHANGES_REQUESTED from reviews even when reviewDecision is null', () => {
      const pr = withReview(makePR(), 'reviewer', 'CHANGES_REQUESTED');
      const result = diagnose(pr);
      expect(result.reason).toBe('CHANGES_REQUESTED');
    });
  });

  describe('unresolved threads', () => {
    it('returns BLOCKED/UNRESOLVED_THREADS when threads are open and no ready label', () => {
      const pr = withThread(makePR(), false);
      const result = diagnose(pr);
      expect(result.status).toBe('BLOCKED');
      expect(result.reason).toBe('UNRESOLVED_THREADS');
    });

    it('ignores outdated threads', () => {
      const pr = withThread(makePR(), false, true);
      const result = diagnose(pr);
      expect(result.reason).not.toBe('UNRESOLVED_THREADS');
    });

    it('returns WAITING/AWAITING_RE_REVIEW when threads open but ready label applied', () => {
      let pr = withThread(makePR(), false);
      pr = withLabel(pr, 'bot:ready-for-review');
      const result = diagnose(pr);
      expect(result.status).toBe('WAITING');
      expect(result.reason).toBe('AWAITING_RE_REVIEW');
    });

    it('surfaces threadCountTruncated in UNRESOLVED_THREADS details when page is truncated', () => {
      const pr = makePR({
        reviewThreads: {
          totalCount: 150,
          pageInfo: { hasNextPage: true },
          nodes: [{ isResolved: false, isOutdated: false }],
        },
      });
      const result = diagnose(pr);
      expect(result.reason).toBe('UNRESOLVED_THREADS');
      expect(
        (result.details as Record<string, unknown>).threadCountTruncated,
      ).toBe(true);
    });
  });

  describe('awaiting review', () => {
    it('returns WAITING/AWAITING_REVIEW when review requested and reviewer assigned', () => {
      const pr = makePR({
        reviewDecision: 'REVIEW_REQUIRED',
        reviewRequests: {
          pageInfo: { hasNextPage: false },
          nodes: [
            { requestedReviewer: { __typename: 'User', login: 'alice' } },
          ],
        },
      });
      const result = diagnose(pr);
      expect(result.status).toBe('WAITING');
      expect(result.reason).toBe('AWAITING_REVIEW');
    });

    it('returns BLOCKED/NO_REVIEWER_ASSIGNED when review required but nobody assigned', () => {
      const pr = makePR({ reviewDecision: 'REVIEW_REQUIRED' });
      const result = diagnose(pr);
      expect(result.status).toBe('BLOCKED');
      expect(result.reason).toBe('NO_REVIEWER_ASSIGNED');
    });
  });

  describe('merge queue / auto-merge', () => {
    it('returns WAITING/IN_MERGE_QUEUE when PR is in the merge queue', () => {
      const result = diagnose(makePR({ isInMergeQueue: true }));
      expect(result.status).toBe('WAITING');
      expect(result.reason).toBe('IN_MERGE_QUEUE');
    });

    it('returns WAITING/AUTO_MERGE_QUEUED when auto-merge is enabled', () => {
      const result = diagnose(
        makePR({ autoMergeRequest: { enabledBy: { login: 'bot' } } }),
      );
      expect(result.status).toBe('WAITING');
      expect(result.reason).toBe('AUTO_MERGE_QUEUED');
    });

    it('returns WAITING/MERGEABLE_UNKNOWN when GitHub has not computed mergeability', () => {
      const result = diagnose(makePR({ mergeable: 'UNKNOWN' }));
      expect(result.status).toBe('WAITING');
      expect(result.reason).toBe('MERGEABLE_UNKNOWN');
    });
  });

  describe('ready', () => {
    it('returns READY when all conditions are clear', () => {
      const pr = withReview(
        makePR({ reviewDecision: 'APPROVED' }),
        'reviewer',
        'APPROVED',
      );
      const result = diagnose(pr);
      expect(result.status).toBe('READY');
      expect(result.reason).toBe('READY');
    });

    it('includes labelsTruncated in details when labels page is truncated', () => {
      const pr = makePR({
        labels: {
          pageInfo: { hasNextPage: true },
          nodes: [],
        },
      });
      const result = diagnose(pr);
      expect((result.details as Record<string, unknown>).labelsTruncated).toBe(
        true,
      );
    });

    it('includes reviewsTruncated in details when reviews page is truncated', () => {
      const pr = makePR({
        reviews: {
          pageInfo: { hasNextPage: true },
          nodes: [],
        },
      });
      const result = diagnose(pr);
      expect((result.details as Record<string, unknown>).reviewsTruncated).toBe(
        true,
      );
    });
  });

  describe('priority ordering', () => {
    it('DRAFT beats MERGE_CONFLICT', () => {
      const result = diagnose(
        makePR({ isDraft: true, mergeable: 'CONFLICTING' }),
      );
      expect(result.reason).toBe('DRAFT');
    });

    it('MERGE_CONFLICT beats CI_FAILING', () => {
      const pr = withCheckRun(
        makePR({ mergeable: 'CONFLICTING' }),
        'lint',
        'COMPLETED',
        'FAILURE',
      );
      expect(diagnose(pr).reason).toBe('MERGE_CONFLICT');
    });

    it('CI_FAILING beats CHANGES_REQUESTED', () => {
      let pr = withCheckRun(makePR(), 'lint', 'COMPLETED', 'FAILURE');
      pr = withReview(pr, 'reviewer', 'CHANGES_REQUESTED');
      expect(diagnose(pr).reason).toBe('CI_FAILING');
    });
  });
});
