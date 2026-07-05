// `pr-dashboard.ts` transitively imports `auth.ts` → `repo-root.ts`, which uses
// `import.meta.url` and cannot compile under the CommonJS tsconfig the Jest
// preset uses. Mock the GitHub-touching dependencies so jest never tries to
// resolve `repo-root` — the same pattern pr-why-blocked.spec.ts uses.
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));
jest.mock('../github-api', () => ({
  githubGraphQL: jest.fn(),
  githubRest: jest.fn(),
}));

import {
  renderDashboardMarkdown,
  type DashboardPayload,
  type DashboardRow,
} from './pr-dashboard';

function row(overrides: Partial<DashboardRow>): DashboardRow {
  return {
    number: 0,
    title: 'PR',
    branch: 'claude/branch',
    base: 'main',
    author: 'user',
    isDraft: false,
    mergeable: 'MERGEABLE',
    hasConflictSignal: false,
    ciStatus: 'pass',
    ciFailingCount: 0,
    hadStaleChecks: false,
    reviewDecision: 'APPROVED',
    unresolvedThreads: 0,
    totalThreads: 0,
    threadCountTruncated: false,
    labels: [],
    updatedAt: '2026-06-20T00:00:00Z',
    url: 'https://github.com/owner/repo/pull/0',
    ...overrides,
  };
}

function payload(rows: DashboardRow[]): DashboardPayload {
  return {
    summary: {
      total: rows.length,
      conflicting: rows.filter((r) => r.hasConflictSignal).length,
      ciFailing: rows.filter((r) => r.ciStatus === 'fail').length,
      ciPending: rows.filter((r) => r.ciStatus === 'pending').length,
      ciPassing: rows.filter((r) => r.ciStatus === 'pass').length,
      withUnresolvedThreads: rows.filter((r) => r.unresolvedThreads > 0).length,
      drafts: rows.filter((r) => r.isDraft).length,
      approved: rows.filter((r) => r.reviewDecision === 'APPROVED').length,
      withStaleChecks: rows.filter((r) => r.hadStaleChecks).length,
    },
    recommendBatchStatus: false,
    prs: rows,
  };
}

// 10 PRs in mixed states — clean approved, ci failing, conflicting,
// changes requested, unresolved threads, pending CI, no review yet, etc.
const FIXTURE_ROWS: DashboardRow[] = [
  row({
    number: 1001,
    title: 'feat(stats): add weekly leaders panel',
    branch: 'claude/ls-1001-weekly-leaders',
  }),
  row({
    number: 1002,
    title: 'fix(auth): handle expired refresh tokens',
    branch: 'claude/ls-1002-refresh',
    ciStatus: 'fail',
    ciFailingCount: 2,
    reviewDecision: 'CHANGES_REQUESTED',
    unresolvedThreads: 3,
  }),
  row({
    number: 1003,
    title: 'chore(deps): bump zod to 3.24',
    branch: 'dependabot/npm_and_yarn/zod-3.24.0',
    mergeable: 'CONFLICTING',
    hasConflictSignal: true,
    ciStatus: 'pass',
    reviewDecision: null,
  }),
  row({
    number: 1004,
    title: 'feat(design): standings page redesign',
    branch: 'claude/ls-1004-standings',
    ciStatus: 'pending',
    reviewDecision: 'REVIEW_REQUIRED',
  }),
  row({
    number: 1005,
    title: 'refactor(graphql): consolidate fragments',
    branch: 'claude/ls-1005-fragments',
    ciStatus: 'pass',
    reviewDecision: 'APPROVED',
    unresolvedThreads: 1,
  }),
  row({
    number: 1006,
    title: 'fix(web): hydration mismatch on /scores',
    branch: 'claude/ls-1006-hydration',
    ciStatus: 'fail',
    ciFailingCount: 1,
    reviewDecision: 'APPROVED',
  }),
  row({
    number: 1007,
    title: 'feat(api): add /api/standings endpoint',
    branch: 'claude/ls-1007-standings-api',
    ciStatus: 'none',
    reviewDecision: null,
  }),
  row({
    number: 1008,
    title:
      'docs(architecture): document the multi-sport sport discriminator across the data model',
    branch: 'claude/ls-1008-multi-sport-docs',
    ciStatus: 'pass',
    reviewDecision: 'APPROVED',
    hadStaleChecks: true,
  }),
  row({
    number: 1009,
    title: 'feat(mobile): add favorites tab',
    branch: 'claude/ls-1009-favorites',
    ciStatus: 'pass',
    reviewDecision: 'REVIEW_REQUIRED',
    unresolvedThreads: 2,
    threadCountTruncated: true,
  }),
  row({
    number: 1010,
    title: 'fix(db): migration for nullable team_id',
    branch: 'claude/ls-1010-team-id-nullable',
    ciStatus: 'fail',
    ciFailingCount: 4,
    mergeable: 'CONFLICTING',
    hasConflictSignal: true,
    reviewDecision: 'CHANGES_REQUESTED',
    unresolvedThreads: 7,
  }),
];

describe('renderDashboardMarkdown', () => {
  it('renders a 10-PR mixed-state fixture as markdown (snapshot)', () => {
    const p = payload(FIXTURE_ROWS);
    p.draftsExcluded = 2;
    p.recommendBatchStatus = true;
    p.note =
      '1 PR(s) had stale CI checks that were deduplicated (#1008). Use github_pr_batch_status for job-level CI details on these PRs.';

    expect(renderDashboardMarkdown(p)).toMatchSnapshot();
  });

  it('renders an empty dashboard with summary line and friendly message', () => {
    const p: DashboardPayload = {
      summary: {
        total: 0,
        conflicting: 0,
        ciFailing: 0,
        ciPending: 0,
        ciPassing: 0,
        withUnresolvedThreads: 0,
        drafts: 0,
        approved: 0,
        withStaleChecks: 0,
      },
      recommendBatchStatus: false,
      prs: [],
      message: 'No PRs found matching filters.',
    };
    const md = renderDashboardMarkdown(p);
    expect(md).toContain('## PR Dashboard — 0 open, 0 draft, 0 blocked');
    expect(md).toContain('No PRs found matching filters.');
    expect(md).not.toContain('| PR |');
  });

  it('Blocked PRs section lists every PR with a real blocker reason', () => {
    const md = renderDashboardMarkdown(payload(FIXTURE_ROWS));
    expect(md).toContain('### Blocked PRs');
    // #1002: 2 CI failures, 3 unresolved threads, changes requested
    expect(md).toMatch(
      /- #1002 — 2 CI failures, 3 unresolved threads, changes requested/,
    );
    // #1003: merge conflict only
    expect(md).toMatch(/- #1003 — merge conflict/);
    // #1005: 1 unresolved thread
    expect(md).toMatch(/- #1005 — 1 unresolved thread/);
    // #1010: every blocker
    expect(md).toMatch(
      /- #1010 — merge conflict, 4 CI failures, 7 unresolved threads, changes requested/,
    );
    // Clean PRs do not appear
    expect(md).not.toMatch(/- #1001 —/);
  });

  it('summary header counts open/draft/blocked correctly', () => {
    const md = renderDashboardMarkdown(payload(FIXTURE_ROWS));
    // 10 total, 0 drafts (drafts excluded by default), 6 blocked
    // (#1002, #1003, #1005, #1006, #1009, #1010)
    expect(md.split('\n')[0]).toBe(
      '## PR Dashboard — 10 open, 0 draft, 6 blocked',
    );
  });

  it('Ready? column is only Yes when mergeable + ci pass + 0 threads + approved', () => {
    const md = renderDashboardMarkdown(payload(FIXTURE_ROWS));
    const lines = md.split('\n');
    // #1001 — fully clean → Yes
    const r1001 = lines.find((l) => l.startsWith('| #1001 '));
    expect(r1001).toMatch(/\| Yes \|$/);
    // #1005 — approved but has unresolved thread → No
    const r1005 = lines.find((l) => l.startsWith('| #1005 '));
    expect(r1005).toMatch(/\| No \|$/);
    // #1006 — approved + CI fail → No
    const r1006 = lines.find((l) => l.startsWith('| #1006 '));
    expect(r1006).toMatch(/\| No \|$/);
  });

  it('treats a label/check conflict signal as blocking even when mergeable reads MERGEABLE', () => {
    // Stale-GraphQL scenario: the deterministic CI: Conflicts label / failing
    // "No Merge Conflicts" check fired, but GitHub's lazy mergeable field has
    // not caught up yet.
    const md = renderDashboardMarkdown(
      payload([
        row({
          number: 3001,
          title: 'fix(web): stale mergeable with conflict label',
          branch: 'claude/ls-3001-stale',
          mergeable: 'MERGEABLE',
          hasConflictSignal: true,
          reviewDecision: 'APPROVED',
        }),
      ]),
    );
    expect(md).toMatch(/- #3001 — merge conflict/);
    const r3001 = md.split('\n').find((l) => l.startsWith('| #3001 '));
    expect(r3001).toMatch(/\| No \|$/);
  });

  it('markdown output is at least 40% smaller than the JSON payload', () => {
    const p = payload(FIXTURE_ROWS);
    p.draftsExcluded = 2;
    p.recommendBatchStatus = true;
    p.note =
      '1 PR(s) had stale CI checks that were deduplicated (#1008). Use github_pr_batch_status for job-level CI details on these PRs.';
    const jsonOut = JSON.stringify(p, null, 2);
    const mdOut = renderDashboardMarkdown(p);
    const reduction = 1 - mdOut.length / jsonOut.length;
    // eslint-disable-next-line no-console
    console.log(
      `[pr-dashboard] markdown=${mdOut.length}B json=${jsonOut.length}B reduction=${(reduction * 100).toFixed(1)}%`,
    );
    expect(reduction).toBeGreaterThanOrEqual(0.4);
  });

  it('escapes pipe characters and collapses newlines inside cells', () => {
    const md = renderDashboardMarkdown(
      payload([
        row({
          number: 2001,
          title: 'feat(pipe|test): handle a | character\nin titles',
          branch: 'claude/pipe',
        }),
      ]),
    );
    // Pipe in title is escaped; newline collapsed to space.
    expect(md).toContain('feat(pipe\\|test): handle a \\| character in titles');
  });
});
