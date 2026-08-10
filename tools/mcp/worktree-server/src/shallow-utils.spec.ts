import { describe, expect, it, jest } from '@jest/globals';

import {
  ensureSufficientDepth,
  hasMergeBase,
  isShallowRepository,
  type ShallowDeps,
} from './shallow-utils';

describe('isShallowRepository', () => {
  it('returns true when git reports a shallow repository', () => {
    const runGit = jest.fn<ShallowDeps['runGit']>().mockReturnValue('true\n');
    expect(isShallowRepository({ runGit }, '/repo')).toBe(true);
    expect(runGit).toHaveBeenCalledWith(
      ['rev-parse', '--is-shallow-repository'],
      '/repo',
    );
  });

  it('returns false when git reports a full repository', () => {
    const runGit = jest.fn<ShallowDeps['runGit']>().mockReturnValue('false\n');
    expect(isShallowRepository({ runGit }, '/repo')).toBe(false);
  });

  it('returns false when the check throws', () => {
    const runGit = jest.fn<ShallowDeps['runGit']>().mockImplementation(() => {
      throw new Error('not a git repo');
    });
    expect(isShallowRepository({ runGit }, '/repo')).toBe(false);
  });
});

describe('hasMergeBase', () => {
  it('returns true when merge-base succeeds', () => {
    const runGit = jest.fn<ShallowDeps['runGit']>().mockReturnValue('abc123\n');
    expect(hasMergeBase({ runGit }, '/repo', 'origin/main')).toBe(true);
    expect(runGit).toHaveBeenCalledWith(
      ['merge-base', 'origin/main', 'HEAD'],
      '/repo',
    );
  });

  it('returns false when merge-base throws (unrelated histories)', () => {
    const runGit = jest.fn<ShallowDeps['runGit']>().mockImplementation(() => {
      throw new Error('fatal: no merge base');
    });
    expect(hasMergeBase({ runGit }, '/repo', 'origin/main')).toBe(false);
  });
});

describe('ensureSufficientDepth', () => {
  it('is a no-op and logs nothing on a full clone', () => {
    const runGit = jest.fn<ShallowDeps['runGit']>().mockReturnValue('false\n');
    const log = ensureSufficientDepth({ runGit }, '/repo');
    expect(log).toEqual([]);
    expect(runGit).toHaveBeenCalledTimes(1);
    expect(runGit).toHaveBeenCalledWith(
      ['rev-parse', '--is-shallow-repository'],
      '/repo',
    );
  });

  it('deepens a shallow clone and stops once merge-base is established', () => {
    const runGit = jest
      .fn<ShallowDeps['runGit']>()
      .mockImplementation((args) => {
        if (args[0] === 'rev-parse') return 'true\n';
        if (args[0] === 'fetch') return '';
        if (args[0] === 'merge-base') return 'abc123\n';
        throw new Error(`unexpected git args: ${args.join(' ')}`);
      });

    const log = ensureSufficientDepth({ runGit }, '/repo');

    expect(runGit).toHaveBeenCalledWith(
      ['fetch', '--deepen=200', 'origin', 'main'],
      '/repo',
      { timeout: 60_000 },
    );
    expect(runGit).not.toHaveBeenCalledWith(
      ['fetch', '--unshallow', 'origin'],
      '/repo',
      expect.anything(),
    );
    expect(log.some((l) => l.includes('Shallow clone detected'))).toBe(true);
    expect(
      log.some((l) => l.includes('Merge-base established after deepen')),
    ).toBe(true);
  });

  it('falls back to --unshallow when the deepen is insufficient', () => {
    let mergeBaseCalls = 0;
    const runGit = jest
      .fn<ShallowDeps['runGit']>()
      .mockImplementation((args) => {
        if (args[0] === 'rev-parse') return 'true\n';
        if (args[0] === 'fetch') return '';
        if (args[0] === 'merge-base') {
          mergeBaseCalls += 1;
          if (mergeBaseCalls === 1) throw new Error('fatal: no merge base');
          return 'abc123\n';
        }
        throw new Error(`unexpected git args: ${args.join(' ')}`);
      });

    const log = ensureSufficientDepth({ runGit }, '/repo');

    expect(runGit).toHaveBeenCalledWith(
      ['fetch', '--unshallow', 'origin'],
      '/repo',
      { timeout: 120_000 },
    );
    expect(
      log.some((l) => l.includes('Merge-base established after unshallow')),
    ).toBe(true);
  });

  it('warns but does not throw when --unshallow also fails', () => {
    const runGit = jest
      .fn<ShallowDeps['runGit']>()
      .mockImplementation((args) => {
        if (args[0] === 'rev-parse') return 'true\n';
        if (args[0] === 'fetch' && args.includes('--deepen=200')) return '';
        if (args[0] === 'merge-base') throw new Error('fatal: no merge base');
        if (args[0] === 'fetch' && args.includes('--unshallow')) {
          throw new Error('fatal: network error');
        }
        throw new Error(`unexpected git args: ${args.join(' ')}`);
      });

    const log = ensureSufficientDepth({ runGit }, '/repo');

    expect(log.some((l) => l.includes('WARNING: --unshallow failed'))).toBe(
      true,
    );
  });

  it('warns but does not throw when the deepen fetch itself fails', () => {
    const runGit = jest
      .fn<ShallowDeps['runGit']>()
      .mockImplementation((args) => {
        if (args[0] === 'rev-parse') return 'true\n';
        if (args[0] === 'fetch' && args.includes('--deepen=200')) {
          throw new Error('fatal: network error');
        }
        if (args[0] === 'merge-base') throw new Error('fatal: no merge base');
        if (args[0] === 'fetch' && args.includes('--unshallow')) return '';
        throw new Error(`unexpected git args: ${args.join(' ')}`);
      });

    const log = ensureSufficientDepth({ runGit }, '/repo');

    expect(
      log.some((l) => l.includes('Deepen fetch warning (continuing)')),
    ).toBe(true);
  });
});
