import { describe, expect, it, jest } from '@jest/globals';

import {
  buildFetchArgs,
  buildFetchResult,
  executeWorktreeFetch,
  type FetchDeps,
  tryRefreshRemoteTrackingRef,
} from './fetch-utils';

describe('buildFetchArgs', () => {
  it('fetches all branches when no branch is given', () => {
    expect(buildFetchArgs('origin')).toEqual(['fetch', 'origin']);
  });

  it('appends a specific branch when provided', () => {
    expect(buildFetchArgs('origin', 'main')).toEqual([
      'fetch',
      'origin',
      'main',
    ]);
  });

  it('trims surrounding whitespace from the branch', () => {
    expect(buildFetchArgs('origin', '  main  ')).toEqual([
      'fetch',
      'origin',
      'main',
    ]);
  });

  it('omits the branch when it is empty or whitespace-only', () => {
    expect(buildFetchArgs('origin', '')).toEqual(['fetch', 'origin']);
    expect(buildFetchArgs('origin', '   ')).toEqual(['fetch', 'origin']);
  });

  it('honors a non-default remote', () => {
    expect(buildFetchArgs('upstream', 'develop')).toEqual([
      'fetch',
      'upstream',
      'develop',
    ]);
  });

  it('inserts --deepen=<n> before the remote when deepen is positive', () => {
    expect(buildFetchArgs('origin', 'main', 200)).toEqual([
      'fetch',
      '--deepen=200',
      'origin',
      'main',
    ]);
  });

  it('omits --deepen when deepen is absent, zero, negative, or non-integer', () => {
    expect(buildFetchArgs('origin', undefined, undefined)).toEqual([
      'fetch',
      'origin',
    ]);
    expect(buildFetchArgs('origin', undefined, 0)).toEqual(['fetch', 'origin']);
    expect(buildFetchArgs('origin', undefined, -5)).toEqual([
      'fetch',
      'origin',
    ]);
    expect(buildFetchArgs('origin', undefined, 1.5)).toEqual([
      'fetch',
      'origin',
    ]);
  });
});

describe('buildFetchResult', () => {
  it('reports upToDate when git produced no output', () => {
    expect(buildFetchResult('origin', undefined, '')).toEqual({
      success: true,
      remote: 'origin',
      branch: null,
      upToDate: true,
      output: '(already up to date)',
    });
  });

  it('treats whitespace-only output as up to date', () => {
    const result = buildFetchResult('origin', undefined, '   \n  ');
    expect(result.upToDate).toBe(true);
    expect(result.output).toBe('(already up to date)');
  });

  it('reports not-upToDate and trims real fetch output', () => {
    const raw =
      '\nFrom github.com:org/repo\n   abc123..def456  main -> origin/main\n';
    const result = buildFetchResult('origin', 'main', raw);
    expect(result).toEqual({
      success: true,
      remote: 'origin',
      branch: 'main',
      upToDate: false,
      output:
        'From github.com:org/repo\n   abc123..def456  main -> origin/main',
    });
  });

  it('echoes the requested branch in the result', () => {
    expect(buildFetchResult('upstream', 'develop', 'updated').branch).toBe(
      'develop',
    );
  });
});

describe('tryRefreshRemoteTrackingRef', () => {
  it('runs git fetch for the given branch and returns true on success', () => {
    const runGit = jest.fn().mockReturnValue('');

    const result = tryRefreshRemoteTrackingRef(
      runGit,
      'claude/LS-4898-fix',
      '/wt',
      30_000,
    );

    expect(runGit).toHaveBeenCalledWith(
      ['fetch', 'origin', 'claude/LS-4898-fix'],
      '/wt',
      { timeout: 30_000 },
    );
    expect(result).toBe(true);
  });

  it('swallows a git fetch failure and returns false instead of throwing', () => {
    const runGit = jest.fn().mockImplementation(() => {
      throw Object.assign(new Error('Command failed: git fetch origin'), {
        status: 128,
        stderr: 'fatal: unable to access remote',
      });
    });

    expect(() =>
      tryRefreshRemoteTrackingRef(runGit, 'claude/LS-4898-fix', '/wt', 30_000),
    ).not.toThrow();
    expect(
      tryRefreshRemoteTrackingRef(runGit, 'claude/LS-4898-fix', '/wt', 30_000),
    ).toBe(false);
  });
});

describe('executeWorktreeFetch', () => {
  const okResolver: FetchDeps['resolveTargetDir'] = () => ({ path: '/wt' });

  it('returns the fetch result on success and invokes git with the right args/cwd', () => {
    const runGit = jest
      .fn<FetchDeps['runGit']>()
      .mockReturnValue(
        'From github.com:org/repo\n   abc123..def456  main -> origin/main',
      );

    const res = executeWorktreeFetch(
      { remote: 'origin', branch: 'main', worktree: 'LS-1' },
      { resolveTargetDir: okResolver, runGit },
    );

    expect(runGit).toHaveBeenCalledWith(['fetch', 'origin', 'main'], '/wt');
    expect(res.isError).toBeUndefined();
    expect(JSON.parse(res.content[0].text)).toEqual({
      success: true,
      remote: 'origin',
      branch: 'main',
      upToDate: false,
      output:
        'From github.com:org/repo\n   abc123..def456  main -> origin/main',
    });
  });

  it('passes deepen through to buildFetchArgs', () => {
    const runGit = jest.fn<FetchDeps['runGit']>().mockReturnValue('');

    executeWorktreeFetch(
      { remote: 'origin', branch: 'main', deepen: 200 },
      { resolveTargetDir: okResolver, runGit },
    );

    expect(runGit).toHaveBeenCalledWith(
      ['fetch', '--deepen=200', 'origin', 'main'],
      '/wt',
    );
  });

  it('defaults the remote to origin and reports upToDate on empty output', () => {
    const runGit = jest.fn<FetchDeps['runGit']>().mockReturnValue('');

    const res = executeWorktreeFetch(
      {},
      { resolveTargetDir: okResolver, runGit },
    );

    expect(runGit).toHaveBeenCalledWith(['fetch', 'origin'], '/wt');
    expect(JSON.parse(res.content[0].text)).toMatchObject({
      remote: 'origin',
      branch: null,
      upToDate: true,
    });
  });

  it('returns an error response when the worktree cannot be resolved', () => {
    const runGit = jest.fn<FetchDeps['runGit']>();
    const res = executeWorktreeFetch(
      { worktree: 'nope' },
      {
        resolveTargetDir: () => ({ error: 'No active worktree set.' }),
        runGit,
      },
    );

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe('No active worktree set.');
    expect(runGit).not.toHaveBeenCalled();
  });

  it('surfaces git stderr and exit code when the fetch fails', () => {
    // execFileSync throws an Error with status/stderr/stdout attached.
    const runGit = jest.fn<FetchDeps['runGit']>().mockImplementation(() => {
      throw Object.assign(new Error('Command failed: git fetch bogus'), {
        status: 128,
        stderr: "fatal: 'bogus' does not appear to be a git repository",
      });
    });

    const res = executeWorktreeFetch(
      { remote: 'bogus' },
      { resolveTargetDir: okResolver, runGit },
    );

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('git fetch failed (exit code 128)');
    expect(res.content[0].text).toContain(
      'does not appear to be a git repository',
    );
  });

  it('falls back to the error message and "unknown" exit code when git throws a bare Error', () => {
    const runGit = jest.fn<FetchDeps['runGit']>().mockImplementation(() => {
      throw new Error('spawn git ENOENT');
    });

    const res = executeWorktreeFetch(
      {},
      { resolveTargetDir: okResolver, runGit },
    );

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain(
      'git fetch failed (exit code unknown)',
    );
    expect(res.content[0].text).toContain('spawn git ENOENT');
  });
});
