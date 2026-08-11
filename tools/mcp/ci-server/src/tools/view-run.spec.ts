import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../github-api.js', () => ({
  githubGet: jest.fn(),
}));

import { viewRun } from './view-run.js';
import * as githubApi from '../github-api.js';

const mockGithubGet = githubApi.githubGet as jest.MockedFunction<
  typeof githubApi.githubGet
>;

interface WorkflowRunFixture {
  id: number;
  run_number: number;
  run_attempt: number;
  conclusion: string | null;
  created_at: string;
  display_title: string;
  event: string;
  head_branch: string;
  head_sha: string;
  name: string;
  started_at: string | null;
  status: string;
  updated_at: string;
  html_url: string;
  workflow_id: number;
}

interface JobFixture {
  id: number;
  run_id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  steps?: Array<{
    name: string;
    status: string;
    conclusion: string | null;
    number: number;
  }>;
}

const passingRun: WorkflowRunFixture = {
  id: 12345,
  run_number: 12345,
  run_attempt: 1,
  conclusion: 'success',
  created_at: '2026-06-20T00:00:00Z',
  display_title: 'feat: add thing',
  event: 'pull_request',
  head_branch: 'claude/foo',
  head_sha: 'abc1234deadbeef',
  name: 'CI Pipeline',
  started_at: '2026-06-20T00:00:10Z',
  status: 'completed',
  updated_at: '2026-06-20T00:03:31Z',
  html_url: 'https://example/run/12345',
  workflow_id: 999,
};

const passingJobs: JobFixture[] = [
  {
    id: 1,
    run_id: 12345,
    name: 'typecheck',
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-06-20T00:00:10Z',
    completed_at: '2026-06-20T00:01:22Z',
  },
  {
    id: 2,
    run_id: 12345,
    name: 'test',
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-06-20T00:01:22Z',
    completed_at: '2026-06-20T00:03:31Z',
  },
  {
    id: 3,
    run_id: 12345,
    name: 'build',
    status: 'completed',
    conclusion: 'skipped',
    started_at: null,
    completed_at: null,
  },
];

const failingRun: WorkflowRunFixture = {
  ...passingRun,
  conclusion: 'failure',
};

const failingJobs: JobFixture[] = [
  passingJobs[0],
  {
    id: 2,
    run_id: 12345,
    name: 'test',
    status: 'completed',
    conclusion: 'failure',
    started_at: '2026-06-20T00:01:22Z',
    completed_at: '2026-06-20T00:03:31Z',
    steps: [
      {
        name: 'checkout',
        status: 'completed',
        conclusion: 'success',
        number: 1,
      },
      {
        name: 'run tests',
        status: 'completed',
        conclusion: 'failure',
        number: 2,
      },
    ],
  },
  passingJobs[2],
];

function mockResponses(
  run: WorkflowRunFixture,
  jobs: JobFixture[] | null,
): void {
  mockGithubGet.mockReset();
  mockGithubGet.mockImplementation(((path: string) => {
    if (path.endsWith('/jobs')) {
      return Promise.resolve({
        total_count: jobs?.length ?? 0,
        jobs: jobs ?? [],
      });
    }
    return Promise.resolve(run);
  }) as typeof githubApi.githubGet);
}

describe('viewRun', () => {
  beforeEach(() => {
    mockGithubGet.mockReset();
  });

  describe('markdown (default)', () => {
    it('renders a passing run summary with job table', async () => {
      mockResponses(passingRun, passingJobs);
      const result = await viewRun({ runId: 12345 });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toMatchSnapshot();
    });

    it('renders a failing run summary with a Failed Jobs section', async () => {
      mockResponses(failingRun, failingJobs);
      const result = await viewRun({ runId: 12345 });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toMatchSnapshot();
    });

    it('omits the job table when includeJobs is false', async () => {
      mockResponses(passingRun, null);
      const result = await viewRun({ runId: 12345, includeJobs: false });
      const text = result.content[0].text;
      expect(text).not.toContain('### Jobs');
      expect(text).toContain('## Run #12345');
    });
  });

  describe('json format', () => {
    it('preserves the existing JSON shape', async () => {
      mockResponses(passingRun, passingJobs);
      const result = await viewRun({ runId: 12345, format: 'json' });
      expect(result.isError).toBeUndefined();
      const payload = JSON.parse(result.content[0].text) as {
        databaseId: number;
        number: number;
        conclusion: string;
        jobs: Array<{ name: string; conclusion: string | null }>;
      };
      expect(payload.databaseId).toBe(12345);
      expect(payload.number).toBe(12345);
      expect(payload.conclusion).toBe('success');
      expect(payload.jobs).toHaveLength(3);
      expect(payload.jobs[0].name).toBe('typecheck');
    });
  });

  describe('token delta', () => {
    it('markdown is materially smaller than json for the same run', async () => {
      mockResponses(failingRun, failingJobs);
      const md = await viewRun({ runId: 12345 });
      mockResponses(failingRun, failingJobs);
      const json = await viewRun({ runId: 12345, format: 'json' });
      const mdLen = md.content[0].text.length;
      const jsonLen = json.content[0].text.length;
      // Markdown should be at least 40% smaller than JSON for the same run.
      expect(mdLen).toBeLessThan(jsonLen * 0.6);
    });
  });

  describe('markdown escaping', () => {
    it('escapes branch / job names so they cannot inject links or break the table', async () => {
      const evilRun: WorkflowRunFixture = {
        ...passingRun,
        head_branch: 'feature/[click](http://evil.example)',
      };
      const evilJobs: JobFixture[] = [
        {
          id: 1,
          run_id: 12345,
          name: 'job|with|pipes',
          status: 'completed',
          conclusion: 'failure',
          started_at: '2026-06-20T00:00:10Z',
          completed_at: '2026-06-20T00:01:22Z',
          steps: [
            {
              name: 'step *with* _markdown_',
              status: 'completed',
              conclusion: 'failure',
              number: 1,
            },
          ],
        },
      ];
      mockResponses(evilRun, evilJobs);
      const result = await viewRun({ runId: 12345 });
      const text = result.content[0].text;
      expect(text).not.toContain('[click](http://evil.example)');
      expect(text).toContain('\\[click\\]');
      expect(text).toContain('job\\|with\\|pipes');
      expect(text).toContain('step \\*with\\* \\_markdown\\_');
    });
  });
});
