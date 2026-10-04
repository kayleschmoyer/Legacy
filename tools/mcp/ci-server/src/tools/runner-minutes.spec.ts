import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../github-api.js', () => ({
  githubGet: jest.fn(),
}));

import {
  expandCreatedDays,
  isGithubHosted,
  jobRunnerMinutes,
  type RunnerJob,
  runnerMinutes,
} from './runner-minutes.js';
import * as githubApi from '../github-api.js';

const mockGithubGet = githubApi.githubGet as unknown as jest.MockedFunction<
  (path: string, query?: Record<string, string>) => Promise<unknown>
>;

const selfHostedJob = (minutes: number): RunnerJob => ({
  conclusion: 'success',
  started_at: '2026-09-29T10:00:00Z',
  completed_at: new Date(
    Date.parse('2026-09-29T10:00:00Z') + minutes * 60_000,
  ).toISOString(),
  runner_name: 'ci-runner-i-0abc',
  runner_group_name: 'Default',
  labels: ['ci-runner'],
});

const hostedJob = (minutes: number): RunnerJob => ({
  ...selfHostedJob(minutes),
  runner_name: 'GitHub Actions 12',
  runner_group_name: 'GitHub Actions',
  labels: ['ubuntu-latest'],
});

/** Cancelled while queued for 24h: timestamps present, runner_name EMPTY STRING. */
const queuedThenCancelledJob: RunnerJob = {
  conclusion: 'cancelled',
  started_at: '2026-09-29T00:00:00Z',
  completed_at: '2026-09-30T00:00:00Z',
  runner_name: '',
  runner_group_name: '',
  labels: ['android-runner'],
};

const skippedJob: RunnerJob = {
  conclusion: 'skipped',
  started_at: '2026-09-29T10:00:00Z',
  completed_at: '2026-09-29T10:00:00Z',
  runner_name: null,
  labels: [],
};

const run = (id: number, name: string, day = '2026-09-29') => ({
  id,
  name,
  created_at: `${day}T08:00:00Z`,
});

/** Route githubGet by path: run listings vs per-run job listings. */
function mockApi(
  runs: ReturnType<typeof run>[],
  jobsByRun: Record<number, RunnerJob[]>,
) {
  mockGithubGet.mockImplementation((path, query) => {
    const jobsMatch = /^\/actions\/runs\/(\d+)\/jobs$/.exec(path);
    if (jobsMatch) {
      const jobs = jobsByRun[Number(jobsMatch[1])] ?? [];
      return Promise.resolve({ total_count: jobs.length, jobs });
    }
    const dayRuns = runs.filter((r) =>
      r.created_at.startsWith(query?.created ?? ''),
    );
    return Promise.resolve({
      total_count: dayRuns.length,
      workflow_runs: dayRuns,
    });
  });
}

function parse(result: { content: { text: string }[] }) {
  const [summaryLine, ...table] = result.content[0].text.split('\n');
  return {
    summary: JSON.parse(summaryLine) as Record<string, number | string>,
    table: table.join('\n'),
  };
}

describe('jobRunnerMinutes', () => {
  it('counts a job that ran on a runner', () => {
    expect(jobRunnerMinutes(selfHostedJob(12))).toBe(12);
  });

  it('counts 0 for a job cancelled while queued (empty-string runner_name), not 1,440', () => {
    expect(jobRunnerMinutes(queuedThenCancelledJob)).toBe(0);
  });

  it('counts 0 for a null runner_name, a zero duration, and a negative duration', () => {
    expect(jobRunnerMinutes({ ...selfHostedJob(5), runner_name: null })).toBe(
      0,
    );
    expect(jobRunnerMinutes(selfHostedJob(0))).toBe(0);
    expect(jobRunnerMinutes(selfHostedJob(-3))).toBe(0);
  });

  it('counts 0 for a job that has not completed', () => {
    expect(jobRunnerMinutes({ ...selfHostedJob(5), completed_at: null })).toBe(
      0,
    );
  });
});

describe('isGithubHosted', () => {
  it('classifies by runner group, runner name, or standard hosted labels', () => {
    expect(isGithubHosted(hostedJob(1))).toBe(true);
    expect(
      isGithubHosted({
        ...selfHostedJob(1),
        runner_name: 'x',
        runner_group_name: null,
        labels: ['macos-latest'],
      }),
    ).toBe(true);
    expect(isGithubHosted(selfHostedJob(1))).toBe(false);
  });
});

describe('expandCreatedDays', () => {
  it('expands a single day and an inclusive range', () => {
    expect(expandCreatedDays('2026-09-29')).toEqual(['2026-09-29']);
    expect(expandCreatedDays('2026-09-29..2026-10-01')).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
    ]);
  });

  it('rejects malformed, descending, and over-long ranges', () => {
    expect(() => expandCreatedDays('>=2026-09-29')).toThrow(/YYYY-MM-DD/);
    expect(() => expandCreatedDays('2026-09-30..2026-09-29')).toThrow(
      /ascending/,
    );
    expect(() => expandCreatedDays('2026-01-01..2026-03-01')).toThrow(
      /maximum is 31/,
    );
  });
});

describe('runnerMinutes', () => {
  beforeEach(() => {
    mockGithubGet.mockReset();
  });

  it('splits self-hosted vs GitHub-hosted minutes per workflow', async () => {
    mockApi([run(1, 'CI'), run(2, 'CI'), run(3, 'Deploy')], {
      1: [selfHostedJob(10), hostedJob(2)],
      2: [selfHostedJob(5)],
      3: [hostedJob(4)],
    });

    const result = await runnerMinutes({
      created: '2026-09-29',
      groupBy: 'workflow',
    });

    expect(result.isError).toBeUndefined();
    const { summary, table } = parse(result);
    expect(summary).toMatchObject({
      selfHostedMin: 15,
      githubHostedMin: 6,
      runs: 3,
      ranRuns: 3,
      gatedOutRuns: 0,
      queuedNeverRanJobs: 0,
    });
    expect(table).toContain('CI|15|2|3|2');
    expect(table).toContain('Deploy|0|4|1|1');
  });

  it('excludes a job cancelled after queueing 24h instead of reading it as 1,440 minutes', async () => {
    mockApi([run(1, 'Android')], {
      1: [selfHostedJob(7), queuedThenCancelledJob],
    });

    const { summary, table } = parse(
      await runnerMinutes({ created: '2026-09-29', groupBy: 'label' }),
    );

    expect(summary.selfHostedMin).toBe(7);
    expect(summary.queuedNeverRanJobs).toBe(1);
    expect(table).toContain('ci-runner|7|0|1|1');
    expect(table).not.toContain('android-runner');
  });

  it('does not report a gated-out run (every job skipped) as having ran', async () => {
    mockApi([run(1, 'E2E'), run(2, 'E2E')], {
      1: [skippedJob, skippedJob, skippedJob],
      2: [selfHostedJob(20), skippedJob],
    });

    const { summary, table } = parse(
      await runnerMinutes({ created: '2026-09-29', groupBy: 'workflow' }),
    );

    expect(summary).toMatchObject({ runs: 2, ranRuns: 1, gatedOutRuns: 1 });
    // The per-group run count is runs that executed, not runs listed.
    expect(table).toContain('E2E|20|0|1|1');
  });

  it('groups by the run-created day across a range', async () => {
    mockApi([run(1, 'CI', '2026-09-29'), run(2, 'CI', '2026-09-30')], {
      1: [selfHostedJob(3)],
      2: [selfHostedJob(9)],
    });

    const { table } = parse(
      await runnerMinutes({
        created: '2026-09-29..2026-09-30',
        groupBy: 'day',
      }),
    );

    expect(table).toContain('2026-09-30|9|');
    expect(table).toContain('2026-09-29|3|');
  });

  it('paginates run and job listings', async () => {
    const runs = Array.from({ length: 150 }, (_, i) => run(i + 1, 'CI'));
    const manyJobs = Array.from({ length: 120 }, () => selfHostedJob(1));
    mockGithubGet.mockImplementation((path, query) => {
      const page = Number(query?.page ?? 1);
      const slice = <T>(all: T[]) => all.slice((page - 1) * 100, page * 100);
      if (path === '/actions/runs') {
        return Promise.resolve({
          total_count: runs.length,
          workflow_runs: slice(runs),
        });
      }
      const all = path === '/actions/runs/1/jobs' ? manyJobs : [];
      return Promise.resolve({ total_count: all.length, jobs: slice(all) });
    });

    const { summary } = parse(
      await runnerMinutes({ created: '2026-09-29', groupBy: 'workflow' }),
    );

    expect(summary.runs).toBe(150);
    expect(summary.selfHostedMin).toBe(120);
  });

  it('restricts to the given workflows via their per-workflow endpoints', async () => {
    mockApi([run(1, 'CI')], { 1: [selfHostedJob(2)] });

    await runnerMinutes({
      created: '2026-09-29',
      workflows: ['ci.yml'],
      groupBy: 'workflow',
    });

    expect(mockGithubGet).toHaveBeenCalledWith(
      '/actions/workflows/ci.yml/runs',
      expect.objectContaining({ created: '2026-09-29' }),
    );
    expect(mockGithubGet).not.toHaveBeenCalledWith(
      '/actions/runs',
      expect.anything(),
    );
  });

  it('fails with a clear message on a 403 mid-aggregation instead of returning zeros', async () => {
    mockGithubGet.mockImplementation((path) =>
      path === '/actions/runs'
        ? Promise.resolve({
            total_count: 2,
            workflow_runs: [run(1, 'CI'), run(2, 'CI')],
          })
        : Promise.reject(new Error('GitHub API 403: API rate limit exceeded')),
    );

    const result = await runnerMinutes({
      created: '2026-09-29',
      groupBy: 'workflow',
    });

    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toMatch(/no totals returned/);
    expect(text).toMatch(/rate limit/i);
    expect(text).toContain('0/2 runs');
    expect(text).not.toContain('selfHostedMin');
  });

  it('fails rather than undercounting when a day exceeds the 1,000-run listing cap', async () => {
    mockGithubGet.mockResolvedValue({ total_count: 1400, workflow_runs: [] });

    const result = await runnerMinutes({
      created: '2026-09-29',
      groupBy: 'day',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/1000-result listing cap/);
  });

  it('requires created', async () => {
    const result = await runnerMinutes({ groupBy: 'day' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/created is required/);
    expect(mockGithubGet).not.toHaveBeenCalled();
  });
});
