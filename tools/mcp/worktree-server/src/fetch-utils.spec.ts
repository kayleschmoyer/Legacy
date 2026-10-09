import { describe, expect, it, jest } from '@jest/globals';

import {
  buildFetchArgs,
  buildFetchResult,
  computeRemoteDivergence,
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

  it('inserts --unshallow before the remote when unshallow is true', () => {
    expect(buildFetchArgs('origin', 'main', undefined, true)).toEqual([
      'fetch',
      '--unshallow',
      'origin',
      'main',
    ]);
  });

  it('prefers --unshallow over --deepen when both are somehow passed', () => {
    expect(buildFetchArgs('origin', undefined, 200, true)).toEqual([
      'fetch',
      '--unshallow',
      'origin',
    ]);
  });

  it('omits --unshallow when false or absent', () => {
    expect(buildFetchArgs('origin', undefined, undefined, false)).toEqual([
      'fetch',
      'origin',
    ]);
  });
});

describe('buildFetchResult', () => {
  it('falls back to output-text guessing when divergence could not be computed', () => {
    expect(buildFetchResult('origin', undefined, '', null, false, 50)).toEqual({
      success: true,
      remote: 'origin',
      branch: null,
      upToDate: true,
      ahead: null,
      behind: null,
      output: '(already up to date)',
      isShallow: false,
      commitCount: 50,
    });
  });

  it('treats whitespace-only output as up to date when divergence is unknown', () => {
    const result = buildFetchResult(
      'origin',
      undefined,
      '   \n  ',
      null,
      false,
      50,
    );
    expect(result.upToDate).toBe(true);
    expect(result.output).toBe('(already up to date)');
  });

  it('reports not-upToDate and trims real fetch output when divergence is unknown', () => {
    const raw =
      '\nFrom github.com:org/repo\n   abc123..def456  main -> origin/main\n';
    const result = buildFetchResult('origin', 'main', raw, null, false, 7978);
    expect(result).toEqual({
      success: true,
      remote: 'origin',
      branch: 'main',
      upToDate: false,
      ahead: null,
      behind: null,
      output:
        'From github.com:org/repo\n   abc123..def456  main -> origin/main',
      isShallow: false,
      commitCount: 7978,
    });
  });

  it('echoes the requested branch in the result', () => {
    expect(
      buildFetchResult('upstream', 'develop', 'updated', null, false, 10)
        .branch,
    ).toBe('develop');
  });

  it('surfaces shallow state and commit count', () => {
    const result = buildFetchResult('origin', undefined, '', null, true, 50);
    expect(result.isShallow).toBe(true);
    expect(result.commitCount).toBe(50);
  });

  it('passes through a null commitCount when it could not be determined', () => {
    const result = buildFetchResult('origin', undefined, '', null, false, null);
    expect(result.commitCount).toBeNull();
  });

  it('prefers real divergence over the output-text guess, including when output is misleadingly empty (LS-10084)', () => {
    // Reproduces the bug: git fetch's update-summary lines went to stderr and
    // never reached `rawOutput`, so the old heuristic reported upToDate:
    // true even though the branch was 24 commits behind its remote.
    const result = buildFetchResult(
      'origin',
      'feature',
      '',
      { ahead: 0, behind: 24 },
      false,
      null,
    );
    expect(result.upToDate).toBe(false);
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(24);
  });

  it('reports upToDate: true from real divergence of {0, 0}', () => {
    const result = buildFetchResult(
      'origin',
      'feature',
      '',
      { ahead: 0, behind: 0 },
      false,
      null,
    );
    expect(result.upToDate).toBe(true);
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
  });
});

describe('computeRemoteDivergence', () => {
  const cwd = '/wt';

  it('returns null when the branch cannot be resolved and none is given (detached HEAD)', () => {
    const runGit = jest.fn<FetchDeps['runGit']>().mockReturnValue('HEAD');

    expect(
      computeRemoteDivergence(runGit, cwd, 'origin', undefined),
    ).toBeNull();
  });

  it('returns null when the local branch has no remote-tracking ref', () => {
    const runGit = jest.fn<FetchDeps['runGit']>().mockImplementation((args) => {
      if (args[0] === 'rev-parse' && args.includes('feature')) return 'abc123';
      throw Object.assign(new Error('unknown revision'), { status: 128 });
    });

    expect(
      computeRemoteDivergence(runGit, cwd, 'origin', 'feature'),
    ).toBeNull();
  });

  it('returns {ahead: 0, behind: 0} when local and remote SHAs match, without shelling out to rev-list', () => {
    const runGit = jest.fn<FetchDeps['runGit']>().mockReturnValue('abc123');

    const result = computeRemoteDivergence(runGit, cwd, 'origin', 'feature');

    expect(result).toEqual({ ahead: 0, behind: 0 });
    expect(runGit).not.toHaveBeenCalledWith(
      expect.arrayContaining(['rev-list']),
      cwd,
      expect.anything(),
    );
  });

  it('computes real ahead/behind via rev-list --count against the remote-tracking ref', () => {
    const runGit = jest.fn<FetchDeps['runGit']>().mockImplementation((args) => {
      if (args[1] === '--verify' && args[2] === 'feature') return 'local-sha';
      if (args[1] === '--verify' && args[2] === 'origin/feature')
        return 'remote-sha';
      if (args.join(' ') === 'rev-list --count origin/feature..feature')
        return '0';
      if (args.join(' ') === 'rev-list --count feature..origin/feature')
        return '24';
      throw new Error(`unexpected git args: ${args.join(' ')}`);
    });

    expect(computeRemoteDivergence(runGit, cwd, 'origin', 'feature')).toEqual({
      ahead: 0,
      behind: 24,
    });
  });

  it('resolves the current branch via rev-parse --abbrev-ref HEAD when no branch is given', () => {
    const runGit = jest.fn<FetchDeps['runGit']>().mockImplementation((args) => {
      if (args.join(' ') === 'rev-parse --abbrev-ref HEAD') return 'feature';
      if (args.join(' ') === 'rev-parse --verify feature') return 'same-sha';
      if (args.join(' ') === 'rev-parse --verify origin/feature')
        return 'same-sha';
      throw new Error(`unexpected git args: ${args.join(' ')}`);
    });

    expect(computeRemoteDivergence(runGit, cwd, 'origin', undefined)).toEqual({
      ahead: 0,
      behind: 0,
    });
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

  it('returns the fetch result on success, invokes git with the right args/cwd, and reports real divergence plus shallow state', () => {
    const runGit = jest
      .fn<FetchDeps['runGit']>()
      .mockImplementation((args: string[]) => {
        if (args[0] === 'fetch') {
          return 'From github.com:org/repo\n   abc123..def456  main -> origin/main';
        }
        if (args.join(' ') === 'rev-parse --verify main') return 'local-sha';
        if (args.join(' ') === 'rev-parse --verify origin/main')
          return 'remote-sha';
        if (args.join(' ') === 'rev-list --count origin/main..main') return '0';
        if (args.join(' ') === 'rev-list --count main..origin/main') return '3';
        if (args.join(' ') === 'rev-parse --is-shallow-repository')
          return 'false';
        if (args.join(' ') === 'rev-list --count HEAD') return '50';
        throw new Error(`unexpected git args: ${args.join(' ')}`);
      });

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
      ahead: 0,
      behind: 3,
      output:
        'From github.com:org/repo\n   abc123..def456  main -> origin/main',
      isShallow: false,
      commitCount: 50,
    });
  });

  it('reports upToDate: false from real divergence even when git fetch prints nothing to the captured stream (LS-10084)', () => {
    // Reproduces the bug scenario: git fetch's update-summary lines land on
    // stderr, which the injected runGit here never returns, so `output` is
    // empty even though the branch is genuinely behind.
    const runGit = jest
      .fn<FetchDeps['runGit']>()
      .mockImplementation((args: string[]) => {
        if (args[0] === 'fetch') return '';
        if (args.join(' ') === 'rev-parse --verify feature') return 'local-sha';
        if (args.join(' ') === 'rev-parse --verify origin/feature')
          return 'remote-sha';
        if (args.join(' ') === 'rev-list --count origin/feature..feature')
          return '0';
        if (args.join(' ') === 'rev-list --count feature..origin/feature')
          return '24';
        if (args.join(' ') === 'rev-parse --is-shallow-repository')
          return 'false';
        if (args.join(' ') === 'rev-list --count HEAD') return '0';
        throw new Error(`unexpected git args: ${args.join(' ')}`);
      });

    const res = executeWorktreeFetch(
      { remote: 'origin', branch: 'feature' },
      { resolveTargetDir: okResolver, runGit },
    );

    expect(JSON.parse(res.content[0].text)).toMatchObject({
      upToDate: false,
      ahead: 0,
      behind: 24,
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

  it('passes unshallow through to buildFetchArgs', () => {
    const runGit = jest.fn<FetchDeps['runGit']>().mockReturnValue('');

    executeWorktreeFetch(
      { remote: 'origin', unshallow: true },
      { resolveTargetDir: okResolver, runGit },
    );

    expect(runGit).toHaveBeenCalledWith(
      ['fetch', '--unshallow', 'origin'],
      '/wt',
    );
  });

  it('rejects unshallow and deepen passed together without running git', () => {
    const runGit = jest.fn<FetchDeps['runGit']>().mockReturnValue('');

    const res = executeWorktreeFetch(
      { unshallow: true, deepen: 200 },
      { resolveTargetDir: okResolver, runGit },
    );

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('mutually exclusive');
    expect(runGit).not.toHaveBeenCalled();
  });

  it('surfaces isShallow: true and the commit count after the fetch', () => {
    const runGit = jest
      .fn<FetchDeps['runGit']>()
      .mockImplementation((args: string[]) => {
        if (args[0] === 'fetch') return '';
        if (args.join(' ') === 'rev-parse --abbrev-ref HEAD') return '';
        if (args.join(' ') === 'rev-parse --is-shallow-repository')
          return 'true';
        if (args.join(' ') === 'rev-list --count HEAD') return '50';
        throw new Error(`unexpected git args: ${args.join(' ')}`);
      });

    const res = executeWorktreeFetch(
      {},
      { resolveTargetDir: okResolver, runGit },
    );

    expect(JSON.parse(res.content[0].text)).toMatchObject({
      isShallow: true,
      commitCount: 50,
    });
  });

  it('reports a null commitCount when rev-list fails', () => {
    const runGit = jest
      .fn<FetchDeps['runGit']>()
      .mockImplementation((args: string[]) => {
        if (args[0] === 'fetch') return '';
        if (args.join(' ') === 'rev-parse --abbrev-ref HEAD') return '';
        if (args.join(' ') === 'rev-parse --is-shallow-repository')
          return 'false';
        if (args.join(' ') === 'rev-list --count HEAD') {
          throw new Error('fatal: bad revision HEAD');
        }
        throw new Error(`unexpected git args: ${args.join(' ')}`);
      });

    const res = executeWorktreeFetch(
      {},
      { resolveTargetDir: okResolver, runGit },
    );

    expect(JSON.parse(res.content[0].text)).toMatchObject({
      isShallow: false,
      commitCount: null,
    });
  });

  it('defaults the remote to origin and falls back to output-based upToDate when the branch cannot be resolved', () => {
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
      ahead: null,
      behind: null,
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

  describe('runFetch (exit-code based success, LS-10279)', () => {
    const divergenceGit = (args: string[]): string => {
      if (args.join(' ') === 'rev-parse --is-shallow-repository')
        return 'false';
      if (args.join(' ') === 'rev-list --count HEAD') return '50';
      return '';
    };

    it('returns success when git exits 0 with non-empty stderr (ref updates + auto packing)', () => {
      const stderr =
        'From github.com:org/repo\n   a4efd414..f4208578  feature -> origin/feature\nAuto packing the repository for optimum performance.\nSee "git help gc" for manual housekeeping.';
      const runGit = jest
        .fn<FetchDeps['runGit']>()
        .mockImplementation(divergenceGit);
      const runFetch = jest
        .fn<NonNullable<FetchDeps['runFetch']>>()
        .mockReturnValue({ status: 0, stdout: '', stderr });

      const res = executeWorktreeFetch(
        {},
        { resolveTargetDir: okResolver, runGit, runFetch },
      );

      expect(res.isError).toBeUndefined();
      const parsed = JSON.parse(res.content[0].text) as {
        success: boolean;
        output: string;
      };
      expect(parsed.success).toBe(true);
      expect(parsed.output).toContain('Auto packing the repository');
      expect(parsed.output).toContain('feature -> origin/feature');
    });

    it('returns an error with the real exit code when git exits non-zero', () => {
      const runGit = jest.fn<FetchDeps['runGit']>();
      const runFetch = jest
        .fn<NonNullable<FetchDeps['runFetch']>>()
        .mockReturnValue({
          status: 128,
          stdout: '',
          stderr: "fatal: 'bogus' does not appear to be a git repository",
        });

      const res = executeWorktreeFetch(
        { remote: 'bogus' },
        { resolveTargetDir: okResolver, runGit, runFetch },
      );

      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('git fetch failed (exit code 128)');
      expect(res.content[0].text).toContain(
        'does not appear to be a git repository',
      );
    });

    it('reports exit code unknown with the spawn error when git never exits (timeout/spawn failure)', () => {
      const runFetch = jest
        .fn<NonNullable<FetchDeps['runFetch']>>()
        .mockReturnValue({
          status: null,
          stdout: '',
          stderr: '',
          error: 'spawnSync git ETIMEDOUT',
        });

      const res = executeWorktreeFetch(
        {},
        {
          resolveTargetDir: okResolver,
          runGit: jest.fn<FetchDeps['runGit']>(),
          runFetch,
        },
      );

      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('exit code unknown');
      expect(res.content[0].text).toContain('ETIMEDOUT');
    });
  });
});
