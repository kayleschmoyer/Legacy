import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { type RebaseDeps, rebaseOntoMain } from './rebase-onto-main';

type RunGitFn = RebaseDeps['runGit'];
type RunShellFn = RebaseDeps['runShell'];

function makeDeps(overrides: Partial<RebaseDeps> = {}): RebaseDeps {
  return {
    runGit: jest.fn<RunGitFn>().mockReturnValue(''),
    runShell: jest.fn<RunShellFn>().mockReturnValue(''),
    nonInteractiveEnv: { GIT_TERMINAL_PROMPT: '0' },
    ensureSufficientDepth: jest
      .fn<RebaseDeps['ensureSufficientDepth']>()
      .mockReturnValue([]),
    isShallowRepository: jest
      .fn<RebaseDeps['isShallowRepository']>()
      .mockReturnValue(false),
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
  conflictedFiles?: string[];
  conflictCount?: number;
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

  it('captures conflictedFiles before aborting the rebase (LS-10421)', () => {
    let aborted = false;
    jest.mocked(deps.runGit).mockImplementation((args) => {
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') {
        return 'feature-branch\n';
      }
      if (args[0] === 'rev-parse') return 'abc123\n';
      if (args[0] === 'rev-list') return '1\n';
      if (args[0] === 'rebase' && args[1] === '--abort') {
        aborted = true;
        return '';
      }
      if (args[0] === 'rebase') {
        throw Object.assign(new Error('rebase fail'), {
          stdout: 'CONFLICT (content): Merge conflict in a.ts',
          stderr: '',
        });
      }
      return '';
    });
    // Unmerged paths only exist until the abort restores the pre-rebase tree.
    jest
      .mocked(deps.runShell)
      .mockImplementation((cmd) =>
        cmd.includes('--diff-filter=U') && !aborted ? 'a.ts\nb.ts\n' : '',
      );

    const result = rebaseOntoMain('/cwd', OPTS, deps);
    expect(result.isError).toBe(true);
    const payload = parsePayload(result.content[0].text);
    expect(payload.conflictedFiles).toEqual(['a.ts', 'b.ts']);
    expect(payload.conflictCount).toBe(2);
    expect(payload.message).toMatch(/worktree_conflict_info/);
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

  it('calls ensureSufficientDepth against origin/<onto> before rebasing (LS-9967)', () => {
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
    rebaseOntoMain('/cwd', OPTS, deps);
    expect(deps.ensureSufficientDepth).toHaveBeenCalledWith(
      '/cwd',
      'origin/main',
    );
  });

  it('deepens a shallow clone before rebasing so add/add conflicts never surface', () => {
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
    jest
      .mocked(deps.ensureSufficientDepth)
      .mockReturnValue(['Shallow clone detected — deepening...']);
    const result = rebaseOntoMain('/cwd', OPTS, deps);
    expect(result.isError).toBeFalsy();
    const payload = parsePayload(result.content[0].text);
    expect(payload.log).toMatch(/Shallow clone detected/);
  });

  it('attributes a wide add/add conflict spread to a shallow clone instead of rerere', () => {
    let call = 0;
    const conflictedFiles = Array.from(
      { length: 150 },
      (_, i) => `file-${i}.ts`,
    );
    jest.mocked(deps.runGit).mockImplementation((args) => {
      call++;
      if (call === 1) return 'feature-branch\n';
      if (args[0] === 'fetch') return '';
      if (args[0] === 'rev-parse') return 'abc123\n';
      if (args[0] === 'rev-list') return '1\n';
      if (args[0] === 'rebase' && args[1] === 'origin/main') {
        throw Object.assign(new Error('rebase fail'), {
          stdout: 'CONFLICT (add/add): Merge conflict in file-0.ts',
          stderr: '',
        });
      }
      return '';
    });
    jest.mocked(deps.runShell).mockImplementation((cmd) => {
      if (cmd.includes('diff --name-only')) {
        return conflictedFiles.join('\n');
      }
      return '';
    });
    jest.mocked(deps.isShallowRepository).mockReturnValue(true);

    const result = rebaseOntoMain('/cwd', OPTS, deps);
    expect(result.isError).toBe(true);
    const payload = parsePayload(result.content[0].text);
    expect(payload.conflictDetected).toBe(true);
    expect(payload.message).toMatch(/shallow clone/i);
    expect(payload.message).not.toMatch(/rr-cache/i);
  });

  it('still blames rerere/rr-cache for conflict markers when the repo is not shallow', () => {
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
    jest.mocked(deps.isShallowRepository).mockReturnValue(false);
    const result = rebaseOntoMain('/cwd', OPTS, deps);
    expect(result.isError).toBe(true);
    const payload = parsePayload(result.content[0].text);
    expect(payload.message).toMatch(/rr-cache/i);
  });

  it('attributes silently-committed conflict markers to a shallow clone instead of rerere', () => {
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
    jest.mocked(deps.isShallowRepository).mockReturnValue(true);
    const result = rebaseOntoMain('/cwd', OPTS, deps);
    expect(result.isError).toBe(true);
    const payload = parsePayload(result.content[0].text);
    expect(payload.message).toMatch(/shallow clone/i);
    expect(payload.message).not.toMatch(/rr-cache/i);
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
