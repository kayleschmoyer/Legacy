import { describe, expect, it, jest } from '@jest/globals';

import { rerereForgetPaths } from './rerere-forget';

describe('rerereForgetPaths', () => {
  it('forgets a file that still has conflict markers in one call', () => {
    const runGit = jest.fn<(args: string[], cwd: string) => string>(() => '');

    const result = rerereForgetPaths(['a.ts'], '/wt', runGit);

    expect(result).toEqual({ cleared: ['a.ts'], failed: [] });
    expect(runGit).toHaveBeenCalledTimes(1);
    expect(runGit).toHaveBeenCalledWith(
      ['rerere', 'forget', '--', 'a.ts'],
      '/wt',
    );
  });

  it('resets an already-resolved file to conflicted state before retrying forget', () => {
    let checkedOut = false;
    const runGit = jest.fn<(args: string[], cwd: string) => string>(
      (args: string[]) => {
        if (args[0] === 'checkout') {
          checkedOut = true;
          return '';
        }
        if (args[0] === 'rerere' && !checkedOut) {
          throw new Error('could not parse conflict hunks');
        }
        return '';
      },
    );

    const result = rerereForgetPaths(['b.ts'], '/wt', runGit);

    expect(result).toEqual({ cleared: ['b.ts'], failed: [] });
    expect(runGit).toHaveBeenNthCalledWith(
      1,
      ['rerere', 'forget', '--', 'b.ts'],
      '/wt',
    );
    expect(runGit).toHaveBeenNthCalledWith(
      2,
      ['checkout', '--merge', '--', 'b.ts'],
      '/wt',
    );
    expect(runGit).toHaveBeenNthCalledWith(
      3,
      ['rerere', 'forget', '--', 'b.ts'],
      '/wt',
    );
  });

  it('collects a path into failed without throwing when both attempts fail', () => {
    const runGit = jest.fn<(args: string[], cwd: string) => string>(() => {
      throw new Error('fatal: not something we can handle');
    });

    const result = rerereForgetPaths(['c.ts'], '/wt', runGit);

    expect(result).toEqual({ cleared: [], failed: ['c.ts'] });
  });

  it('processes multiple paths independently, mixing successes and failures', () => {
    const runGit = jest.fn<(args: string[], cwd: string) => string>(
      (args: string[]) => {
        const path = args[args.length - 1];
        if (path === 'good.ts') return '';
        throw new Error('fatal: nothing to forget');
      },
    );

    const result = rerereForgetPaths(['good.ts', 'bad.ts'], '/wt', runGit);

    expect(result.cleared).toEqual(['good.ts']);
    expect(result.failed).toEqual(['bad.ts']);
  });

  it('returns empty result for an empty paths array', () => {
    const runGit = jest.fn<(args: string[], cwd: string) => string>(() => '');

    const result = rerereForgetPaths([], '/wt', runGit);

    expect(result).toEqual({ cleared: [], failed: [] });
    expect(runGit).not.toHaveBeenCalled();
  });
});
