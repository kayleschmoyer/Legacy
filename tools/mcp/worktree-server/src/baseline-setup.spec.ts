import { describe, expect, it, jest } from '@jest/globals';

import {
  baselineSetup,
  type BaselineSetupDeps,
  slugifyRef,
} from './baseline-setup';

type RunGitFn = BaselineSetupDeps['runGit'];
type ExecFn = BaselineSetupDeps['exec'];

function makeDeps(
  overrides: Partial<BaselineSetupDeps> = {},
): BaselineSetupDeps {
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
    baselineWorktreePath: jest
      .fn()
      .mockReturnValue('/tmp/legacy-sports-baseline/origin-main'),
    existsSync: jest.fn().mockReturnValue(false),
    rmSync: jest.fn(),
    ...overrides,
  };
}

interface Payload {
  success?: boolean;
  ref?: string;
  worktreePath?: string;
  reused?: boolean;
  removed?: boolean;
  modulesLinkSucceeded?: boolean | null;
  modulesLinkOutput?: string;
  buildSucceeded?: boolean | null;
  buildOutput?: string;
  hint?: string;
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

describe('slugifyRef', () => {
  it('replaces disallowed characters with hyphens', () => {
    expect(slugifyRef('origin/main')).toBe('origin-main');
    expect(slugifyRef('claude/LS-9744-baseline')).toBe(
      'claude-LS-9744-baseline',
    );
  });
});

describe('baselineSetup', () => {
  it('rejects an invalid ref before touching git', () => {
    const deps = makeDeps();
    const result = baselineSetup({ ref: '--upload-pack=evil' }, deps);
    expect(result.isError).toBe(true);
    expect(deps.runGit).not.toHaveBeenCalled();
  });

  it('defaults ref to origin/main', () => {
    const deps = makeDeps();
    const result = baselineSetup({}, deps);
    expect(parse(result.content[0].text).ref).toBe('origin/main');
  });

  it('runs the full happy path: fetch, checkout, link, build', () => {
    const deps = makeDeps({
      exec: jest.fn<ExecFn>().mockReturnValue('ok\n'),
    });
    const result = baselineSetup({}, deps);

    expect(deps.runGit).toHaveBeenCalledWith(['fetch', 'origin'], '/main', {
      timeout: 60_000,
    });
    expect(deps.runGit).toHaveBeenCalledWith(
      [
        'worktree',
        'add',
        '--detach',
        '/tmp/legacy-sports-baseline/origin-main',
        'origin/main',
      ],
      '/main',
      { timeout: 60_000 },
    );
    expect(deps.exec).toHaveBeenCalledWith(
      '/usr/bin/node',
      [
        '/main/scripts/modules-pool/link.mjs',
        '--worktree=/tmp/legacy-sports-baseline/origin-main',
        '--main-repo=/main',
      ],
      { cwd: '/main', timeout: 300_000 },
    );
    expect(deps.exec).toHaveBeenCalledWith(
      '/bin/sh',
      ['-c', 'pnpm exec nx build web'],
      { cwd: '/tmp/legacy-sports-baseline/origin-main', timeout: 600_000 },
    );

    const payload = parse(result.content[0].text);
    expect(result.isError).toBe(false);
    expect(payload).toMatchObject({
      success: true,
      worktreePath: '/tmp/legacy-sports-baseline/origin-main',
      reused: false,
      modulesLinkSucceeded: true,
      buildSucceeded: true,
    });
    expect(payload.hint).toContain('nx_run_e2e_specs');
  });

  it('reuses and refreshes an existing baseline worktree instead of re-adding it', () => {
    const deps = makeDeps({ existsSync: jest.fn().mockReturnValue(true) });
    const result = baselineSetup({ ref: 'main' }, deps);

    expect(deps.runGit).not.toHaveBeenCalledWith(
      expect.arrayContaining(['worktree', 'add']),
      expect.anything(),
      expect.anything(),
    );
    expect(deps.runGit).toHaveBeenCalledWith(
      ['checkout', '--detach', 'main'],
      '/tmp/legacy-sports-baseline/origin-main',
      { timeout: 60_000 },
    );
    expect(parse(result.content[0].text).reused).toBe(true);
  });

  it('skips node_modules linking when skipModulesLink is set', () => {
    const deps = makeDeps();
    const result = baselineSetup({ skipModulesLink: true }, deps);
    // Only the build exec call, never the link.mjs invocation.
    expect(deps.exec).toHaveBeenCalledTimes(1);
    expect(parse(result.content[0].text).modulesLinkSucceeded).toBeNull();
  });

  it('skips the build step when skipBuild is set', () => {
    const deps = makeDeps();
    const result = baselineSetup({ skipBuild: true }, deps);
    // Only the link.mjs exec call, never the build.
    expect(deps.exec).toHaveBeenCalledTimes(1);
    expect(parse(result.content[0].text).buildSucceeded).toBeNull();
  });

  it('returns an error when the worktree checkout fails, without linking or building', () => {
    const deps = makeDeps({
      runGit: jest.fn<RunGitFn>().mockImplementation((gitArgs) => {
        if (gitArgs[0] === 'worktree' && gitArgs[1] === 'add') {
          throw new Error('fatal: reference is not a tree: bogus-ref');
        }
        return '';
      }),
    });
    const result = baselineSetup({ ref: 'bogus-ref' }, deps);

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/bogus-ref/);
    expect(deps.exec).not.toHaveBeenCalled();
  });

  it('reports a failed build as an overall failure while keeping the worktree', () => {
    const deps = makeDeps({
      exec: jest
        .fn<ExecFn>()
        .mockImplementationOnce(() => '') // modules-pool link succeeds
        .mockImplementationOnce(() => {
          throw execError({
            stdout: 'partial',
            stderr: 'build broke',
            status: 1,
          });
        }),
    });
    const result = baselineSetup({}, deps);

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.buildSucceeded).toBe(false);
    expect(payload.buildOutput).toContain('build broke');
    // The worktree itself is not removed on a build failure.
    expect(deps.rmSync).not.toHaveBeenCalled();
  });

  describe('cleanup', () => {
    it('reports nothing to clean up when no baseline worktree exists', () => {
      const deps = makeDeps({ existsSync: jest.fn().mockReturnValue(false) });
      const result = baselineSetup({ cleanup: true }, deps);

      expect(result.isError).toBe(false);
      const payload = parse(result.content[0].text);
      expect(payload.success).toBe(true);
      expect(payload.removed).toBe(false);
      expect(deps.runGit).not.toHaveBeenCalled();
    });

    it('removes an existing baseline worktree', () => {
      const deps = makeDeps({ existsSync: jest.fn().mockReturnValue(true) });
      const result = baselineSetup({ cleanup: true }, deps);

      expect(deps.runGit).toHaveBeenCalledWith(
        [
          'worktree',
          'remove',
          '--force',
          '/tmp/legacy-sports-baseline/origin-main',
        ],
        '/main',
        { timeout: 30_000 },
      );
      const payload = parse(result.content[0].text);
      expect(result.isError).toBe(false);
      expect(payload.success).toBe(true);
      expect(payload.removed).toBe(true);
    });

    it('falls back to rmSync + git worktree prune when git worktree remove fails', () => {
      const deps = makeDeps({
        existsSync: jest.fn().mockReturnValue(true),
        runGit: jest.fn<RunGitFn>().mockImplementation((gitArgs) => {
          if (gitArgs[0] === 'worktree' && gitArgs[1] === 'remove') {
            throw new Error('worktree is dirty');
          }
          return '';
        }),
      });
      const result = baselineSetup({ cleanup: true }, deps);

      expect(deps.rmSync).toHaveBeenCalledWith(
        '/tmp/legacy-sports-baseline/origin-main',
        { recursive: true, force: true },
      );
      expect(deps.runGit).toHaveBeenCalledWith(['worktree', 'prune'], '/main', {
        timeout: 30_000,
      });
      const payload = parse(result.content[0].text);
      expect(result.isError).toBe(false);
      expect(payload.removed).toBe(true);
    });

    it('reports failure when every cleanup step fails', () => {
      const deps = makeDeps({
        existsSync: jest.fn().mockReturnValue(true),
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
      const result = baselineSetup({ cleanup: true }, deps);

      expect(result.isError).toBe(true);
      const payload = parse(result.content[0].text);
      expect(payload.success).toBe(false);
      expect(payload.removed).toBe(false);
      expect(payload.log).toMatch(/prune failed too/);
    });
  });
});
