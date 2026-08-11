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
  type DashboardPayload,
  type DashboardRow,
  prDashboard,
  renderDashboardMarkdown,
} from './pr-dashboard';
import { getRepoOwnerName } from '../auth';
import { githubGraphQL } from '../github-api';

const mockedGraphQL = githubGraphQL as jest.MockedFunction<
  typeof githubGraphQL
>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

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
    truncated: false,
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
      truncated: false,
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

  it('appends a truncation footer note when payload.truncated is true', () => {
    const p = payload(FIXTURE_ROWS);
    p.truncated = true;
    const md = renderDashboardMarkdown(p);
    expect(md).toContain(
      'more PRs exist beyond this page — re-run with a higher limit or narrower filters',
    );
  });
});

// LS-8196: prDashboard() fetch-loop pagination (AC5/AC6) — modeled on
// list-prs.spec.ts's page()/prNode() helpers and multi-page test shape.
function prNode(overrides: Record<string, unknown> = {}) {
  return {
    number: 42,
    title: 'feat(x): do the thing',
    state: 'OPEN',
    headRefName: 'claude/branch',
    baseRefName: 'main',
    author: { login: 'alice' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    url: 'https://github.com/o/r/pull/42',
    labels: { nodes: [] },
    isDraft: false,
    mergeable: 'MERGEABLE',
    reviewDecision: 'APPROVED',
    commits: { nodes: [{ commit: { oid: 'sha' } }] },
    ...overrides,
  };
}

function repoPage(
  nodes: unknown[],
  hasNextPage: boolean,
  endCursor: string | null = null,
) {
  return {
    data: {
      repository: {
        pullRequests: {
          pageInfo: { hasNextPage, endCursor },
          nodes,
        },
      },
    },
  };
}

function searchPage(
  nodes: unknown[],
  hasNextPage: boolean,
  endCursor: string | null = null,
) {
  return {
    data: {
      search: {
        pageInfo: { hasNextPage, endCursor },
        nodes,
      },
    },
  };
}

function jsonPayload(
  result: Awaited<ReturnType<typeof prDashboard>>,
): DashboardPayload {
  return JSON.parse(result.content[0].text) as DashboardPayload;
}

describe('prDashboard fetch loop (LS-8196)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRepo.mockResolvedValue({ owner: 'o', name: 'r' });
  });

  it('aggregates rows across multiple pages for the default (repository.pullRequests) path', async () => {
    mockedGraphQL
      .mockResolvedValueOnce(
        repoPage([prNode({ number: 1 }), prNode({ number: 2 })], true, 'c1'),
      )
      .mockResolvedValueOnce(
        repoPage([prNode({ number: 3 }), prNode({ number: 4 })], false),
      );

    const result = await prDashboard({ limit: 10, format: 'json' });
    const payload = jsonPayload(result);

    expect(payload.prs.map((p) => p.number).sort()).toEqual([1, 2, 3, 4]);
    expect(payload.truncated).toBe(false);
  });

  it('flags truncated when the aggregated count reaches limit while hasNextPage is still true (default path)', async () => {
    mockedGraphQL.mockResolvedValueOnce(
      repoPage([prNode({ number: 1 }), prNode({ number: 2 })], true, 'c1'),
    );

    const result = await prDashboard({ limit: 2, format: 'json' });
    const payload = jsonPayload(result);

    expect(payload.prs.map((p) => p.number)).toEqual([1, 2]);
    expect(payload.truncated).toBe(true);
  });

  it('aggregates rows across multiple pages for the author-filtered search() path', async () => {
    mockedGraphQL
      .mockResolvedValueOnce(
        searchPage(
          [prNode({ number: 11 }), prNode({ number: 12 })],
          true,
          'c1',
        ),
      )
      .mockResolvedValueOnce(
        searchPage([prNode({ number: 13 }), prNode({ number: 14 })], false),
      );

    const result = await prDashboard({
      author: 'alice',
      limit: 10,
      format: 'json',
    });
    const payload = jsonPayload(result);

    expect(payload.prs.map((p) => p.number).sort()).toEqual([11, 12, 13, 14]);
    expect(payload.truncated).toBe(false);
  });

  it('flags truncated when the aggregated count reaches limit while hasNextPage is still true (search path)', async () => {
    mockedGraphQL.mockResolvedValueOnce(
      searchPage([prNode({ number: 11 }), prNode({ number: 12 })], true, 'c1'),
    );

    const result = await prDashboard({
      author: 'alice',
      limit: 2,
      format: 'json',
    });
    const payload = jsonPayload(result);

    expect(payload.prs.map((p) => p.number)).toEqual([11, 12]);
    expect(payload.truncated).toBe(true);
  });
});

// ── prDashboard() fetch pagination (LS-7857) ────────────────────────────────
// Reuses the prNode()/repoPage()/jsonPayload() helpers from the LS-8196 block
// above. `../auth` and `../github-api` are already fully mocked, so calling
// prDashboard() directly works — evaluatePRChecks (imported from
// `../required-checks`, which itself imports the same mocked `githubRest`)
// fails harmlessly per-PR and is swallowed by prDashboard's own try/catch,
// leaving `ciStatus: 'none'` on every row, which these tests don't assert on.
// Likewise the review-thread-count batch query (also routed through the
// shared `githubGraphQL` mock) falls through to an unmocked call after the
// queued page responses are exhausted, which fetchReviewThreadCounts's own
// per-batch try/catch swallows — harmless for tests that only assert on
// `prs`/`truncated`/error text.
describe('prDashboard fetch pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRepo.mockResolvedValue({ owner: 'o', name: 'r' });
  });

  it('chunks the main pullRequests query into <=30-PR pages and merges results in order', async () => {
    const page1Nodes = Array.from({ length: 30 }, (_, i) =>
      prNode({ number: i + 1 }),
    );
    const page2Nodes = Array.from({ length: 10 }, (_, i) =>
      prNode({ number: i + 31 }),
    );
    mockedGraphQL
      .mockResolvedValueOnce(repoPage(page1Nodes, true, 'cursor-1'))
      .mockResolvedValueOnce(repoPage(page2Nodes, false));

    const result = await prDashboard({
      state: 'all',
      limit: 40,
      format: 'json',
    });
    const payload = jsonPayload(result);

    // Two chunked calls for the main query (first:30/after:null, then
    // first:10/after:'cursor-1'), each ≤ PAGE_SIZE (30).
    const mainQueryCalls = mockedGraphQL.mock.calls.filter(([q]) =>
      q.includes('pullRequests('),
    );
    expect(mainQueryCalls).toHaveLength(2);
    expect(mainQueryCalls[0][1]).toMatchObject({ first: 30, after: null });
    expect(mainQueryCalls[1][1]).toMatchObject({
      first: 10,
      after: 'cursor-1',
    });

    expect(payload.prs).toHaveLength(40);
    expect(payload.prs[0].number).toBe(1);
    expect(payload.prs[39].number).toBe(40);
  });

  it('issues a single main-query call for a limit within one page (no regression)', async () => {
    const nodes = Array.from({ length: 5 }, (_, i) =>
      prNode({ number: i + 1 }),
    );
    mockedGraphQL.mockResolvedValueOnce(repoPage(nodes, false));

    const result = await prDashboard({ format: 'json' });
    const payload = jsonPayload(result);

    const mainQueryCalls = mockedGraphQL.mock.calls.filter(([q]) =>
      q.includes('pullRequests('),
    );
    expect(mainQueryCalls).toHaveLength(1);
    expect(mainQueryCalls[0][1]).toMatchObject({ first: 30, after: null });
    expect(payload.prs).toHaveLength(5);
  });

  it('returns a structured, actionable error when 504 retries are exhausted', async () => {
    mockedGraphQL.mockRejectedValueOnce(
      new Error(
        "GitHub GraphQL failed (504): We couldn't respond to your request in time.",
      ),
    );

    const result = await prDashboard({ state: 'all', limit: 60 });

    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toContain('github_list_prs');
    expect(text).not.toBe(
      "Failed to build PR dashboard: GitHub GraphQL failed (504): We couldn't respond to your request in time.",
    );
  });
});
