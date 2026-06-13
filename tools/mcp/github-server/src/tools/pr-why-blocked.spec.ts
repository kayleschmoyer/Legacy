jest.mock('../github-api', () => ({
  githubGraphQL: jest.fn(),
  githubRest: jest.fn(),
}));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { diagnose } from './pr-why-blocked';
import type { CIPartition } from '../required-checks';

// ── CI partition helper ───────────────────────────────────────────────────────
// CI state now arrives pre-computed (from the shared evaluatePRChecks helper);
// diagnose() consumes the partition rather than re-deriving it from GraphQL nodes.

const NO_CI: CIPartition = {
  failing: [],
  pending: [],
  passing: 0,
  hadDuplicateRuns: false,
};

function ci(partial: Partial<CIPartition> = {}): CIPartition {
  return { ...NO_CI, ...partial };
}

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
    headRefOid: 'deadbeef',
    baseRefName: 'main',
    autoMergeRequest: null,
    labels: { pageInfo: { hasNextPage: false }, nodes: [] },
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

// ── diagnose ─────────────────────────────────────────────────────────────────

describe('diagnose', () => {
  describe('terminal states', () => {
    it('returns DONE/MERGED for a merged PR', () => {
      const result = diagnose(makePR({ state: 'MERGED' }), NO_CI);
      expect(result.status).toBe('DONE');
      expect(result.reason).toBe('MERGED');
    });

    it('returns DONE/CLOSED for a closed PR', () => {
      const result = diagnose(makePR({ state: 'CLOSED' }), NO_CI);
      expect(result.status).toBe('DONE');
      expect(result.reason).toBe('CLOSED');
    });
  });

  describe('draft', () => {
    it('returns BLOCKED/DRAFT when PR is still a draft', () => {
      const result = diagnose(makePR({ isDraft: true }), NO_CI);
      expect(result.status).toBe('BLOCKED');
      expect(result.reason).toBe('DRAFT');
    });
  });

  describe('merge conflicts', () => {
    it('returns BLOCKED/MERGE_CONFLICT when mergeable is CONFLICTING', () => {
      const result = diagnose(makePR({ mergeable: 'CONFLICTING' }), NO_CI);
      expect(result.status).toBe('BLOCKED');
      expect(result.reason).toBe('MERGE_CONFLICT');
    });
  });

  describe('CI', () => {
    it('returns BLOCKED/CI_FAILING when required checks are failing', () => {
      const result = diagnose(makePR(), ci({ failing: ['lint (failure)'] }));
      expect(result.status).toBe('BLOCKED');
      expect(result.reason).toBe('CI_FAILING');
      expect(
        (result.details as { failingChecks: string[] }).failingChecks,
      ).toContain('lint (failure)');
    });

    it('returns WAITING/CI_PENDING when required checks are still running', () => {
      const result = diagnose(
        makePR(),
        ci({ pending: ['build (in_progress)'] }),
      );
      expect(result.status).toBe('WAITING');
      expect(result.reason).toBe('CI_PENDING');
    });

    it('prioritises CI_FAILING over CI_PENDING', () => {
      const result = diagnose(
        makePR(),
        ci({ failing: ['lint (failure)'], pending: ['build (in_progress)'] }),
      );
      expect(result.reason).toBe('CI_FAILING');
    });
  });

  describe('review changes requested', () => {
    it('returns BLOCKED/CHANGES_REQUESTED when reviewer requested changes and no ready label', () => {
      const pr = withReview(
        makePR({ reviewDecision: 'CHANGES_REQUESTED' }),
        'reviewer',
        'CHANGES_REQUESTED',
      );
      const result = diagnose(pr, NO_CI);
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
      const result = diagnose(pr, NO_CI);
      expect(result.status).toBe('WAITING');
      expect(result.reason).toBe('AWAITING_RE_REVIEW');
    });

    it('detects CHANGES_REQUESTED from reviews even when reviewDecision is null', () => {
      const pr = withReview(makePR(), 'reviewer', 'CHANGES_REQUESTED');
      const result = diagnose(pr, NO_CI);
      expect(result.reason).toBe('CHANGES_REQUESTED');
    });
  });

  describe('unresolved threads', () => {
    it('returns BLOCKED/UNRESOLVED_THREADS when threads are open and no ready label', () => {
      const pr = withThread(makePR(), false);
      const result = diagnose(pr, NO_CI);
      expect(result.status).toBe('BLOCKED');
      expect(result.reason).toBe('UNRESOLVED_THREADS');
    });

    it('ignores outdated threads', () => {
      const pr = withThread(makePR(), false, true);
      const result = diagnose(pr, NO_CI);
      expect(result.reason).not.toBe('UNRESOLVED_THREADS');
    });

    it('returns WAITING/AWAITING_RE_REVIEW when threads open but ready label applied', () => {
      let pr = withThread(makePR(), false);
      pr = withLabel(pr, 'bot:ready-for-review');
      const result = diagnose(pr, NO_CI);
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
      const result = diagnose(pr, NO_CI);
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
      const result = diagnose(pr, NO_CI);
      expect(result.status).toBe('WAITING');
      expect(result.reason).toBe('AWAITING_REVIEW');
    });

    it('returns BLOCKED/NO_REVIEWER_ASSIGNED when review required but nobody assigned', () => {
      const pr = makePR({ reviewDecision: 'REVIEW_REQUIRED' });
      const result = diagnose(pr, NO_CI);
      expect(result.status).toBe('BLOCKED');
      expect(result.reason).toBe('NO_REVIEWER_ASSIGNED');
    });
  });

  describe('merge queue / auto-merge', () => {
    it('returns WAITING/IN_MERGE_QUEUE when PR is in the merge queue', () => {
      const result = diagnose(makePR({ isInMergeQueue: true }), NO_CI);
      expect(result.status).toBe('WAITING');
      expect(result.reason).toBe('IN_MERGE_QUEUE');
    });

    it('returns WAITING/AUTO_MERGE_QUEUED when auto-merge is enabled', () => {
      const result = diagnose(
        makePR({ autoMergeRequest: { enabledBy: { login: 'bot' } } }),
        NO_CI,
      );
      expect(result.status).toBe('WAITING');
      expect(result.reason).toBe('AUTO_MERGE_QUEUED');
    });

    it('returns WAITING/MERGEABLE_UNKNOWN when GitHub has not computed mergeability', () => {
      const result = diagnose(makePR({ mergeable: 'UNKNOWN' }), NO_CI);
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
      const result = diagnose(pr, ci({ passing: 8 }));
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
      const result = diagnose(pr, NO_CI);
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
      const result = diagnose(pr, NO_CI);
      expect((result.details as Record<string, unknown>).reviewsTruncated).toBe(
        true,
      );
    });
  });

  describe('priority ordering', () => {
    it('DRAFT beats MERGE_CONFLICT', () => {
      const result = diagnose(
        makePR({ isDraft: true, mergeable: 'CONFLICTING' }),
        NO_CI,
      );
      expect(result.reason).toBe('DRAFT');
    });

    it('MERGE_CONFLICT beats CI_FAILING', () => {
      const result = diagnose(
        makePR({ mergeable: 'CONFLICTING' }),
        ci({ failing: ['lint (failure)'] }),
      );
      expect(result.reason).toBe('MERGE_CONFLICT');
    });

    it('CI_FAILING beats CHANGES_REQUESTED', () => {
      const pr = withReview(makePR(), 'reviewer', 'CHANGES_REQUESTED');
      expect(diagnose(pr, ci({ failing: ['lint (failure)'] })).reason).toBe(
        'CI_FAILING',
      );
    });
  });
});
