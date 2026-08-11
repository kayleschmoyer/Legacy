import { describe, expect, it, jest } from '@jest/globals';

import { executeWorktreeMv, type MvDeps } from './move-file-utils';

describe('executeWorktreeMv', () => {
  const okResolver: MvDeps['resolveTargetDir'] = () => ({ path: '/wt' });

  it('moves a single file and reports the rename status', () => {
    const runGit = jest
      .fn<MvDeps['runGit']>()
      .mockReturnValueOnce('') // git mv
      .mockReturnValueOnce('R100\told.tsx\tnew.tsx\n'); // diff --cached --name-status
    const mkdirSync = jest.fn<MvDeps['mkdirSync']>();

    const res = executeWorktreeMv(
      { moves: [{ from: 'old.tsx', to: 'new.tsx' }] },
      { resolveTargetDir: okResolver, runGit, mkdirSync },
    );

    expect(mkdirSync).toHaveBeenCalledWith('/wt', { recursive: true });
    expect(runGit).toHaveBeenNthCalledWith(
      1,
      ['mv', '--', 'old.tsx', 'new.tsx'],
      '/wt',
      { timeout: 15_000 },
    );
    expect(res.isError).toBeUndefined();
    expect(JSON.parse(res.content[0].text)).toEqual({
      moved: 1,
      results: [{ from: 'old.tsx', to: 'new.tsx', status: 'R100' }],
    });
  });

  it('creates the destination parent directory before moving', () => {
    const runGit = jest
      .fn<MvDeps['runGit']>()
      .mockReturnValueOnce('')
      .mockReturnValueOnce('R100\told.tsx\tscreens/new.tsx\n');
    const mkdirSync = jest.fn<MvDeps['mkdirSync']>();

    executeWorktreeMv(
      { moves: [{ from: 'old.tsx', to: 'screens/new.tsx' }] },
      { resolveTargetDir: okResolver, runGit, mkdirSync },
    );

    expect(mkdirSync).toHaveBeenCalledWith('/wt/screens', {
      recursive: true,
    });
  });

  it('moves multiple pairs in one batch call', () => {
    const runGit = jest
      .fn<MvDeps['runGit']>()
      .mockReturnValueOnce('')
      .mockReturnValueOnce('R100\ta.tsx\tb.tsx\n')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('R100\ta.spec.tsx\tb.spec.tsx\n');
    const mkdirSync = jest.fn<MvDeps['mkdirSync']>();

    const res = executeWorktreeMv(
      {
        moves: [
          { from: 'a.tsx', to: 'b.tsx' },
          { from: 'a.spec.tsx', to: 'b.spec.tsx' },
        ],
      },
      { resolveTargetDir: okResolver, runGit, mkdirSync },
    );

    expect(res.isError).toBeUndefined();
    expect(JSON.parse(res.content[0].text)).toEqual({
      moved: 2,
      results: [
        { from: 'a.tsx', to: 'b.tsx', status: 'R100' },
        { from: 'a.spec.tsx', to: 'b.spec.tsx', status: 'R100' },
      ],
    });
  });

  it('defaults status to R100 when the readback diff is empty', () => {
    const runGit = jest
      .fn<MvDeps['runGit']>()
      .mockReturnValueOnce('')
      .mockReturnValueOnce('');
    const mkdirSync = jest.fn<MvDeps['mkdirSync']>();

    const res = executeWorktreeMv(
      { moves: [{ from: 'old.tsx', to: 'new.tsx' }] },
      { resolveTargetDir: okResolver, runGit, mkdirSync },
    );

    expect(JSON.parse(res.content[0].text)).toEqual({
      moved: 1,
      results: [{ from: 'old.tsx', to: 'new.tsx', status: 'R100' }],
    });
  });

  it('rejects an empty moves array', () => {
    const runGit = jest.fn<MvDeps['runGit']>();
    const mkdirSync = jest.fn<MvDeps['mkdirSync']>();

    const res = executeWorktreeMv(
      { moves: [] },
      { resolveTargetDir: okResolver, runGit, mkdirSync },
    );

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/non-empty array/);
    expect(runGit).not.toHaveBeenCalled();
  });

  it('rejects more than 50 moves', () => {
    const runGit = jest.fn<MvDeps['runGit']>();
    const mkdirSync = jest.fn<MvDeps['mkdirSync']>();
    const moves = Array.from({ length: 51 }, (_, i) => ({
      from: `a${i}.tsx`,
      to: `b${i}.tsx`,
    }));

    const res = executeWorktreeMv(
      { moves },
      { resolveTargetDir: okResolver, runGit, mkdirSync },
    );

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Too many moves/);
    expect(runGit).not.toHaveBeenCalled();
  });

  it('rejects a malformed move entry without calling git', () => {
    const runGit = jest.fn<MvDeps['runGit']>();
    const mkdirSync = jest.fn<MvDeps['mkdirSync']>();

    const res = executeWorktreeMv(
      { moves: [{ from: 'a.tsx' } as unknown as { from: string; to: string }] },
      { resolveTargetDir: okResolver, runGit, mkdirSync },
    );

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Invalid move entry/);
    expect(runGit).not.toHaveBeenCalled();
  });

  it('rejects an out-of-root destination without calling git', () => {
    const runGit = jest.fn<MvDeps['runGit']>();
    const mkdirSync = jest.fn<MvDeps['mkdirSync']>();

    const res = executeWorktreeMv(
      { moves: [{ from: 'a.tsx', to: '../secrets.tsx' }] },
      { resolveTargetDir: okResolver, runGit, mkdirSync },
    );

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/must not escape/);
    expect(runGit).not.toHaveBeenCalled();
  });

  it('returns an error response when the worktree cannot be resolved', () => {
    const runGit = jest.fn<MvDeps['runGit']>();
    const mkdirSync = jest.fn<MvDeps['mkdirSync']>();

    const res = executeWorktreeMv(
      { moves: [{ from: 'a.tsx', to: 'b.tsx' }] },
      {
        resolveTargetDir: () => ({ error: 'No active worktree set.' }),
        runGit,
        mkdirSync,
      },
    );

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe('No active worktree set.');
    expect(runGit).not.toHaveBeenCalled();
  });

  it('surfaces git stderr and reports prior progress when a later move fails', () => {
    const runGit = jest
      .fn<MvDeps['runGit']>()
      .mockReturnValueOnce('') // mv 1
      .mockReturnValueOnce('R100\ta.tsx\tb.tsx\n') // diff 1
      .mockImplementationOnce(() => {
        throw Object.assign(new Error('Command failed'), {
          stderr: 'fatal: bad source, source=c.tsx, destination=d.tsx',
        });
      }); // mv 2 fails
    const mkdirSync = jest.fn<MvDeps['mkdirSync']>();

    const res = executeWorktreeMv(
      {
        moves: [
          { from: 'a.tsx', to: 'b.tsx' },
          { from: 'c.tsx', to: 'd.tsx' },
        ],
      },
      { resolveTargetDir: okResolver, runGit, mkdirSync },
    );

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('git mv "c.tsx" -> "d.tsx" failed');
    expect(res.content[0].text).toContain('bad source');
    expect(res.content[0].text).toContain('Completed before this failure');
    expect(res.content[0].text).toContain('a.tsx');
  });
});
