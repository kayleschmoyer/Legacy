jest.mock('./github-api', () => ({ githubRest: jest.fn() }));
jest.mock('./auth', () => ({ getRepoOwnerName: jest.fn() }));

import { evaluateRequiredChecks } from './required-checks';
import type { RestCheckRun, RestCommitStatus } from './required-checks';
import { diagnose } from './tools/pr-why-blocked';

// The 8 checks branch protection requires on `main` (see .github/ruleset.json).
// bot-review is a commit STATUS; the rest are check RUNS.
const REQUIRED = new Set([
  'bot-review',
  'No Merge Conflicts',
  'Verify All Migrations Applied',
  '🚀 CI Pipeline / lint',
  '🚀 CI Pipeline / format',
  '🚀 CI Pipeline / build',
  '🚀 CI Pipeline / test',
  '🚀 CI Pipeline / custom-checks',
]);

function run(
  name: string,
  conclusion: string | null,
  completedAt: string | null = '2026-06-13T00:00:00Z',
  status = 'completed',
): RestCheckRun {
  return {
    name,
    status,
    conclusion,
    started_at: completedAt,
    completed_at: completedAt,
  };
}

function status(
  context: string,
  state: string,
  createdAt = '2026-06-13T00:00:00Z',
): RestCommitStatus {
  return { context, state, created_at: createdAt };
}

describe('evaluateRequiredChecks', () => {
  // The headline regression: a fully-green PR (#5118 / #5051) whose head SHA
  // carries (a) a duplicate cancelled "No Merge Conflicts" run superseded by a
  // success, and (b) genuinely-failing NON-required checks. The merge-queue
  // processor calls this READY; the MCP tools must agree, not report CI_FAILING.
  it('reports READY for green required checks despite stale duplicates and non-required failures', () => {
    const checkRuns: RestCheckRun[] = [
      // Duplicate required check: an earlier cancelled run, then a later success.
      run('No Merge Conflicts', 'cancelled', '2026-06-13T00:00:00Z'),
      run('No Merge Conflicts', 'success', '2026-06-13T00:05:00Z'),
      run('Verify All Migrations Applied', 'success'),
      run('🚀 CI Pipeline / lint', 'success'),
      run('🚀 CI Pipeline / format', 'success'),
      run('🚀 CI Pipeline / build', 'success'),
      run('🚀 CI Pipeline / test', 'success'),
      run('🚀 CI Pipeline / custom-checks', 'success'),
      // Non-required checks that are genuinely failing — must be ignored.
      run('review', 'failure'),
      run('Summarize & Report', 'failure'),
      run('🔐 SHA Sanity Check', 'failure'),
      // Excluded housekeeping job — ignored even though required-name-agnostic.
      run('process-merge-queue', 'failure'),
    ];
    const commitStatuses: RestCommitStatus[] = [
      // bot-review: an older pending superseded by a newer success.
      status('bot-review', 'pending', '2026-06-13T00:00:00Z'),
      status('bot-review', 'success', '2026-06-13T00:06:00Z'),
    ];

    const result = evaluateRequiredChecks(checkRuns, commitStatuses, REQUIRED);

    expect(result.failing).toEqual([]);
    expect(result.pending).toEqual([]);
    // 7 required check runs + bot-review status.
    expect(result.passing).toBe(8);
    expect(result.hadDuplicateRuns).toBe(true);
  });

  it('feeds a READY verdict through diagnose (not CI_FAILING)', () => {
    const checkRuns: RestCheckRun[] = [
      run('No Merge Conflicts', 'cancelled', '2026-06-13T00:00:00Z'),
      run('No Merge Conflicts', 'success', '2026-06-13T00:05:00Z'),
      run('Verify All Migrations Applied', 'success'),
      run('🚀 CI Pipeline / lint', 'success'),
      run('🚀 CI Pipeline / format', 'success'),
      run('🚀 CI Pipeline / build', 'success'),
      run('🚀 CI Pipeline / test', 'success'),
      run('🚀 CI Pipeline / custom-checks', 'success'),
      run('review', 'failure'),
      run('Summarize & Report', 'failure'),
    ];
    const commitStatuses = [status('bot-review', 'success')];
    const ci = evaluateRequiredChecks(checkRuns, commitStatuses, REQUIRED);

    const pr = {
      number: 5118,
      title: 'Green PR',
      state: 'OPEN',
      url: 'https://github.com/owner/repo/pull/5118',
      isDraft: false,
      mergeable: 'MERGEABLE' as const,
      isInMergeQueue: false,
      reviewDecision: 'APPROVED',
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
    };

    const diagnosis = diagnose(pr, ci);
    expect(diagnosis.status).toBe('READY');
    expect(diagnosis.reason).toBe('READY');
  });

  it('excludes non-required failing checks from the failing list', () => {
    const result = evaluateRequiredChecks(
      [run('review', 'failure'), run('🚀 CI Pipeline / lint', 'success')],
      [status('bot-review', 'success')],
      new Set(['bot-review', '🚀 CI Pipeline / lint']),
    );
    expect(result.failing).toEqual([]);
  });

  it('flags a genuinely failing required check', () => {
    const result = evaluateRequiredChecks(
      [run('🚀 CI Pipeline / test', 'failure')],
      [],
      new Set(['🚀 CI Pipeline / test']),
    );
    expect(result.failing).toEqual(['🚀 CI Pipeline / test (failure)']);
  });

  it('keeps a later cancelled run when it supersedes an earlier success', () => {
    // Ordering must be timestamp-driven, not list-position-driven.
    const result = evaluateRequiredChecks(
      [
        run('🚀 CI Pipeline / build', 'success', '2026-06-13T00:00:00Z'),
        run('🚀 CI Pipeline / build', 'cancelled', '2026-06-13T01:00:00Z'),
      ],
      [],
      new Set(['🚀 CI Pipeline / build']),
    );
    expect(result.failing).toEqual(['🚀 CI Pipeline / build (cancelled)']);
    expect(result.hadDuplicateRuns).toBe(true);
  });

  it('reports a required check with no run as pending (not registered)', () => {
    const result = evaluateRequiredChecks(
      [run('🚀 CI Pipeline / lint', 'success')],
      [],
      new Set(['🚀 CI Pipeline / lint', '🚀 CI Pipeline / test']),
    );
    expect(result.pending).toEqual([
      '🚀 CI Pipeline / test (not yet registered)',
    ]);
  });

  it('treats an in-progress required check as pending', () => {
    const result = evaluateRequiredChecks(
      [run('🚀 CI Pipeline / build', null, null, 'in_progress')],
      [],
      new Set(['🚀 CI Pipeline / build']),
    );
    expect(result.pending).toEqual(['🚀 CI Pipeline / build (in_progress)']);
  });

  it('treats skipped/neutral required checks as non-failing', () => {
    const result = evaluateRequiredChecks(
      [
        run('🚀 CI Pipeline / build', 'skipped'),
        run('🚀 CI Pipeline / test', 'neutral'),
      ],
      [],
      new Set(['🚀 CI Pipeline / build', '🚀 CI Pipeline / test']),
    );
    expect(result.failing).toEqual([]);
    expect(result.pending).toEqual([]);
    expect(result.passing).toBe(2);
  });

  it('flags a pending required commit status', () => {
    const result = evaluateRequiredChecks(
      [],
      [status('bot-review', 'pending')],
      new Set(['bot-review']),
    );
    expect(result.pending).toEqual(['bot-review (pending)']);
  });

  it('flags a failing required commit status', () => {
    const result = evaluateRequiredChecks(
      [],
      [status('bot-review', 'failure')],
      new Set(['bot-review']),
    );
    expect(result.failing).toEqual(['bot-review (failure)']);
  });

  it('evaluates all checks when no required set is known (null)', () => {
    const result = evaluateRequiredChecks(
      [run('some-check', 'failure')],
      [],
      null,
    );
    expect(result.failing).toEqual(['some-check (failure)']);
  });
});
