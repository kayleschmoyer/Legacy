import { describe, expect, it, jest } from '@jest/globals';

import { resolveResetTarget } from './resolve-reset-target';

type RunGit = (
  args: string[],
  cwd: string,
  opts?: { timeout?: number; env?: Record<string, string> },
) => string;

describe('resolveResetTarget', () => {
  it('allows an ancestor SHA regardless of allowNonAncestor', () => {
    const runGit = jest.fn<RunGit>(() => '');

    const result = resolveResetTarget('abc123', false, '/wt', runGit);

    expect(result).toEqual({ allowed: true, reflogVerifiedNonAncestor: false });
    expect(runGit).toHaveBeenCalledWith(
      ['merge-base', '--is-ancestor', 'abc123', 'HEAD'],
      '/wt',
    );
    expect(runGit).toHaveBeenCalledTimes(1);
  });

  it('refuses a non-ancestor SHA when allowNonAncestor is false, without checking reflog', () => {
    const runGit = jest.fn<RunGit>((args) => {
      if (args[0] === 'merge-base') throw new Error('not an ancestor');
      return '';
    });

    const result = resolveResetTarget('deadbeef', false, '/wt', runGit);

    expect(result).toEqual({
      allowed: false,
      reflogVerifiedNonAncestor: false,
    });
    expect(runGit).toHaveBeenCalledTimes(1);
  });

  it('allows a non-ancestor SHA found in reflog when allowNonAncestor is true', () => {
    const runGit = jest.fn<RunGit>((args) => {
      if (args[0] === 'merge-base') throw new Error('not an ancestor');
      if (args[0] === 'reflog') return 'deadbeef\nabc123\n';
      return '';
    });

    const result = resolveResetTarget('deadbeef', true, '/wt', runGit);

    expect(result).toEqual({ allowed: true, reflogVerifiedNonAncestor: true });
    expect(runGit).toHaveBeenNthCalledWith(
      1,
      ['merge-base', '--is-ancestor', 'deadbeef', 'HEAD'],
      '/wt',
    );
    expect(runGit).toHaveBeenNthCalledWith(
      2,
      ['reflog', 'show', '--format=%H', 'HEAD'],
      '/wt',
      { timeout: 15_000 },
    );
  });

  it('refuses a non-ancestor SHA absent from reflog even when allowNonAncestor is true', () => {
    const runGit = jest.fn<RunGit>((args) => {
      if (args[0] === 'merge-base') throw new Error('not an ancestor');
      if (args[0] === 'reflog') return 'unrelated1\nunrelated2\n';
      return '';
    });

    const result = resolveResetTarget('deadbeef', true, '/wt', runGit);

    expect(result).toEqual({
      allowed: false,
      reflogVerifiedNonAncestor: false,
    });
  });

  it('treats a reflog lookup failure as not-found rather than throwing', () => {
    const runGit = jest.fn<RunGit>((args) => {
      if (args[0] === 'merge-base') throw new Error('not an ancestor');
      if (args[0] === 'reflog') throw new Error('reflog unavailable');
      return '';
    });

    const result = resolveResetTarget('deadbeef', true, '/wt', runGit);

    expect(result).toEqual({
      allowed: false,
      reflogVerifiedNonAncestor: false,
    });
  });
});
