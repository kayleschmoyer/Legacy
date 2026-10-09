jest.mock('../github-api', () => ({
  githubRest: jest.fn(),
}));

jest.mock('../auth', () => ({
  getRepoOwnerName: jest.fn(),
}));

jest.mock('../pr-utils', () => ({
  resolveHeadShaFromPrNumber: jest.fn(),
}));

import { getCheckRuns } from './get-check-runs';

const { githubRest: mockGithubRest } = jest.requireMock<{
  githubRest: jest.Mock;
}>('../github-api');
const { getRepoOwnerName: mockGetRepoOwnerName } = jest.requireMock<{
  getRepoOwnerName: jest.Mock;
}>('../auth');
const { resolveHeadShaFromPrNumber: mockResolveHeadSha } = jest.requireMock<{
  resolveHeadShaFromPrNumber: jest.Mock;
}>('../pr-utils');

function makeRun(name: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name,
    status: 'completed',
    conclusion: 'success',
    started_at: null,
    completed_at: null,
    output: { title: null, summary: null },
    app: { slug: 'github-actions', name: 'GitHub Actions' },
    ...overrides,
  };
}

function pageOnce(runs: ReturnType<typeof makeRun>[]) {
  return { total_count: runs.length, check_runs: runs };
}

function parse(text: string) {
  return JSON.parse(text) as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRepoOwnerName.mockResolvedValue({
    owner: 'bkrupa',
    name: 'legacy-sports',
  });
});

describe('getCheckRuns single-sha path', () => {
  it('returns all runs for an explicit sha', async () => {
    mockGithubRest.mockResolvedValueOnce(
      pageOnce([makeRun('bot-review'), makeRun('Build')]),
    );

    const result = await getCheckRuns({ sha: 'abc123' });
    expect(result.isError).toBeFalsy();
    // Single-sha results render as a token-efficient Markdown table (LS-8021):
    // a header line plus one row per run.
    const text = result.content[0].text;
    expect(text).toContain('total: 2');
    expect(text).toContain('bot-review');
    expect(text).toContain('Build');
    expect(text).not.toContain('missing');
  });

  it('includes id and startedAt in each row (LS-10154)', async () => {
    mockGithubRest.mockResolvedValueOnce(
      pageOnce([
        makeRun('bot-review', { id: 4242, started_at: '2026-09-13T10:00:00Z' }),
      ]),
    );

    const result = await getCheckRuns({ sha: 'abc123' });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain('4242');
    expect(text).toContain('2026-09-13T10:00:00Z');
  });

  it('collapses to the latest run per name by default when a check name repeats', async () => {
    mockGithubRest.mockResolvedValueOnce(
      pageOnce([
        makeRun('Run Integration Suite', {
          id: 2,
          started_at: '2026-09-13T12:00:00Z',
        }),
        makeRun('Run Integration Suite', {
          id: 1,
          started_at: '2026-09-13T10:00:00Z',
        }),
        makeRun('Build', { id: 3 }),
      ]),
    );

    const result = await getCheckRuns({ sha: 'abc123' });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain('total: 2');
  });

  it('returns every re-run attempt when latestPerName is false', async () => {
    mockGithubRest.mockResolvedValueOnce(
      pageOnce([
        makeRun('Run Integration Suite', {
          id: 2,
          started_at: '2026-09-13T12:00:00Z',
        }),
        makeRun('Run Integration Suite', {
          id: 1,
          started_at: '2026-09-13T10:00:00Z',
        }),
      ]),
    );

    const result = await getCheckRuns({ sha: 'abc123', latestPerName: false });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain('total: 2');
  });

  it('resolves PR number to head SHA when sha is omitted', async () => {
    mockResolveHeadSha.mockResolvedValueOnce('headsha1');
    mockGithubRest.mockResolvedValueOnce(pageOnce([makeRun('bot-review')]));

    const result = await getCheckRuns({ prNumber: 99 });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain('headsha'); // sha.slice(0, 7)
    expect(text).toContain('PR #99');
    expect(text).toContain('bot-review');
  });

  it('errors when neither sha, shas, nor prNumber is provided', async () => {
    const result = await getCheckRuns({});
    expect(result.isError).toBe(true);
  });

  it('returns an error result when the REST call throws', async () => {
    mockGithubRest.mockRejectedValueOnce(new Error('boom'));
    const result = await getCheckRuns({ sha: 'bad' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('boom');
  });

  it('filters checkName as a case-insensitive substring against the full display name', async () => {
    mockGithubRest.mockResolvedValueOnce(
      pageOnce([
        makeRun('🚀 CI Pipeline / lint', { conclusion: 'failure' }),
        makeRun('🚀 CI Pipeline / custom-checks'),
        makeRun('bot-review'),
      ]),
    );

    const result = await getCheckRuns({ sha: 'abc123', checkName: 'LINT' });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain('total: 1');
    expect(text).toContain('🚀 CI Pipeline / lint');
    expect(text).not.toContain('custom-checks');
    expect(text).not.toContain('bot-review');
  });

  it('lists available check names when checkName matches nothing but the sha has runs', async () => {
    mockGithubRest.mockResolvedValueOnce(
      pageOnce([makeRun('🚀 CI Pipeline / lint'), makeRun('bot-review')]),
    );

    const result = await getCheckRuns({
      sha: 'abc123',
      checkName: 'nonexistent',
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain('No check runs matching "nonexistent"');
    expect(text).toContain('🚀 CI Pipeline / lint');
    expect(text).toContain('bot-review');
  });
});

describe('getCheckRuns batch mode', () => {
  it('returns { checkRuns: { [sha]: ... } } for multiple shas', async () => {
    mockGithubRest.mockImplementation(({ path }: { path: string }) => {
      if (path.includes('/sha_a/')) return pageOnce([makeRun('bot-review')]);
      if (path.includes('/sha_b/')) return pageOnce([makeRun('Build')]);
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await getCheckRuns({ shas: ['sha_a', 'sha_b'] });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content[0].text);
    expect(Object.keys(body.checkRuns as object).sort()).toEqual([
      'sha_a',
      'sha_b',
    ]);
    expect((body.checkRuns as Record<string, unknown[]>).sha_a).toHaveLength(1);
    expect((body.checkRuns as Record<string, unknown[]>).sha_b).toHaveLength(1);
    expect(body.missing).toEqual([]);
    const [runA] = (body.checkRuns as Record<string, { id: number }[]>).sha_a;
    expect(runA.id).toBe(1);
  });

  it('isolates per-sha failures to missing[]', async () => {
    mockGithubRest.mockImplementation(({ path }: { path: string }) => {
      if (path.includes('/good/')) return pageOnce([makeRun('bot-review')]);
      throw new Error(`404 for ${path}`);
    });

    const result = await getCheckRuns({ shas: ['good', 'bad'] });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content[0].text);
    expect((body.checkRuns as Record<string, unknown>).good).toBeDefined();
    expect((body.checkRuns as Record<string, unknown>).bad).toBeUndefined();
    expect(body.missing).toHaveLength(1);
    expect((body.missing as { sha: string }[])[0].sha).toBe('bad');
  });

  it('caps concurrency at 5', async () => {
    let inFlight = 0;
    let peak = 0;
    mockGithubRest.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return pageOnce([]);
    });

    const shas = Array.from({ length: 20 }, (_, i) => `sha${i}`);
    const result = await getCheckRuns({ shas });
    expect(result.isError).toBeFalsy();
    expect(peak).toBeLessThanOrEqual(5);
    expect(peak).toBeGreaterThan(1);
  });

  it('reports noMatch with available names when checkName filters out all runs for a sha', async () => {
    mockGithubRest.mockImplementation(({ path }: { path: string }) => {
      if (path.includes('/sha_a/'))
        return pageOnce([makeRun('🚀 CI Pipeline / lint')]);
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await getCheckRuns({
      shas: ['sha_a'],
      checkName: 'nonexistent',
    });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content[0].text);
    expect((body.checkRuns as Record<string, unknown[]>).sha_a).toHaveLength(0);
    expect(body.noMatch).toEqual([
      {
        sha: 'sha_a',
        checkName: 'nonexistent',
        available: ['🚀 CI Pipeline / lint'],
      },
    ]);
  });

  it('takes precedence over single-sha params', async () => {
    mockGithubRest.mockResolvedValue(pageOnce([]));
    const result = await getCheckRuns({
      sha: 'singleton',
      shas: ['batch_a'],
    });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content[0].text);
    expect(body).toHaveProperty('checkRuns');
    expect((body.checkRuns as Record<string, unknown>).batch_a).toBeDefined();
    expect(body).not.toHaveProperty('sha');
  });
});

describe('getCheckRuns status/onlyFailing filters (LS-10285)', () => {
  const runs = () =>
    pageOnce([
      makeRun('queued-job', { id: 1, status: 'queued', conclusion: null }),
      makeRun('running-job', {
        id: 2,
        status: 'in_progress',
        conclusion: null,
      }),
      makeRun('ok-job', { id: 3 }),
      makeRun('bad-job', { id: 4, conclusion: 'failure' }),
      makeRun('cancelled-job', { id: 5, conclusion: 'cancelled' }),
      makeRun('timeout-job', { id: 6, conclusion: 'timed_out' }),
      makeRun('skipped-job', { id: 7, conclusion: 'skipped' }),
    ]);

  it('status: incomplete returns only queued/in_progress runs', async () => {
    mockGithubRest.mockResolvedValueOnce(runs());
    const text = (await getCheckRuns({ sha: 'abc', status: 'incomplete' }))
      .content[0].text;
    expect(text).toContain('total: 2');
    expect(text).toContain('queued-job');
    expect(text).toContain('running-job');
    expect(text).not.toContain('ok-job');
    expect(text).not.toContain('bad-job');
  });

  it('status: completed excludes unfinished runs', async () => {
    mockGithubRest.mockResolvedValueOnce(runs());
    const text = (await getCheckRuns({ sha: 'abc', status: 'completed' }))
      .content[0].text;
    expect(text).toContain('total: 5');
    expect(text).not.toContain('queued-job');
  });

  it('status: queued matches exactly', async () => {
    mockGithubRest.mockResolvedValueOnce(runs());
    const text = (await getCheckRuns({ sha: 'abc', status: 'queued' }))
      .content[0].text;
    expect(text).toContain('total: 1');
    expect(text).not.toContain('running-job');
  });

  it('onlyFailing returns failure, cancelled and timed_out runs only', async () => {
    mockGithubRest.mockResolvedValueOnce(runs());
    const text = (await getCheckRuns({ sha: 'abc', onlyFailing: true }))
      .content[0].text;
    expect(text).toContain('total: 3');
    expect(text).toContain('bad-job');
    expect(text).toContain('cancelled-job');
    expect(text).toContain('timeout-job');
    expect(text).not.toContain('ok-job');
    expect(text).not.toContain('skipped-job');
    expect(text).not.toContain('queued-job');
  });

  it('explains an empty result caused by the state filter', async () => {
    mockGithubRest.mockResolvedValueOnce(pageOnce([makeRun('ok-job')]));
    const text = (await getCheckRuns({ sha: 'abc', onlyFailing: true }))
      .content[0].text;
    expect(text).toContain('No check runs match the status/onlyFailing filter');
    expect(text).toContain('1 run(s) before filtering');
  });

  it('applies filters per sha in batch mode', async () => {
    mockGithubRest.mockResolvedValueOnce(runs());
    const body = parse(
      (await getCheckRuns({ shas: ['a'], onlyFailing: true })).content[0].text,
    );
    const names = (
      (body.checkRuns as Record<string, { name: string }[]>).a ?? []
    ).map((r) => r.name);
    expect(names).toEqual(['bad-job', 'cancelled-job', 'timeout-job']);
  });
});
