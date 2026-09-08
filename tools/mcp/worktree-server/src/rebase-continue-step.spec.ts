import { describe, expect, it, jest } from '@jest/globals';

import {
  type RebaseContinueDeps,
  rebaseContinueStep,
} from './rebase-continue-step';

type RunGitFn = RebaseContinueDeps['runGit'];
type RunShellFn = RebaseContinueDeps['runShell'];

function makeDeps(
  overrides: Partial<RebaseContinueDeps> = {},
): RebaseContinueDeps {
  return {
    runGit: jest.fn<RunGitFn>().mockReturnValue(''),
    runShell: jest.fn<RunShellFn>().mockReturnValue(''),
    existsSync: jest
      .fn<RebaseContinueDeps['existsSync']>()
      .mockReturnValue(false),
    join: (...segments: string[]) => segments.join('/'),
    ...overrides,
  };
}

const DISABLE_RERERE_ENV = {
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'rerere.enabled',
  GIT_CONFIG_VALUE_0: 'false',
};

describe('rebaseContinueStep', () => {
  it('passes the given env through to `git rebase --continue` (LS-8593)', () => {
    const deps = makeDeps();
    rebaseContinueStep('/cwd', DISABLE_RERERE_ENV, deps);

    const continueCall = jest
      .mocked(deps.runGit)
      .mock.calls.find(
        ([args]) => args[0] === 'rebase' && args[1] === '--continue',
      );
    expect(continueCall).toBeDefined();
    expect(continueCall?.[2]?.env).toEqual(DISABLE_RERERE_ENV);
  });

  it('does not silently fall back to a default env when disableRerere was requested', () => {
    // Regression guard: a prior implementation defaulted the `env` param,
    // which meant a caller-provided override could be dropped on a later
    // continue step (each --continue is its own git process). Passing an
    // explicit env here must be the *only* env that reaches the process —
    // no merging with an implicit default that could re-enable rerere.
    const deps = makeDeps();
    rebaseContinueStep('/cwd', DISABLE_RERERE_ENV, deps);

    const continueCall = jest
      .mocked(deps.runGit)
      .mock.calls.find(
        ([args]) => args[0] === 'rebase' && args[1] === '--continue',
      );
    expect(continueCall?.[2]?.env?.['GIT_CONFIG_VALUE_0']).toBe('false');
    expect(Object.keys(continueCall?.[2]?.env ?? {})).toEqual(
      Object.keys(DISABLE_RERERE_ENV),
    );
  });

  it('stages a specific file list with `git add --` when files are provided', () => {
    const deps = makeDeps();
    rebaseContinueStep('/cwd', {}, deps, ['a.ts', 'b.ts']);

    expect(deps.runGit).toHaveBeenCalledWith(
      ['add', '--', 'a.ts', 'b.ts'],
      '/cwd',
    );
  });

  it('stages everything with `git add -A` when no file list is given', () => {
    const deps = makeDeps();
    rebaseContinueStep('/cwd', {}, deps);

    expect(deps.runGit).toHaveBeenCalledWith(['add', '-A'], '/cwd');
  });

  it('reports completed: true when no rebase-merge/rebase-apply dir remains', () => {
    const deps = makeDeps({
      existsSync: jest
        .fn<RebaseContinueDeps['existsSync']>()
        .mockReturnValue(false),
    });
    const result = rebaseContinueStep('/cwd', {}, deps);

    expect(result.completed).toBe(true);
    expect(result.conflicted).toEqual([]);
  });

  it('reports remaining conflicts when the rebase-merge dir still exists', () => {
    const deps = makeDeps({
      existsSync: jest
        .fn<RebaseContinueDeps['existsSync']>()
        .mockReturnValue(true),
      runShell: jest
        .fn<RunShellFn>()
        .mockReturnValueOnce('/repo/.git') // rev-parse --absolute-git-dir
        .mockReturnValueOnce('conflicted.ts\n'), // diff --name-only --diff-filter=U
    });
    const result = rebaseContinueStep('/cwd', {}, deps);

    expect(result.completed).toBe(false);
    expect(result.conflicted).toEqual(['conflicted.ts']);
  });
});
