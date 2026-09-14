// `pr-scan.ts` transitively imports `auth.ts` → `repo-root.ts`, which uses
// `import.meta.url` and cannot compile under the CommonJS tsconfig the Jest
// preset uses. Mock the GitHub-touching dependencies so jest never tries to
// resolve `repo-root` — the same pattern pr-dashboard.spec.ts uses.
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));
jest.mock('../github-api', () => ({
  githubGraphQL: jest.fn(),
  githubRest: jest.fn(),
}));

import { prScan } from './pr-scan';
import { githubGraphQL } from '../github-api';
import { getRepoOwnerName } from '../auth';
import { FAILED_CONCLUSIONS } from '../types';

const mockedGraphQL = githubGraphQL as jest.MockedFunction<
  typeof githubGraphQL
>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

function checkRun(
  name: string,
  conclusion: string | null,
  status = 'COMPLETED',
) {
  return { __typename: 'CheckRun', name, status, conclusion };
}

function makePR(
  number: number,
  checkNodes: unknown[],
  overrides: Record<string, unknown> = {},
) {
  return {
    number,
    title: 'feat: big feature',
    headRefName: 'claude/branch',
    isDraft: false,
    mergeable: 'MERGEABLE',
    labels: { nodes: [] },
    commits: {
      nodes: [
        {
          commit: {
            statusCheckRollup: {
              contexts: { nodes: checkNodes },
            },
          },
        },
      ],
    },
    ...overrides,
  };
}

interface ParsedScan {
  ciFailing: Array<{
    number: number;
    branch: string;
    failedChecks: string[];
    cancelledChecks?: string[];
  }>;
  ciPending: Array<{
    number: number;
    branch: string;
    cancelledChecks?: string[];
  }>;
  clean: Array<{ number: number; branch: string; cancelledChecks?: string[] }>;
}

async function scanRow(pr: ReturnType<typeof makePR>) {
  mockedGraphQL.mockImplementation((query: string) => {
    if (query.includes('pullRequests(first:')) {
      return Promise.resolve({
        data: { repository: { pullRequests: { nodes: [pr] } } },
        errors: undefined,
      });
    }
    // Batch review-thread detail query — no unresolved threads by default.
    return Promise.resolve({
      data: {
        repository: {
          [`pr_${pr.number}`]: {
            reviewThreads: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [],
            },
          },
        },
      },
      errors: undefined,
    });
  });

  const result = await prScan({ applyLabels: false, compact: true });
  return JSON.parse(result.content[0].text) as ParsedScan;
}

beforeEach(() => {
  mockedRepo.mockResolvedValue({ owner: 'org', name: 'repo' });
});

afterEach(() => jest.resetAllMocks());

describe('prScan — CANCELLED/STALE are not failures (LS-10130, same defect shape as LS-10116)', () => {
  it('does not land a PR in ciFailing when the only non-success check is a cancelled merge-queue attempt', async () => {
    const parsed = await scanRow(
      makePR(7974, [
        checkRun('process-merge-queue', 'CANCELLED'),
        checkRun('build', 'SUCCESS'),
        checkRun('test', 'SUCCESS'),
      ]),
    );

    expect(parsed.ciFailing).toEqual([]);
  });

  it('surfaces the cancelled check via cancelledChecks on the clean bucket rather than dropping it', async () => {
    const parsed = await scanRow(
      makePR(7974, [
        checkRun('process-merge-queue', 'CANCELLED'),
        checkRun('stale-check', 'STALE'),
        checkRun('build', 'SUCCESS'),
      ]),
    );

    expect(parsed.clean).toEqual([
      {
        number: 7974,
        branch: 'claude/branch',
        cancelledChecks: ['process-merge-queue', 'stale-check'],
      },
    ]);
  });

  it('still reports ciPending — not clean — when a cancelled job coexists with an in-flight job', async () => {
    const parsed = await scanRow(
      makePR(7974, [
        checkRun('process-merge-queue', 'CANCELLED'),
        checkRun('build', null, 'IN_PROGRESS'),
      ]),
    );

    expect(parsed.ciFailing).toEqual([]);
    expect(parsed.ciPending).toEqual([
      {
        number: 7974,
        branch: 'claude/branch',
        cancelledChecks: ['process-merge-queue'],
      },
    ]);
  });

  // Negative control: the fix must not turn a genuine failure alongside a
  // cancelled job into a pass.
  it('still reports ciFailing when a cancelled job coexists with a real failure', async () => {
    const parsed = await scanRow(
      makePR(7974, [
        checkRun('process-merge-queue', 'CANCELLED'),
        checkRun('lint', 'FAILURE'),
        checkRun('build', 'SUCCESS'),
      ]),
    );

    expect(parsed.ciFailing).toEqual([
      {
        number: 7974,
        branch: 'claude/branch',
        failedChecks: ['lint'],
        cancelledChecks: ['process-merge-queue'],
      },
    ]);
  });

  it.each([
    'FAILURE',
    'ERROR',
    'TIMED_OUT',
    'ACTION_REQUIRED',
    'STARTUP_FAILURE',
  ])(
    'still reports ciFailing for a genuine %s conclusion',
    async (conclusion) => {
      const parsed = await scanRow(
        makePR(7974, [
          checkRun('build', 'SUCCESS'),
          checkRun('gate', conclusion),
        ]),
      );

      expect(parsed.ciFailing).toEqual([
        { number: 7974, branch: 'claude/branch', failedChecks: ['gate'] },
      ]);
    },
  );

  it('reports clean with no cancelledChecks when every check is green', async () => {
    const parsed = await scanRow(
      makePR(7974, [checkRun('build', 'SUCCESS'), checkRun('test', 'SUCCESS')]),
    );

    expect(parsed.ciFailing).toEqual([]);
    expect(parsed.clean).toEqual([{ number: 7974, branch: 'claude/branch' }]);
  });

  it('does not surface SKIPPED via cancelledChecks, mirroring github_pr_batch_status', async () => {
    const parsed = await scanRow(
      makePR(7974, [
        checkRun('deploy', 'SKIPPED'),
        checkRun('build', 'SUCCESS'),
      ]),
    );

    expect(parsed.ciFailing).toEqual([]);
    expect(parsed.clean).toEqual([{ number: 7974, branch: 'claude/branch' }]);
  });

  it('leaves github_retrigger_check unaffected — FAILED_CONCLUSIONS still treats CANCELLED as retriggerable', () => {
    expect(FAILED_CONCLUSIONS.has('CANCELLED')).toBe(true);
  });
});
