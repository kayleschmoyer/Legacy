import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { type RebaseDeps, rebaseOntoMain } from './rebase-onto-main';

type RunGitFn = RebaseDeps['runGit'];
type RunShellFn = RebaseDeps['runShell'];

function makeDeps(overrides: Partial<RebaseDeps> = {}): RebaseDeps {
  return {
    runGit: jest.fn<RunGitFn>().mockReturnValue(''),
    runShell: jest.fn<RunShellFn>().mockReturnValue(''),
    nonInteractiveEnv: { GIT_TERMINAL_PROMPT: '0' },
    ...overrides,
  };
}

interface RebasePayload {
  conflictDetected?: boolean;
  pushed?: boolean;
  pushError?: string;
  message?: string;
  commitsRebased?: string;
  head?: string;
  onto?: string;
  log?: string;
}

function parsePayload(text: string): RebasePayload {
  return JSON.parse(text) as RebasePayload;
}

const OPTS = { onto: 'main', disableRerere: false, pushTimeoutMs: 120_000 };

describe('rebaseOntoMain', () => {
  let deps: RebaseDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  it('refuses to operate on the main branch', () => {
    jest.mocked(deps.runGit).mockReturnValue('main\n');
    const result = rebaseOntoMain('/cwd', OPTS, deps);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Refusing to rebase/);
  });

  it('refuses when current branch matches onto target', () => {
    jest.mocked(deps.runGit).mockReturnValue('main\n');
    const result = rebaseOntoMain('/cwd', { ...OPTS, onto: 'main' }, deps);
    expect(result.isError).toBe(true);
  });

  it('returns success on clean rebase and push', () => {
    let call = 0;
    jest.mocked(deps.runGit).mockImplementation((args) => {
      call++;
      if (call === 1) return 'feature-branch\n';
      if (args[0] === 'fetch') return '';
      if (args[0] === 'rev-parse') return 'abc123\n';
      if (args[0] === 'rev-list') return '3\n';
      if (args[0] === 'rebase') return 'Successfully rebased';
      if (args[0] === 'diff') return '';
      if (args[0] === 'push') return '';
      return '';
    });
    const result = rebaseOntoMain('/cwd', OPTS, deps);
    expect(result.isError).toBeFalsy();
    const payload = parsePayload(result.content[0].text);
    expect(payload.pushed).toBe(true);
    expect(payload.conflictDetected).toBe(false);
  });

  it('returns conflict error when rebase throws with CONFLICT in output', () => {
    let call = 0;
    jest.mocked(deps.runGit).mockImplementation((args) => {
      call++;
      if (call === 1) return 'feature-branch\n';
      if (args[0] === 'fetch') return '';
      if (args[0] === 'rev-parse') return 'abc123\n';
      if (args[0] === 'rev-list') return '1\n';
      if (args[0] === 'rebase' && args[1] === 'origin/main') {
        throw Object.assign(new Error('rebase fail'), {
          stdout: 'CONFLICT (content): Merge conflict in foo.ts',
          stderr: '',
        });
      }
      return '';
    });
    const result = rebaseOntoMain('/cwd', OPTS, deps);
    expect(result.isError).toBe(true);
    const payload = parsePayload(result.content[0].text);
    expect(payload.conflictDetected).toBe(true);
    expect(payload.message).toMatch(/conflicts/);
  });

  it('returns conflict-marker error when rerere silently committed markers', () => {
    let call = 0;
    jest.mocked(deps.runGit).mockImplementation((args) => {
      call++;
      if (call === 1) return 'feature-branch\n';
      if (args[0] === 'fetch') return '';
      if (args[0] === 'rev-parse') return 'abc123\n';
      if (args[0] === 'rev-list') return '1\n';
      if (args[0] === 'rebase') return 'Rebased';
      if (args[0] === 'diff') return '<<<<<<< HEAD\nsome conflict\n=======';
      if (args[0] === 'reset') return '';
      return '';
    });
    const result = rebaseOntoMain('/cwd', OPTS, deps);
    expect(result.isError).toBe(true);
    const payload = parsePayload(result.content[0].text);
    expect(payload.conflictDetected).toBe(true);
    expect(payload.message).toMatch(/Conflict markers detected/);
  });

  it('reports pushError when push fails', () => {
    let call = 0;
    jest.mocked(deps.runGit).mockImplementation((args) => {
      call++;
      if (call === 1) return 'feature-branch\n';
      if (args[0] === 'fetch') return '';
      if (args[0] === 'rev-parse') return 'abc123\n';
      if (args[0] === 'rev-list') return '1\n';
      if (args[0] === 'rebase') return 'Rebased';
      if (args[0] === 'diff') return '';
      if (args[0] === 'push') {
        throw Object.assign(new Error('push rejected'), {
          stderr: 'remote: rejected',
        });
      }
      return '';
    });
    const result = rebaseOntoMain('/cwd', OPTS, deps);
    expect(result.isError).toBe(true);
    const payload = parsePayload(result.content[0].text);
    expect(payload.pushed).toBe(false);
    expect(payload.pushError).toMatch(/rejected/);
  });

  it('uses the three-arg --onto form when upstream is provided', () => {
    let call = 0;
    let rebaseArgsSeen: readonly string[] | undefined;
    jest.mocked(deps.runGit).mockImplementation((args) => {
      call++;
      if (call === 1) return 'feature-branch\n';
      if (args[0] === 'fetch') return '';
      if (args[0] === 'rev-parse') return 'abc123\n';
      if (args[0] === 'rev-list') return '2\n';
      if (args[0] === 'rebase') {
        rebaseArgsSeen = args;
        return 'Successfully rebased';
      }
      if (args[0] === 'diff') return '';
      if (args[0] === 'push') return '';
      return '';
    });
    const result = rebaseOntoMain(
      '/cwd',
      { ...OPTS, upstream: 'deadbeef' },
      deps,
    );
    expect(result.isError).toBeFalsy();
    expect(rebaseArgsSeen).toEqual([
      'rebase',
      '--onto',
      'origin/main',
      'deadbeef',
    ]);
    const payload = parsePayload(result.content[0].text);
    expect(payload.pushed).toBe(true);
  });

  it('reports conflicts identically on the --onto path', () => {
    let call = 0;
    jest.mocked(deps.runGit).mockImplementation((args) => {
      call++;
      if (call === 1) return 'feature-branch\n';
      if (args[0] === 'fetch') return '';
      if (args[0] === 'rev-parse') return 'abc123\n';
      if (args[0] === 'rev-list') return '1\n';
      if (args[0] === 'rebase') {
        throw Object.assign(new Error('rebase fail'), {
          stdout: 'CONFLICT (content): Merge conflict in foo.ts',
          stderr: '',
        });
      }
      return '';
    });
    const result = rebaseOntoMain(
      '/cwd',
      { ...OPTS, upstream: 'deadbeef' },
      deps,
    );
    expect(result.isError).toBe(true);
    const payload = parsePayload(result.content[0].text);
    expect(payload.conflictDetected).toBe(true);
    expect(payload.message).toMatch(/conflicts/);
  });

  it('sets rerere env variables when disableRerere is true', () => {
    let rebaseEnv: Record<string, string> | undefined;
    let call = 0;
    jest.mocked(deps.runGit).mockImplementation((args, _cwd, opts) => {
      call++;
      if (call === 1) return 'feature-branch\n';
      if (args[0] === 'rebase' && args[1] === 'origin/main') {
        rebaseEnv = opts?.env;
        return 'Rebased';
      }
      if (args[0] === 'rev-parse') return 'sha\n';
      if (args[0] === 'rev-list') return '0\n';
      return '';
    });
    rebaseOntoMain('/cwd', { ...OPTS, disableRerere: true }, deps);
    expect(rebaseEnv?.['GIT_CONFIG_KEY_0']).toBe('rerere.enabled');
    expect(rebaseEnv?.['GIT_CONFIG_VALUE_0']).toBe('false');
  });
});
