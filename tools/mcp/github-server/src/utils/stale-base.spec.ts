jest.mock('../github-api', () => ({ githubRest: jest.fn() }));

import {
  detectStaleBase,
  fetchBaseDivergence,
  staleBaseNextAction,
} from './stale-base';
import type { BaseDivergence } from './stale-base';
import { githubRest } from '../github-api';

const mockedRest = githubRest as jest.MockedFunction<typeof githubRest>;

const BEHIND: BaseDivergence = {
  behindBy: 3,
  aheadBy: 1,
  mergeBaseSha: 'aaaaaaaaaaaaaaaa',
  baseTipSha: 'bbbbbbbbbbbbbbbb',
};

function runs(
  entries: Array<{ id: number; name: string; conclusion: string | null }>,
) {
  return {
    check_runs: entries.map((e) => ({ ...e, status: 'completed' })),
  };
}

describe('fetchBaseDivergence', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps the compare response and encodes the base ref', async () => {
    mockedRest.mockResolvedValue({
      behind_by: 3,
      ahead_by: 1,
      merge_base_commit: { sha: 'aaaaaaaaaaaaaaaa' },
      base_commit: { sha: 'bbbbbbbbbbbbbbbb' },
    });
    await expect(
      fetchBaseDivergence('o', 'r', 'release/1', 'head123'),
    ).resolves.toEqual(BEHIND);
    expect(mockedRest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/repos/o/r/compare/release%2F1...head123',
      }),
    );
  });

  it('fails open to null on error', async () => {
    mockedRest.mockRejectedValue(new Error('boom'));
    await expect(
      fetchBaseDivergence('o', 'r', 'main', 'head123'),
    ).resolves.toBeNull();
  });
});

describe('detectStaleBase', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null without calling the API when not behind', async () => {
    const hint = await detectStaleBase('o', 'r', { ...BEHIND, behindBy: 0 }, [
      'test (failure)',
    ]);
    expect(hint).toBeNull();
    expect(mockedRest).not.toHaveBeenCalled();
  });

  it('flags STALE_BASE when a failing check is green on the base tip', async () => {
    mockedRest.mockResolvedValue(
      runs([
        { id: 1, name: 'test', conclusion: 'success' },
        { id: 2, name: 'lint', conclusion: 'failure' },
      ]),
    );
    const hint = await detectStaleBase('o', 'r', BEHIND, [
      'test (failure)',
      'lint (failure)',
    ]);
    expect(hint).toMatchObject({
      hint: 'STALE_BASE',
      behindBy: 3,
      greenOnBase: ['test'],
      failingOnBase: ['lint'],
    });
    expect(mockedRest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/repos/o/r/commits/bbbbbbbbbbbbbbbb/check-runs',
      }),
    );
  });

  it('uses the latest run per name (highest id)', async () => {
    mockedRest.mockResolvedValue(
      runs([
        { id: 1, name: 'test', conclusion: 'success' },
        { id: 5, name: 'test', conclusion: 'failure' },
      ]),
    );
    await expect(
      detectStaleBase('o', 'r', BEHIND, ['test (failure)']),
    ).resolves.toBeNull();
  });

  it('returns null when the failing check also fails on base', async () => {
    mockedRest.mockResolvedValue(
      runs([{ id: 1, name: 'test', conclusion: 'failure' }]),
    );
    await expect(
      detectStaleBase('o', 'r', BEHIND, ['test (failure)']),
    ).resolves.toBeNull();
  });

  it('fails open to null on error', async () => {
    mockedRest.mockRejectedValue(new Error('boom'));
    await expect(
      detectStaleBase('o', 'r', BEHIND, ['test (failure)']),
    ).resolves.toBeNull();
  });
});

describe('staleBaseNextAction', () => {
  it('names the checks, distance, and the rerun prohibition', () => {
    const text = staleBaseNextAction('main', {
      hint: 'STALE_BASE',
      behindBy: 1,
      mergeBaseSha: 'aaaaaaaaaaaaaaaa',
      baseTipSha: 'bbbbbbbbbbbbbbbb',
      greenOnBase: ['test'],
      failingOnBase: [],
    });
    expect(text).toContain('STALE_BASE: test is green on main');
    expect(text).toContain('1 commit newer');
    expect(text).toContain('do NOT rerun');
  });
});
