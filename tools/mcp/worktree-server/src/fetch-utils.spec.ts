import { describe, expect, it, jest } from '@jest/globals';

import {
  buildFetchArgs,
  buildFetchResult,
  executeWorktreeFetch,
  type FetchDeps,
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
