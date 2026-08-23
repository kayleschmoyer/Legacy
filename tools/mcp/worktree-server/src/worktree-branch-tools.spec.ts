// Dedicated unit tests for the worktree_branch_create and
// worktree_branch_switch MCP tools (LS-9441). The handlers registered under
// those tool names in index.ts (`case 'worktree_branch_create'` /
// `case 'worktree_branch_switch'`) are thin wrappers over
// executeWorktreeBranchCreate / executeWorktreeBranchSwitch below.
import {
  type BranchOpsDeps,
  executeWorktreeBranchCreate,
  executeWorktreeBranchSwitch,
} from './branch-ops';

const MAIN_REPO = '/repo';
const WORKTREE = '/repo-worktrees/LS-1234';

function makeDeps(
  overrides: Partial<BranchOpsDeps> = {},
): BranchOpsDeps & { runGit: jest.Mock } {
  return {
    resolveTargetDir: jest.fn().mockReturnValue({ path: WORKTREE }),
    runGit: jest.fn(),
    mainRepo: MAIN_REPO,
    ...overrides,
  } as BranchOpsDeps & { runGit: jest.Mock };
}

function textOf(res: { content: { type: 'text'; text: string }[] }): string {
  return res.content[0].text;
}

describe('worktree_branch_create (executeWorktreeBranchCreate)', () => {
  it('refuses to create a branch named "main"', () => {
    const deps = makeDeps();
    const res = executeWorktreeBranchCreate({ branch: 'main' }, deps);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/cannot create a branch named "main"/);
    expect(deps.runGit).not.toHaveBeenCalled();
  });

  it('refuses to create a branch named "origin/main"', () => {
    const deps = makeDeps();
    const res = executeWorktreeBranchCreate({ branch: 'origin/main' }, deps);
    expect(res.isError).toBe(true);
    expect(deps.runGit).not.toHaveBeenCalled();
  });

  it('propagates resolveTargetDir errors', () => {
    const deps = makeDeps({
      resolveTargetDir: jest
        .fn()
        .mockReturnValue({ error: 'No active worktree set.' }),
    });
    const res = executeWorktreeBranchCreate({ branch: 'LS-1/scratch' }, deps);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe('No active worktree set.');
  });

  it('refuses to operate on the main repository root', () => {
    const deps = makeDeps({
      resolveTargetDir: jest.fn().mockReturnValue({ path: MAIN_REPO }),
    });
    const res = executeWorktreeBranchCreate({ branch: 'LS-1/scratch' }, deps);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/main repository root/);
    expect(deps.runGit).not.toHaveBeenCalled();
  });

  it('refuses when HEAD is detached (no current branch)', () => {
    const deps = makeDeps({ runGit: jest.fn().mockReturnValue('') });
    const res = executeWorktreeBranchCreate({ branch: 'LS-1/scratch' }, deps);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/detached/);
  });

  it('refuses an invalid branch name (check-ref-format rejects it)', () => {
    const deps = makeDeps({
      runGit: jest
        .fn()
        .mockReturnValueOnce('claude/LS-1234-feature\n') // branch --show-current
        .mockImplementationOnce(() => {
          throw Object.assign(new Error('Command failed'), {
            stderr: 'fatal: not a valid ref name',
          });
        }),
    });
    const res = executeWorktreeBranchCreate({ branch: '-bad' }, deps);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/invalid branch name/);
  });

  it('fails fast when the "from" ref cannot be resolved, before checkout', () => {
    const runGit = jest
      .fn()
      .mockReturnValueOnce('claude/LS-1234-feature\n') // branch --show-current
      .mockReturnValueOnce('') // check-ref-format (branch) succeeds
      .mockImplementationOnce(() => {
        throw new Error('unknown revision');
      }); // rev-parse --verify on `from`
    const deps = makeDeps({ runGit });
    const res = executeWorktreeBranchCreate(
      { branch: 'LS-1/scratch', from: 'nonexistent-ref' },
      deps,
    );
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/Cannot resolve "from" ref/);
    expect(runGit).not.toHaveBeenCalledWith(
      expect.arrayContaining(['checkout']),
      expect.anything(),
    );
  });

  it('creates and switches to the new branch off HEAD on the happy path', () => {
    const runGit = jest
      .fn()
      .mockReturnValueOnce('claude/LS-1234-feature\n') // branch --show-current (previous)
      .mockReturnValueOnce('') // check-ref-format
      .mockReturnValueOnce('') // checkout -b
      .mockReturnValueOnce('LS-1/scratch\n'); // branch --show-current (verify)
    const deps = makeDeps({ runGit });
    const res = executeWorktreeBranchCreate({ branch: 'LS-1/scratch' }, deps);
    expect(res.isError).toBeUndefined();
    expect(JSON.parse(textOf(res))).toMatchObject({
      success: true,
      branch: 'LS-1/scratch',
      from: 'claude/LS-1234-feature',
      previousBranch: 'claude/LS-1234-feature',
      worktree: WORKTREE,
    });
    expect(runGit).toHaveBeenCalledWith(
      ['checkout', '-b', 'LS-1/scratch'],
      WORKTREE,
    );
  });

  it('creates the new branch off an explicit "from" ref', () => {
    const runGit = jest
      .fn()
      .mockReturnValueOnce('claude/LS-1234-feature\n')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('') // rev-parse --verify on `from`
      .mockReturnValueOnce('') // checkout -b branch from
      .mockReturnValueOnce('LS-1/scratch\n');
    const deps = makeDeps({ runGit });
    const res = executeWorktreeBranchCreate(
      { branch: 'LS-1/scratch', from: 'origin/main' },
      deps,
    );
    expect(res.isError).toBeUndefined();
    expect(runGit).toHaveBeenCalledWith(
      ['checkout', '-b', 'LS-1/scratch', 'origin/main'],
      WORKTREE,
    );
  });

  it('surfaces a mismatch if the checkout silently lands on the wrong branch', () => {
    const runGit = jest
      .fn()
      .mockReturnValueOnce('claude/LS-1234-feature\n')
      .mockReturnValueOnce('')
      .mockReturnValueOnce('') // checkout -b (no-op per mock)
      .mockReturnValueOnce('claude/LS-1234-feature\n'); // still on old branch
    const deps = makeDeps({ runGit });
    const res = executeWorktreeBranchCreate({ branch: 'LS-1/scratch' }, deps);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/Branch create failed/);
  });

  it('reports the git error when checkout -b fails', () => {
    const runGit = jest
      .fn()
      .mockReturnValueOnce('claude/LS-1234-feature\n')
      .mockReturnValueOnce('')
      .mockImplementationOnce(() => {
        throw Object.assign(new Error('Command failed'), {
          status: 128,
          stderr: "fatal: a branch named 'LS-1/scratch' already exists",
        });
      });
    const deps = makeDeps({ runGit });
    const res = executeWorktreeBranchCreate({ branch: 'LS-1/scratch' }, deps);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/already exists/);
    expect(textOf(res)).toMatch(/exit code 128/);
  });
});

describe('worktree_branch_switch (executeWorktreeBranchSwitch)', () => {
  it('propagates resolveTargetDir errors', () => {
    const deps = makeDeps({
      resolveTargetDir: jest
        .fn()
        .mockReturnValue({ error: 'No active worktree set.' }),
    });
    const res = executeWorktreeBranchSwitch({ branch: 'main' }, deps);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe('No active worktree set.');
  });

  it('refuses to operate on the main repository root', () => {
    const deps = makeDeps({
      resolveTargetDir: jest.fn().mockReturnValue({ path: MAIN_REPO }),
    });
    const res = executeWorktreeBranchSwitch({ branch: 'claude/x' }, deps);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/main repository root/);
    expect(deps.runGit).not.toHaveBeenCalled();
  });

  it('refuses an invalid branch name (check-ref-format rejects it)', () => {
    const deps = makeDeps({
      runGit: jest.fn().mockImplementationOnce(() => {
        throw Object.assign(new Error('Command failed'), {
          stderr: 'fatal: not a valid ref name',
        });
      }),
    });
    const res = executeWorktreeBranchSwitch({ branch: '-bad' }, deps);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/invalid branch name/);
  });

  it('returns a clear "does not exist" error for a non-existent local branch', () => {
    const runGit = jest
      .fn()
      .mockReturnValueOnce('') // check-ref-format
      .mockReturnValueOnce('claude/LS-1234-feature\n') // branch --show-current
      .mockImplementationOnce(() => {
        throw new Error('unknown revision or path not in the working tree');
      }); // rev-parse --verify refs/heads/<branch>
    const deps = makeDeps({ runGit });
    const res = executeWorktreeBranchSwitch({ branch: 'nope' }, deps);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/does not exist locally/);
    expect(runGit).not.toHaveBeenCalledWith(
      ['checkout', 'nope'],
      expect.anything(),
    );
  });

  it('switches to an existing branch on the happy path', () => {
    const runGit = jest
      .fn()
      .mockReturnValueOnce('') // check-ref-format
      .mockReturnValueOnce('claude/LS-1234-feature\n') // branch --show-current (previous)
      .mockReturnValueOnce('') // rev-parse --verify refs/heads/<branch>
      .mockReturnValueOnce('') // checkout
      .mockReturnValueOnce('claude/LS-1234-feature-other\n'); // branch --show-current (verify)
    const deps = makeDeps({ runGit });
    const res = executeWorktreeBranchSwitch(
      { branch: 'claude/LS-1234-feature-other' },
      deps,
    );
    expect(res.isError).toBeUndefined();
    expect(JSON.parse(textOf(res))).toMatchObject({
      success: true,
      branch: 'claude/LS-1234-feature-other',
      previousBranch: 'claude/LS-1234-feature',
      worktree: WORKTREE,
    });
  });

  it('surfaces a mismatch if the checkout silently lands on the wrong branch', () => {
    const runGit = jest
      .fn()
      .mockReturnValueOnce('') // check-ref-format
      .mockReturnValueOnce('claude/LS-1234-feature\n')
      .mockReturnValueOnce('') // rev-parse --verify
      .mockReturnValueOnce('') // checkout (no-op per mock)
      .mockReturnValueOnce('claude/LS-1234-feature\n'); // still on old branch
    const deps = makeDeps({ runGit });
    const res = executeWorktreeBranchSwitch({ branch: 'target' }, deps);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/Branch switch failed/);
  });

  it('reports the git error when checkout fails', () => {
    const runGit = jest
      .fn()
      .mockReturnValueOnce('') // check-ref-format
      .mockReturnValueOnce('claude/LS-1234-feature\n')
      .mockReturnValueOnce('') // rev-parse --verify
      .mockImplementationOnce(() => {
        throw Object.assign(new Error('Command failed'), {
          status: 1,
          stderr: 'error: Your local changes ... would be overwritten',
        });
      });
    const deps = makeDeps({ runGit });
    const res = executeWorktreeBranchSwitch({ branch: 'target' }, deps);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/would be overwritten/);
    expect(textOf(res)).toMatch(/exit code 1/);
  });
});
