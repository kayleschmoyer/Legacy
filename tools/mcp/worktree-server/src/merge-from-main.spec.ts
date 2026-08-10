import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { type MergeDeps, mergeFromMain } from './merge-from-main';

type RunGitFn = MergeDeps['runGit'];
type RunShellFn = MergeDeps['runShell'];

function makeDeps(overrides: Partial<MergeDeps> = {}): MergeDeps {
  return {
    runGit: jest.fn<RunGitFn>().mockReturnValue(''),
    runShell: jest.fn<RunShellFn>().mockReturnValue(''),
    nonInteractiveEnv: { GIT_TERMINAL_PROMPT: '0' },
    ...overrides,
  };
}

interface MergePayload {
  conflictDetected?: boolean;
  merged?: boolean;
  alreadyUpToDate?: boolean;
  pushed?: boolean;
  pushError?: string;
  message?: string;
  head?: string;
  from?: string;
  log?: string;
  files?: Array<{ path: string; conflicts: unknown[] }>;
}

function parsePayload(text: string): MergePayload {
  return JSON.parse(text) as MergePayload;
}

const OPTS = { from: 'main', pushTimeoutMs: 120_000 };

describe('mergeFromMain', () => {
  let deps: MergeDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('refuses a "from" value that looks like a git CLI flag', () => {
    const result = mergeFromMain(
      '/cwd',
      { ...OPTS, from: '--upload-pack=evil' },
      deps,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Invalid "from" branch name/);
    expect(deps.runGit).not.toHaveBeenCalled();
  });

  it('accepts a well-formed feature branch name for "from"', () => {
    jest.mocked(deps.runGit).mockReturnValue('feature-branch\n');
    const result = mergeFromMain(
      '/cwd',
      { ...OPTS, from: 'release/2026.08' },
      deps,
    );
    expect(result.content[0].text).not.toMatch(/Invalid "from"/);
  });

  it('refuses to operate on the main branch', () => {
    jest.mocked(deps.runGit).mockReturnValue('main\n');
    const result = mergeFromMain('/cwd', OPTS, deps);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Refusing to merge/);
  });

  it('refuses when current branch matches the from target', () => {
    jest.mocked(deps.runGit).mockReturnValue('main\n');
    const result = mergeFromMain('/cwd', { ...OPTS, from: 'main' }, deps);
    expect(result.isError).toBe(true);
  });

  it('returns success on clean merge and push', () => {
    let call = 0;
    jest.mocked(deps.runGit).mockImplementation((args) => {
      call++;
      if (call === 1) return 'feature-branch\n';
      if (args[0] === 'fetch') return '';
      if (args[0] === 'rev-parse' && call === 3) return 'abc123\n';
      if (args[0] === 'merge') return 'Merge made by the recursive strategy.';
      if (args[0] === 'rev-parse') return 'def456\n';
      if (args[0] === 'push') return '';
      return '';
    });
    const result = mergeFromMain('/cwd', OPTS, deps);
    expect(result.isError).toBeFalsy();
    const payload = parsePayload(result.content[0].text);
    expect(payload.merged).toBe(true);
    expect(payload.pushed).toBe(true);
    expect(payload.conflictDetected).toBe(false);
  });

  it('reports alreadyUpToDate and skips push when head is unchanged', () => {
    jest.mocked(deps.runGit).mockImplementation((args) => {
      if (args[0] === 'rev-parse') return 'abc123\n';
      if (args[0] === 'merge') return 'Already up to date.';
      return '';
    });
    const result = mergeFromMain('/cwd', OPTS, deps);
    expect(result.isError).toBeFalsy();
    const payload = parsePayload(result.content[0].text);
    expect(payload.alreadyUpToDate).toBe(true);
    expect(payload.pushed).toBe(false);
    expect(deps.runGit).not.toHaveBeenCalledWith(
      ['push'],
      '/cwd',
      expect.anything(),
    );
  });

  it('leaves the merge in progress and returns conflict info on conflict', () => {
    let call = 0;
    jest.mocked(deps.runGit).mockImplementation((args) => {
      call++;
      if (call === 1) return 'feature-branch\n';
      if (args[0] === 'fetch') return '';
      if (args[0] === 'rev-parse') return 'abc123\n';
      if (args[0] === 'merge') {
        throw Object.assign(new Error('merge fail'), {
          stdout: 'CONFLICT (content): Merge conflict in foo.ts',
          stderr:
            'Automatic merge failed; fix conflicts and then commit the result.',
        });
      }
      return '';
    });
    jest.mocked(deps.runShell).mockReturnValue('foo.ts\0');
    const result = mergeFromMain('/cwd', OPTS, deps);
    expect(result.isError).toBe(true);
    const payload = parsePayload(result.content[0].text);
    expect(payload.conflictDetected).toBe(true);
    expect(payload.merged).toBe(false);
    expect(payload.message).toMatch(/left in progress/);
    // No abort — unlike rebase, the merge stays for in-place resolution.
    expect(deps.runGit).not.toHaveBeenCalledWith(
      ['merge', '--abort'],
      '/cwd',
      expect.anything(),
    );
  });

  it('surfaces conflictInfoError when getConflictInfo itself fails', () => {
    let call = 0;
    jest.mocked(deps.runGit).mockImplementation((args) => {
      call++;
      if (call === 1) return 'feature-branch\n';
      if (args[0] === 'fetch') return '';
      if (args[0] === 'rev-parse') return 'abc123\n';
      if (args[0] === 'merge') {
        throw Object.assign(new Error('merge fail'), {
          stdout: 'CONFLICT (content): Merge conflict in foo.ts',
          stderr: '',
        });
      }
      return '';
    });
    jest.mocked(deps.runShell).mockImplementation(() => {
      throw new Error('git diff exploded');
    });
    const result = mergeFromMain('/cwd', OPTS, deps);
    const payload = parsePayload(result.content[0].text) as MergePayload & {
      conflictInfoError?: string;
    };
    expect(payload.conflictDetected).toBe(true);
    expect(payload.files).toEqual([]);
    expect(payload.conflictInfoError).toMatch(/git diff exploded/);
  });

  it('reports pushError when push fails', () => {
    let call = 0;
    jest.mocked(deps.runGit).mockImplementation((args) => {
      call++;
      if (call === 1) return 'feature-branch\n';
      if (args[0] === 'fetch') return '';
      if (args[0] === 'rev-parse' && call <= 3) return 'abc123\n';
      if (args[0] === 'merge') return 'Merge made by the recursive strategy.';
      if (args[0] === 'rev-parse') return 'def456\n';
      if (args[0] === 'push') {
        throw Object.assign(new Error('push rejected'), {
          stderr: 'remote: rejected',
        });
      }
      return '';
    });
    const result = mergeFromMain('/cwd', OPTS, deps);
    expect(result.isError).toBe(true);
    const payload = parsePayload(result.content[0].text);
    expect(payload.pushed).toBe(false);
    expect(payload.pushError).toMatch(/rejected/);
  });
});
