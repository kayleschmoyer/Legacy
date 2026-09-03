import { describe, expect, it, jest } from '@jest/globals';

import { runOnRef, type RunOnRefDeps } from './run-on-ref';

type RunGitFn = RunOnRefDeps['runGit'];
type ExecFn = RunOnRefDeps['exec'];

function makeDeps(overrides: Partial<RunOnRefDeps> = {}): RunOnRefDeps {
  return {
    runGit: jest.fn<RunGitFn>().mockReturnValue(''),
    exec: jest.fn<ExecFn>().mockReturnValue(''),
    ensureSufficientDepth: jest.fn().mockReturnValue([]),
    linkScriptPath: '/main/scripts/modules-pool/link.mjs',
    execPath: '/usr/bin/node',
    resolveShell: jest.fn().mockReturnValue({
      shell: '/bin/sh',
      buildArgs: (command: string) => ['-c', command],
    }),
    mainRepo: '/main',
    tmpWorktreePath: jest
      .fn()
      .mockReturnValue('/tmp/legacy-sports-ref-check-1'),
    rmSync: jest.fn(),
    ...overrides,
  };
}

interface Payload {
  success?: boolean;
  ref?: string;
  command?: string;
  exitCode?: number;
  output?: string;
  modulesLinkSucceeded?: boolean | null;
  modulesLinkOutput?: string;
  cleanedUp?: boolean;
  log?: string;
  message?: string;
  error?: string;
}

function parse(text: string): Payload {
  return JSON.parse(text) as Payload;
}

/** Builds an Error carrying the extra fields execFileSync-style execs throw on failure. */
function execError(fields: {
  stdout?: string;
  stderr?: string;
  status?: number | null;
  signal?: string | null;
}): Error {
  return Object.assign(new Error('command failed'), fields);
}

describe('runOnRef', () => {
  it('rejects an empty command before touching git', () => {
    const deps = makeDeps();
    const result = runOnRef({ command: '   ' }, deps);
    expect(result.isError).toBe(true);
    expect(deps.runGit).not.toHaveBeenCalled();
  });

  it('rejects an invalid ref before touching git', () => {
    const deps = makeDeps();
    const result = runOnRef(
      { command: 'echo hi', ref: '--upload-pack=evil' },
      deps,
    );
    expect(result.isError).toBe(true);
    expect(deps.runGit).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range timeoutSeconds', () => {
    const deps = makeDeps();
    const result = runOnRef({ command: 'echo hi', timeoutSeconds: 9999 }, deps);
    expect(result.isError).toBe(true);
    expect(deps.runGit).not.toHaveBeenCalled();
  });

  it('defaults ref to origin/main', () => {
    const deps = makeDeps();
    const result = runOnRef({ command: 'echo hi' }, deps);
    expect(parse(result.content[0].text).ref).toBe('origin/main');
  });

  it('runs the full happy path: checkout, link, execute, cleanup', () => {
    const deps = makeDeps({
      exec: jest.fn<ExecFn>().mockReturnValue('command output\n'),
    });
    const result = runOnRef({ command: 'node scripts/check.mjs' }, deps);

    expect(deps.runGit).toHaveBeenCalledWith(
      [
        'worktree',
        'add',
        '--detach',
        '/tmp/legacy-sports-ref-check-1',
        'origin/main',
      ],
      '/main',
      { timeout: 60_000 },
    );
    expect(deps.exec).toHaveBeenCalledWith(
      '/usr/bin/node',
      [
        '/main/scripts/modules-pool/link.mjs',
        '--worktree=/tmp/legacy-sports-ref-check-1',
        '--main-repo=/main',
      ],
      { cwd: '/main', timeout: 300_000 },
    );
    expect(deps.exec).toHaveBeenCalledWith(
      '/bin/sh',
      ['-c', 'node scripts/check.mjs'],
      { cwd: '/tmp/legacy-sports-ref-check-1', timeout: 180_000 },
    );
    expect(deps.runGit).toHaveBeenCalledWith(
      ['worktree', 'remove', '--force', '/tmp/legacy-sports-ref-check-1'],
      '/main',
      { timeout: 30_000 },
    );

    const payload = parse(result.content[0].text);
    expect(result.isError).toBe(false);
    expect(payload).toMatchObject({
      success: true,
      exitCode: 0,
      output: 'command output\n',
      modulesLinkSucceeded: true,
      cleanedUp: true,
    });
  });

  it('skips node_modules linking when skipModulesLink is set', () => {
    const deps = makeDeps();
    const result = runOnRef(
      { command: 'echo hi', skipModulesLink: true },
      deps,
    );
    // Only the shell-command exec call, never the link.mjs invocation.
    expect(deps.exec).toHaveBeenCalledTimes(1);
    expect(parse(result.content[0].text).modulesLinkSucceeded).toBeNull();
  });

  it('returns an error immediately when the worktree checkout fails, without running the command or cleanup', () => {
    const deps = makeDeps({
      runGit: jest.fn<RunGitFn>().mockImplementation((gitArgs) => {
        if (gitArgs[0] === 'worktree' && gitArgs[1] === 'add') {
          throw new Error('fatal: reference is not a tree: bogus-ref');
        }
        return '';
      }),
    });
    const result = runOnRef({ command: 'echo hi', ref: 'bogus-ref' }, deps);

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/bogus-ref/);
    expect(deps.exec).not.toHaveBeenCalled();
  });

  it('continues to run the command when node_modules linking fails, and reports it', () => {
    const deps = makeDeps({
      exec: jest
        .fn<ExecFn>()
        .mockImplementationOnce(() => {
          throw execError({ stdout: '', stderr: 'link failed', status: 1 });
        })
        .mockImplementationOnce(() => 'ran anyway\n'),
    });
    const result = runOnRef({ command: 'echo hi' }, deps);
    const payload = parse(result.content[0].text);
    expect(payload.modulesLinkSucceeded).toBe(false);
    expect(payload.modulesLinkOutput).toContain('link failed');
    expect(payload.output).toBe('ran anyway\n');
    expect(payload.success).toBe(true);
  });

  it('reports a non-zero command exit code and still cleans up', () => {
    const deps = makeDeps({
      exec: jest
        .fn<ExecFn>()
        .mockImplementationOnce(() => '') // modules-pool link succeeds
        .mockImplementationOnce(() => {
          throw execError({
            stdout: 'partial output',
            stderr: 'boom',
            status: 2,
          });
        }),
    });
    const result = runOnRef({ command: 'false' }, deps);

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.exitCode).toBe(2);
    expect(payload.output).toContain('boom');
    expect(payload.cleanedUp).toBe(true);
  });

  it('reports the timeout signal in the output when the command is killed', () => {
    const deps = makeDeps({
      exec: jest
        .fn<ExecFn>()
        .mockImplementationOnce(() => '')
        .mockImplementationOnce(() => {
          throw execError({
            stdout: '',
            stderr: '',
            signal: 'SIGTERM',
            status: null,
          });
        }),
    });
    const result = runOnRef({ command: 'sleep 999' }, deps);
    const payload = parse(result.content[0].text);
    expect(payload.output).toMatch(/SIGTERM/);
    expect(payload.output).toMatch(/timeout/i);
  });

  it('falls back to rmSync + git worktree prune when git worktree remove fails', () => {
    const deps = makeDeps({
      exec: jest.fn<ExecFn>().mockReturnValue(''),
      runGit: jest.fn<RunGitFn>().mockImplementation((gitArgs) => {
        if (gitArgs[0] === 'worktree' && gitArgs[1] === 'remove') {
          throw new Error('worktree is dirty');
        }
        return '';
      }),
    });
    const result = runOnRef({ command: 'echo hi' }, deps);

    expect(deps.rmSync).toHaveBeenCalledWith('/tmp/legacy-sports-ref-check-1', {
      recursive: true,
      force: true,
    });
    expect(deps.runGit).toHaveBeenCalledWith(['worktree', 'prune'], '/main', {
      timeout: 30_000,
    });
    const payload = parse(result.content[0].text);
    expect(payload.cleanedUp).toBe(true);
  });

  it('reports cleanedUp: false when every cleanup step fails', () => {
    const deps = makeDeps({
      exec: jest.fn<ExecFn>().mockReturnValue(''),
      runGit: jest.fn<RunGitFn>().mockImplementation((gitArgs) => {
        if (gitArgs[0] === 'worktree' && gitArgs[1] === 'remove') {
          throw new Error('worktree is dirty');
        }
        if (gitArgs[0] === 'worktree' && gitArgs[1] === 'prune') {
          throw new Error('prune failed too');
        }
        return '';
      }),
      rmSync: jest.fn(() => {
        throw new Error('EBUSY');
      }),
    });
    const result = runOnRef({ command: 'echo hi' }, deps);
    const payload = parse(result.content[0].text);
    expect(payload.cleanedUp).toBe(false);
    expect(payload.log).toMatch(/prune failed too/);
  });
});
