jest.mock('../github-api', () => ({
  githubGraphQL: jest.fn(),
  githubRest: jest.fn(),
}));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));
jest.mock('../required-checks', () => ({
  evaluatePRChecks: jest.fn(),
  requiresCodeOwnerReview: jest.fn(),
}));
jest.mock('../ci-run-diagnosis', () => ({
  diagnoseNeverRegistered: jest.fn(),
  fetchWorkflowRunsForSha: jest.fn(),
  fetchLatestCompletedRunForBranch: jest.fn(),
}));

import { diagnose, prWhyBlocked } from './pr-why-blocked';
import type { Diagnosis } from './pr-why-blocked';
import { githubGraphQL, githubRest } from '../github-api';
import { getRepoOwnerName } from '../auth';
import { evaluatePRChecks, requiresCodeOwnerReview } from '../required-checks';
import type { CIPartition } from '../required-checks';
import {
  diagnoseNeverRegistered,
  fetchLatestCompletedRunForBranch,
  fetchWorkflowRunsForSha,
} from '../ci-run-diagnosis';

const mockedGraphQL = githubGraphQL as jest.MockedFunction<
  typeof githubGraphQL
>;
const mockedRest = githubRest as jest.MockedFunction<typeof githubRest>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;
const mockedEvaluatePRChecks = evaluatePRChecks as jest.MockedFunction<
  typeof evaluatePRChecks
>;
const mockedRequiresCodeOwnerReview =
  requiresCodeOwnerReview as jest.MockedFunction<
    typeof requiresCodeOwnerReview
  >;
const mockedFetchRunsForSha = fetchWorkflowRunsForSha as jest.MockedFunction<
  typeof fetchWorkflowRunsForSha
>;
const mockedFetchLatestBranchRun =
  fetchLatestCompletedRunForBranch as jest.MockedFunction<
    typeof fetchLatestCompletedRunForBranch
  >;
const mockedDiagnoseNeverRegistered =
  diagnoseNeverRegistered as jest.MockedFunction<
    typeof diagnoseNeverRegistered
  >;

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
    mergeStateStatus: 'CLEAN',
    isInMergeQueue: false,
    reviewDecision: null,
    headRefOid: 'deadbeef',
    baseRefName: 'main',
    headRefName: 'feature-branch',
    autoMergeRequest: null,
    labels: { pageInfo: { hasNextPage: false }, nodes: [] },
    reviews: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [],
    },
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
      pageInfo: { hasNextPage: false, endCursor: null },
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

    // LS-9945: the CI: Conflicts label is written by a separate, independently
    // -scheduled workflow and can lag real git state by 5-15+ minutes after a
    // conflict actually resolves. GitHub's own `mergeable` + `mergeStateStatus`
    // fields are recomputed live on every push and don't share that lag — once
    // both already agree the branch is clean, a stale label alone must not
    // override them.
    it('does not report MERGE_CONFLICT from a stale CI: Conflicts label once live mergeable + mergeStateStatus both confirm the branch is clean (LS-9945)', () => {
      const pr = withLabel(
        makePR({ mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN' }),
        'CI: Conflicts',
      );
      const result = diagnose(pr, NO_CI);
      expect(result.reason).not.toBe('MERGE_CONFLICT');
      expect(result.status).toBe('READY');
    });

    it('also treats mergeStateStatus UNSTABLE (mergeable, but failing non-required checks) as confirming a lingering label is stale', () => {
      const pr = withLabel(
        makePR({ mergeable: 'MERGEABLE', mergeStateStatus: 'UNSTABLE' }),
        'CI: Conflicts',
      );
      const result = diagnose(pr, NO_CI);
      expect(result.reason).not.toBe('MERGE_CONFLICT');
    });

    // LS-10288: PRs #8170/#8143/#8138/#8230 — label-only signal while GitHub
    // read mergeable=MERGEABLE + mergeStateStatus=BLOCKED (required checks
    // pending), so the CLEAN/UNSTABLE-only override missed it.
    it('does not report MERGE_CONFLICT from a stale label when mergeable=MERGEABLE and mergeStateStatus=BLOCKED (LS-10288)', () => {
      const pr = withLabel(
        makePR({ mergeable: 'MERGEABLE', mergeStateStatus: 'BLOCKED' }),
        'CI: Conflicts',
      );
      const result = diagnose(pr, NO_CI);
      expect(result.reason).not.toBe('MERGE_CONFLICT');
    });

    it('MERGE_CONFLICT nextAction recommends merging the base and a plain push, never a force-push (LS-10288)', () => {
      const result = diagnose(
        makePR({ mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' }),
        NO_CI,
      );
      expect(result.reason).toBe('MERGE_CONFLICT');
      expect(result.nextAction).toContain('Merge main into the branch');
      expect(result.nextAction).not.toMatch(/force-push the branch/i);
    });

    it('still reports MERGE_CONFLICT from the label when mergeStateStatus has not confirmed the branch is clean', () => {
      const pr = withLabel(
        makePR({ mergeable: 'MERGEABLE', mergeStateStatus: 'UNKNOWN' }),
        'CI: Conflicts',
      );
      const result = diagnose(pr, NO_CI);
      expect(result.status).toBe('BLOCKED');
      expect(result.reason).toBe('MERGE_CONFLICT');
      expect((result.details as { signals: string[] }).signals).toContain(
        'label:CI: Conflicts',
      );
    });

    it('still reports MERGE_CONFLICT when mergeable itself is live CONFLICTING, even if a paired check disagrees', () => {
      const result = diagnose(
        makePR({ mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' }),
        NO_CI,
      );
      expect(result.status).toBe('BLOCKED');
      expect(result.reason).toBe('MERGE_CONFLICT');
    });

    it('returns MERGE_CONFLICT (not CI_FAILING) when the No Merge Conflicts check fails during a mergeable UNKNOWN window', () => {
      const result = diagnose(
        makePR({ mergeable: 'UNKNOWN' }),
        ci({ failing: ['No Merge Conflicts (failure)'] }),
      );
      expect(result.status).toBe('BLOCKED');
      expect(result.reason).toBe('MERGE_CONFLICT');
    });

    it('surfaces non-conflict failing checks alongside a MERGE_CONFLICT verdict', () => {
      const result = diagnose(
        makePR({ mergeable: 'CONFLICTING' }),
        ci({ failing: ['No Merge Conflicts (failure)', 'lint (failure)'] }),
      );
      expect(result.reason).toBe('MERGE_CONFLICT');
      expect(
        (result.details as { alsoFailingChecks: string[] }).alsoFailingChecks,
      ).toEqual(['lint (failure)']);
    });

    it('does not treat a cancelled No Merge Conflicts run as a conflict', () => {
      const result = diagnose(
        makePR(),
        ci({ failing: ['No Merge Conflicts (cancelled)'] }),
      );
      expect(result.reason).toBe('CI_FAILING');
    });

    it('names the PR base branch in details and nextAction', () => {
      const result = diagnose(
        makePR({ mergeable: 'CONFLICTING', baseRefName: 'release/1.2' }),
        NO_CI,
      );
      expect((result.details as { base: string }).base).toBe('release/1.2');
      expect(result.nextAction).toContain('release/1.2');
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

    it('adds the STALE_BASE hint and rebase nextAction when a failing check is green on base (LS-10376)', () => {
      const result = diagnose(
        makePR(),
        ci({ failing: ['test (failure)'] }),
        false,
        {
          hint: 'STALE_BASE',
          behindBy: 4,
          mergeBaseSha: 'aaaaaaaaaaaaaaaa',
          baseTipSha: 'bbbbbbbbbbbbbbbb',
          greenOnBase: ['test'],
          failingOnBase: [],
        },
      );
      expect(result.reason).toBe('CI_FAILING');
      expect(result.hint).toBe('STALE_BASE');
      expect(result.nextAction).toContain('Rebase onto main');
    });

    it('omits the hint when no stale-base evidence is passed', () => {
      const result = diagnose(makePR(), ci({ failing: ['test (failure)'] }));
      expect(result.hint).toBeUndefined();
    });

    it('flags un-ruled-out conflicts on CI_FAILING while mergeable is UNKNOWN', () => {
      const result = diagnose(
        makePR({ mergeable: 'UNKNOWN' }),
        ci({ failing: ['lint (failure)'] }),
      );
      expect(result.reason).toBe('CI_FAILING');
      expect(result.summary).toContain('conflicts cannot be ruled out');
      expect((result.details as { mergeable: string }).mergeable).toBe(
        'UNKNOWN',
      );
    });

    // LS-9335: "CI Gate (not yet registered)" used to render identically to a
    // genuinely queued check, telling an agent to "wait" for a pipeline that
    // will never run because every orchestrator run for the head SHA was
    // cancelled.
    describe('CI never registered (LS-9335)', () => {
      it('returns BLOCKED/CI_NEVER_RAN with a re-run nextAction when every run for the head SHA was cancelled (AC1)', () => {
        const result = diagnose(
          makePR({ headRefOid: 'cdaf1c2' }),
          ci({ pending: ['CI Gate (not yet registered)'] }),
          false,
          null,
          {
            neverRan: true,
            cancelledRunIds: [31421732904, 31422037097],
          },
        );
        expect(result.status).toBe('BLOCKED');
        expect(result.reason).toBe('CI_NEVER_RAN');
        expect(result.nextAction).not.toContain('Wait for CI to finish');
        expect(result.nextAction).toContain('ci_rerun');
        expect(result.nextAction).toContain('31422037097');
        expect(
          (result.details as { cancelledRunIds: number[] }).cancelledRunIds,
        ).toEqual([31421732904, 31422037097]);
      });

      it('leaves CI_PENDING/"wait" behaviour unchanged when a run for the head SHA is queued or in progress (AC2)', () => {
        const result = diagnose(
          makePR(),
          ci({ pending: ['CI Gate (not yet registered)'] }),
          false,
          null,
          { neverRan: false, cancelledRunIds: [] },
        );
        expect(result.status).toBe('WAITING');
        expect(result.reason).toBe('CI_PENDING');
        expect(result.nextAction).toBe('Wait for CI to finish.');
      });

      it('leaves CI_PENDING/"wait" behaviour unchanged when neverRegistered was not computed at all (AC2)', () => {
        const result = diagnose(
          makePR(),
          ci({ pending: ['CI Gate (not yet registered)'] }),
        );
        expect(result.status).toBe('WAITING');
        expect(result.reason).toBe('CI_PENDING');
      });

      it('surfaces staleCompletedRun details and names the superseded commit in nextAction, distinct from the head SHA (AC3)', () => {
        const result = diagnose(
          makePR({ headRefOid: 'cdaf1c2' }),
          ci({ pending: ['CI Gate (not yet registered)'] }),
          false,
          null,
          {
            neverRan: true,
            cancelledRunIds: [31421732904, 31422037097],
            staleCompletedRun: {
              runId: 31419427766,
              sha: 'e812d4b',
              conclusion: 'failure',
            },
          },
        );
        expect(
          (result.details as { staleCompletedRun: { sha: string } })
            .staleCompletedRun.sha,
        ).toBe('e812d4b');
        expect(result.nextAction).toContain('superseded commit');
        expect(result.nextAction).toContain('e812d4b');
      });
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

    it('does not report stale CHANGES_REQUESTED once the same reviewer later approves, even when the raw reviewDecision field still lags (LS-8708)', () => {
      let pr = makePR({ reviewDecision: 'CHANGES_REQUESTED' });
      pr = withReview(pr, 'bot', 'CHANGES_REQUESTED', '2026-01-01T00:00:00Z');
      pr = withReview(pr, 'bot', 'APPROVED', '2026-01-01T01:00:00Z');
      const result = diagnose(pr, NO_CI);
      expect(result.status).not.toBe('BLOCKED');
      expect(result.reason).not.toBe('CHANGES_REQUESTED');
    });

    it('does not report stale AWAITING_RE_REVIEW once the same reviewer later approves and the ready label is applied (LS-8708)', () => {
      let pr = makePR({ reviewDecision: 'CHANGES_REQUESTED' });
      pr = withReview(pr, 'bot', 'CHANGES_REQUESTED', '2026-01-01T00:00:00Z');
      pr = withReview(pr, 'bot', 'APPROVED', '2026-01-01T01:00:00Z');
      pr = withLabel(pr, 'bot:ready-for-review');
      const result = diagnose(pr, NO_CI);
      expect(result.reason).not.toBe('AWAITING_RE_REVIEW');
      expect(result.reason).toBe('READY');
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
      expect(result.details.threadCountTruncated).toBe(true);
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

  describe('code-owner review required', () => {
    it('returns BLOCKED/AWAITING_CODE_OWNER_REVIEW when CI is green and branch protection requires a code-owner review, nobody assigned', () => {
      const pr = makePR({ reviewDecision: 'REVIEW_REQUIRED' });
      const result = diagnose(pr, NO_CI, true);
      expect(result.status).toBe('BLOCKED');
      expect(result.reason).toBe('AWAITING_CODE_OWNER_REVIEW');
      expect(
        (result.details as { pendingReviewers: string[] }).pendingReviewers,
      ).toEqual([]);
    });

    it('returns BLOCKED/AWAITING_CODE_OWNER_REVIEW with pendingReviewers when a code-owner review has been requested but not submitted', () => {
      const pr = makePR({
        reviewDecision: 'REVIEW_REQUIRED',
        reviewRequests: {
          pageInfo: { hasNextPage: false },
          nodes: [
            { requestedReviewer: { __typename: 'User', login: 'code-owner' } },
          ],
        },
      });
      const result = diagnose(pr, NO_CI, true);
      expect(result.status).toBe('BLOCKED');
      expect(result.reason).toBe('AWAITING_CODE_OWNER_REVIEW');
      expect(
        (result.details as { pendingReviewers: string[] }).pendingReviewers,
      ).toEqual(['code-owner']);
    });

    it('takes priority over AWAITING_REVIEW when the review requirement is code-owner-driven', () => {
      const pr = makePR({
        reviewDecision: 'REVIEW_REQUIRED',
        reviewRequests: {
          pageInfo: { hasNextPage: false },
          nodes: [
            { requestedReviewer: { __typename: 'User', login: 'alice' } },
          ],
        },
      });
      const result = diagnose(pr, NO_CI, true);
      expect(result.reason).toBe('AWAITING_CODE_OWNER_REVIEW');
    });

    it('leaves NO_REVIEWER_ASSIGNED unchanged when the review requirement is not code-owner-driven', () => {
      const pr = makePR({ reviewDecision: 'REVIEW_REQUIRED' });
      const result = diagnose(pr, NO_CI, false);
      expect(result.reason).toBe('NO_REVIEWER_ASSIGNED');
    });

    it('leaves AWAITING_REVIEW unchanged when the review requirement is not code-owner-driven', () => {
      const pr = makePR({
        reviewDecision: 'REVIEW_REQUIRED',
        reviewRequests: {
          pageInfo: { hasNextPage: false },
          nodes: [
            { requestedReviewer: { __typename: 'User', login: 'alice' } },
          ],
        },
      });
      const result = diagnose(pr, NO_CI, false);
      expect(result.reason).toBe('AWAITING_REVIEW');
    });

    it('does not fire when CI is still failing (CI_FAILING still wins)', () => {
      const pr = makePR({ reviewDecision: 'REVIEW_REQUIRED' });
      const result = diagnose(pr, ci({ failing: ['lint (failure)'] }), true);
      expect(result.reason).toBe('CI_FAILING');
    });

    // LS-9379: reviewDecision flips to APPROVED as soon as the CODEOWNERS
    // catch-all (`*` -> review bot) approves, so an outstanding path-specific
    // code-owner request used to fall through to a false READY while GitHub's
    // merge API kept rejecting the merge (PR #7084).
    it('returns BLOCKED/AWAITING_CODE_OWNER_REVIEW when the catch-all bot approved but a code-owner request is still outstanding', () => {
      const pr = withReview(
        makePR({
          reviewDecision: 'APPROVED',
          reviewRequests: {
            pageInfo: { hasNextPage: false },
            nodes: [
              { requestedReviewer: { __typename: 'User', login: 'bkrupa' } },
            ],
          },
        }),
        'legacy-sports-review-bot',
        'APPROVED',
      );
      const result = diagnose(withLabel(pr, 'merge-when-ready'), NO_CI, true);
      expect(result.status).toBe('BLOCKED');
      expect(result.reason).toBe('AWAITING_CODE_OWNER_REVIEW');
      expect(
        (result.details as { pendingReviewers: string[] }).pendingReviewers,
      ).toEqual(['bkrupa']);
      expect(
        (result.details as { approvedByOtherReviewers?: boolean })
          .approvedByOtherReviewers,
      ).toBe(true);
      expect(result.nextAction).toContain('bkrupa');
    });

    it('returns READY once the code owner has also approved and the request is cleared', () => {
      const pr = withReview(
        withReview(
          makePR({ reviewDecision: 'APPROVED' }),
          'legacy-sports-review-bot',
          'APPROVED',
        ),
        'bkrupa',
        'APPROVED',
      );
      const result = diagnose(pr, ci({ passing: 4 }), true);
      expect(result.status).toBe('READY');
      expect(result.reason).toBe('READY');
    });

    it('still reports READY on catch-all bot approval alone when no code owner was requested', () => {
      const pr = withReview(
        makePR({ reviewDecision: 'APPROVED' }),
        'legacy-sports-review-bot',
        'APPROVED',
      );
      const result = diagnose(pr, ci({ passing: 4 }), true);
      expect(result.status).toBe('READY');
      expect(result.reason).toBe('READY');
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
      expect(
        (result.details as { ciPassingRequiredChecks: number })
          .ciPassingRequiredChecks,
      ).toBe(8);
    });

    it('never tells the caller to apply merge-when-ready themselves when it is missing', () => {
      const pr = withReview(
        makePR({ reviewDecision: 'APPROVED' }),
        'reviewer',
        'APPROVED',
      );
      const result = diagnose(pr, ci({ passing: 8 }));
      expect(result.nextAction).not.toContain('Apply the merge-when-ready');
      expect(result.nextAction).toContain('Reviewer Bot');
    });

    // LS-9888: our own required-check partition can look fully green (a
    // narrower required-name scope than the checks GitHub itself gates on)
    // while GitHub's mergeStateStatus rollup — which considers every check on
    // the SHA — still reports BLOCKED. Trust GitHub's verdict over ours rather
    // than returning a false READY, especially since a just-stripped
    // merge-when-ready label (hasMergeWhenReady: false) is itself evidence
    // that a failure gate fired.
    it('returns BLOCKED/MERGE_STATE_BLOCKED instead of READY when mergeStateStatus is BLOCKED despite a clean required-check partition', () => {
      const pr = withReview(
        makePR({ reviewDecision: 'APPROVED', mergeStateStatus: 'BLOCKED' }),
        'reviewer',
        'APPROVED',
      );
      const result = diagnose(pr, ci({ passing: 4 }));
      expect(result.status).toBe('BLOCKED');
      expect(result.reason).toBe('MERGE_STATE_BLOCKED');
      expect(
        (result.details as { hasMergeWhenReady: boolean }).hasMergeWhenReady,
      ).toBe(false);
      expect(result.summary).toContain('stripped');
      expect(result.nextAction).not.toContain('Apply the merge-when-ready');
    });

    it('does not mention a stripped label when mergeStateStatus is BLOCKED but merge-when-ready is still applied', () => {
      const pr = withLabel(
        withReview(
          makePR({ reviewDecision: 'APPROVED', mergeStateStatus: 'BLOCKED' }),
          'reviewer',
          'APPROVED',
        ),
        'merge-when-ready',
      );
      const result = diagnose(pr, ci({ passing: 4 }));
      expect(result.reason).toBe('MERGE_STATE_BLOCKED');
      expect(result.summary).not.toContain('stripped');
    });

    it('includes labelsTruncated in details when labels page is truncated', () => {
      const pr = makePR({
        labels: {
          pageInfo: { hasNextPage: true },
          nodes: [],
        },
      });
      const result = diagnose(pr, NO_CI);
      expect(result.details.labelsTruncated).toBe(true);
    });

    it('includes reviewsTruncated in details when reviews page is truncated', () => {
      const pr = makePR({
        reviews: {
          pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
          nodes: [],
        },
      });
      const result = diagnose(pr, NO_CI);
      expect(result.details.reviewsTruncated).toBe(true);
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

// ── prWhyBlocked (async wrapper) ────────────────────────────────────────────

describe('prWhyBlocked', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRepo.mockResolvedValue({ owner: 'o', name: 'r' });
    mockedEvaluatePRChecks.mockResolvedValue(NO_CI);
    mockedRequiresCodeOwnerReview.mockResolvedValue(false);
  });

  it("paginates past a truncated first review page to find a reviewer's true latest state (LS-8708)", async () => {
    mockedGraphQL
      .mockResolvedValueOnce({
        data: {
          repository: {
            pullRequest: {
              ...makePR(),
              reviewDecision: 'CHANGES_REQUESTED',
              reviews: {
                pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
                nodes: [
                  {
                    author: { login: 'bot' },
                    state: 'CHANGES_REQUESTED',
                    submittedAt: '2026-07-07T16:30:33Z',
                  },
                ],
              },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          repository: {
            pullRequest: {
              reviews: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    author: { login: 'bot' },
                    state: 'APPROVED',
                    submittedAt: '2026-07-07T16:50:50Z',
                  },
                ],
              },
            },
          },
        },
      });

    const result = await prWhyBlocked({ number: 42 });
    const payload = JSON.parse(result.content[0].text) as Diagnosis;
    expect(payload.reason).not.toBe('CHANGES_REQUESTED');
    expect(payload.status).toBe('READY');
  });
  it('reports behindBy and the STALE_BASE hint when CI fails on a stale base (LS-10376)', async () => {
    mockedGraphQL.mockResolvedValueOnce({
      data: { repository: { pullRequest: makePR() } },
    });
    mockedEvaluatePRChecks.mockResolvedValue(
      ci({ failing: ['test (failure)'] }),
    );
    mockedRest
      .mockResolvedValueOnce({
        behind_by: 2,
        ahead_by: 1,
        merge_base_commit: { sha: 'aaaaaaaaaaaaaaaa' },
        base_commit: { sha: 'bbbbbbbbbbbbbbbb' },
      })
      .mockResolvedValueOnce({
        check_runs: [
          { id: 1, name: 'test', status: 'completed', conclusion: 'success' },
        ],
      });

    const result = await prWhyBlocked({ number: 42 });
    const payload = JSON.parse(result.content[0].text) as Diagnosis & {
      behindBy: number;
    };
    expect(payload.reason).toBe('CI_FAILING');
    expect(payload.behindBy).toBe(2);
    expect(payload.hint).toBe('STALE_BASE');
  });

  // LS-9335 end-to-end: the Actions-runs lookup only fires when a required
  // check is genuinely ambiguous ("not yet registered"), and its result flows
  // through to the final diagnosis.
  describe('CI never registered (LS-9335)', () => {
    it('only calls the Actions-runs lookup when a required check reads "not yet registered"', async () => {
      mockedGraphQL.mockResolvedValueOnce({
        data: { repository: { pullRequest: makePR() } },
      });
      mockedEvaluatePRChecks.mockResolvedValue(
        ci({ pending: ['build (in_progress)'] }),
      );

      await prWhyBlocked({ number: 42 });

      expect(mockedFetchRunsForSha).not.toHaveBeenCalled();
      expect(mockedFetchLatestBranchRun).not.toHaveBeenCalled();
    });

    it('fetches workflow runs for the head SHA and branch, then feeds the result into diagnose (AC1/AC3)', async () => {
      mockedGraphQL.mockResolvedValueOnce({
        data: {
          repository: {
            pullRequest: makePR({
              headRefOid: 'cdaf1c2',
              headRefName: 'ls-9247',
            }),
          },
        },
      });
      mockedEvaluatePRChecks.mockResolvedValue(
        ci({ pending: ['CI Gate (not yet registered)'] }),
      );
      const cancelledRuns = [
        {
          id: 31421732904,
          status: 'completed',
          conclusion: 'cancelled',
          head_sha: 'cdaf1c2',
          head_branch: 'ls-9247',
          created_at: '2026-08-10T00:00:00Z',
        },
        {
          id: 31422037097,
          status: 'completed',
          conclusion: 'cancelled',
          head_sha: 'cdaf1c2',
          head_branch: 'ls-9247',
          created_at: '2026-08-10T00:01:00Z',
        },
      ];
      const staleRun = {
        id: 31419427766,
        status: 'completed',
        conclusion: 'failure',
        head_sha: 'e812d4b',
        head_branch: 'ls-9247',
        created_at: '2026-08-09T00:00:00Z',
      };
      mockedFetchRunsForSha.mockResolvedValue(cancelledRuns);
      mockedFetchLatestBranchRun.mockResolvedValue(staleRun);
      mockedDiagnoseNeverRegistered.mockReturnValue({
        neverRan: true,
        cancelledRunIds: [31421732904, 31422037097],
        staleCompletedRun: {
          runId: 31419427766,
          sha: 'e812d4b',
          conclusion: 'failure',
        },
      });

      const result = await prWhyBlocked({ number: 6935 });
      const payload = JSON.parse(result.content[0].text) as Diagnosis;

      expect(mockedFetchRunsForSha).toHaveBeenCalledWith('o', 'r', 'cdaf1c2');
      expect(mockedFetchLatestBranchRun).toHaveBeenCalledWith(
        'o',
        'r',
        'ls-9247',
      );
      expect(payload.status).toBe('BLOCKED');
      expect(payload.reason).toBe('CI_NEVER_RAN');
      expect(payload.nextAction).toContain('ci_rerun');
    });
  });
});
