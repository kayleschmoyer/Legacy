import { describe, expect, it, jest } from '@jest/globals';

import {
  formatRunOnRefSnapshot,
  RUN_ON_REF_JOB_KIND,
  runOnRef,
  type RunOnRefDeps,
  type RunOnRefJobSnapshot,
} from './run-on-ref';
import {
  RUN_ON_REF_CLEANED_UP_MARKER,
  RUN_ON_REF_CLEANUP_FAILED_MARKER,
} from './run-on-ref-script';

type RunGitFn = RunOnRefDeps['runGit'];
type ExecFn = RunOnRefDeps['exec'];

function doneSnapshot(
  overrides: Partial<RunOnRefJobSnapshot> = {},
): RunOnRefJobSnapshot {
  return {
    jobId: 'wt-1',
    status: 'done',
    exitCode: 0,
    error: null,
    elapsedSec: 3,
    log: `command output\n${RUN_ON_REF_CLEANED_UP_MARKER}`,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<RunOnRefDeps> = {}): RunOnRefDeps {
  return {
    runGit: jest.fn<RunGitFn>().mockReturnValue(''),
    exec: jest.fn<ExecFn>().mockReturnValue(''),
    ensureSufficientDepth: jest.fn().mockReturnValue([]),
    linkScriptPath: '/main/scripts/modules-pool/link.mjs',
    execPath: '/usr/bin/node',
    resolveShell: jest.fn().mockReturnValue({
      shell: '/bin/sh',
      buildArgs: (script: string) => ['-c', script],
    }),
    mainRepo: '/main',
    tmpWorktreePath: jest
      .fn()
      .mockReturnValue('/tmp/legacy-sports-ref-check-1'),
    runJobWithBudget: jest
      .fn<RunOnRefDeps['runJobWithBudget']>()
      .mockResolvedValue(doneSnapshot()),
    jobSyncBudgetMs: 45_000,
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
  cleanupWarning?: string;
  log?: string;
  message?: string;
  error?: string;
  jobId?: string;
  status?: string;
}

function parse(text: string): Payload {
  return JSON.parse(text) as Payload;
}

describe('runOnRef', () => {
  it('rejects an empty command before touching git', async () => {
    const deps = makeDeps();
    const result = await runOnRef({ command: '   ' }, deps);
    expect(result.isError).toBe(true);
    expect(deps.runGit).not.toHaveBeenCalled();
  });

  it('rejects an invalid ref before touching git', async () => {
    const deps = makeDeps();
    const result = await runOnRef(
      { command: 'echo hi', ref: '--upload-pack=evil' },
      deps,
    );
    expect(result.isError).toBe(true);
    expect(deps.runGit).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range timeoutSeconds', async () => {
    const deps = makeDeps();
    const result = await runOnRef(
      { command: 'echo hi', timeoutSeconds: 9999 },
      deps,
    );
    expect(result.isError).toBe(true);
    expect(deps.runGit).not.toHaveBeenCalled();
  });

  it('defaults ref to origin/main', async () => {
    const deps = makeDeps();
    const result = await runOnRef({ command: 'echo hi' }, deps);
    expect(parse(result.content[0].text).ref).toBe('origin/main');
  });

  it('runs the full happy path: checkout, link, then hands the command to a background job', async () => {
    const deps = makeDeps({
      runJobWithBudget: jest
        .fn<RunOnRefDeps['runJobWithBudget']>()
        .mockResolvedValue(
          doneSnapshot({
            log: `command output\n${RUN_ON_REF_CLEANED_UP_MARKER}`,
          }),
        ),
    });
    const result = await runOnRef({ command: 'node scripts/check.mjs' }, deps);

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

    expect(deps.runJobWithBudget).toHaveBeenCalledWith(
      expect.objectContaining({
        command: '/bin/sh',
        cwd: '/main',
        timeoutMs: 180_000,
        meta: expect.objectContaining({
          kind: RUN_ON_REF_JOB_KIND,
          ref: 'origin/main',
          command: 'node scripts/check.mjs',
          modulesLinkSucceeded: true,
        }),
      }),
      45_000,
    );
    // The generated script cds into the throwaway worktree and runs the command.
    const [opts] = (deps.runJobWithBudget as jest.Mock).mock.calls[0] as [
      { args: string[] },
    ];
    expect(opts.args[1]).toContain(
      `cd '/tmp/legacy-sports-ref-check-1' && node scripts/check.mjs`,
    );

    const payload = parse(result.content[0].text);
    expect(result.isError).toBe(false);
    expect(payload).toMatchObject({
      success: true,
      exitCode: 0,
      output: 'command output',
      modulesLinkSucceeded: true,
      cleanedUp: true,
    });
  });

  it('skips node_modules linking when skipModulesLink is set', async () => {
    const deps = makeDeps();
    const result = await runOnRef(
      { command: 'echo hi', skipModulesLink: true },
      deps,
    );
    expect(deps.exec).not.toHaveBeenCalled();
    expect(parse(result.content[0].text).modulesLinkSucceeded).toBeNull();
  });

  it('returns an error immediately when the worktree checkout fails, without starting a job', async () => {
    const deps = makeDeps({
      runGit: jest.fn<RunGitFn>().mockImplementation((gitArgs) => {
        if (gitArgs[0] === 'worktree' && gitArgs[1] === 'add') {
          throw new Error('fatal: reference is not a tree: bogus-ref');
        }
        return '';
      }),
    });
    const result = await runOnRef(
      { command: 'echo hi', ref: 'bogus-ref' },
      deps,
    );

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/bogus-ref/);
    expect(deps.exec).not.toHaveBeenCalled();
    expect(deps.runJobWithBudget).not.toHaveBeenCalled();
  });

  it('continues to run the command when node_modules linking fails, and reports it', async () => {
    const deps = makeDeps({
      exec: jest.fn<ExecFn>().mockImplementationOnce(() => {
        throw Object.assign(new Error('command failed'), {
          stdout: '',
          stderr: 'link failed',
          status: 1,
        });
      }),
    });
    const result = await runOnRef({ command: 'echo hi' }, deps);
    const payload = parse(result.content[0].text);
    expect(payload.modulesLinkSucceeded).toBe(false);
    expect(payload.success).toBe(true);
  });

  it('reports a non-zero command exit code and still reports cleanedUp from the job log', async () => {
    const deps = makeDeps({
      runJobWithBudget: jest
        .fn<RunOnRefDeps['runJobWithBudget']>()
        .mockResolvedValue(
          doneSnapshot({
            status: 'failed',
            exitCode: 2,
            error: 'exited with code 2',
            log: `partial output\nboom\n${RUN_ON_REF_CLEANED_UP_MARKER}`,
          }),
        ),
    });
    const result = await runOnRef({ command: 'false' }, deps);

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.exitCode).toBe(2);
    expect(payload.output).toContain('boom');
    expect(payload.cleanedUp).toBe(true);
  });

  it('reports cleanedUp: false and a warning when every cleanup fallback failed', async () => {
    const deps = makeDeps({
      runJobWithBudget: jest
        .fn<RunOnRefDeps['runJobWithBudget']>()
        .mockResolvedValue(
          doneSnapshot({
            log: `command output\n${RUN_ON_REF_CLEANUP_FAILED_MARKER}`,
          }),
        ),
    });
    const result = await runOnRef({ command: 'echo hi' }, deps);
    const payload = parse(result.content[0].text);
    expect(payload.cleanedUp).toBe(false);
    expect(payload.cleanupWarning).toMatch(/stray git worktree/);
  });

  it('returns a pollable jobId when the command outlives the sync budget, without cleanedUp yet', async () => {
    const deps = makeDeps({
      runJobWithBudget: jest
        .fn<RunOnRefDeps['runJobWithBudget']>()
        .mockResolvedValue({
          jobId: 'wt-2',
          status: 'running',
          exitCode: null,
          error: null,
          elapsedSec: 45,
          logTail: 'still compiling...',
          hint: 'Call worktree_job_wait({ jobId: "wt-2" })',
        }),
    });
    const result = await runOnRef({ command: 'pnpm exec tsc --noEmit' }, deps);
    const payload = parse(result.content[0].text);
    expect(payload.jobId).toBe('wt-2');
    expect(payload.status).toBe('running');
    expect(payload.cleanedUp).toBeUndefined();
  });
});

describe('formatRunOnRefSnapshot', () => {
  const meta = {
    ref: 'origin/main',
    command: 'pnpm exec tsc --noEmit',
    modulesLinkSucceeded: true,
    setupLog: '$ git fetch origin\nFetch complete.',
  };

  it('rebuilds the same shape for a job observed complete later via worktree_job_wait', () => {
    const snapshot = doneSnapshot({
      log: `all good\n${RUN_ON_REF_CLEANED_UP_MARKER}`,
    });
    const result = formatRunOnRefSnapshot(snapshot, meta);
    const payload = parse(result.content[0].text);
    expect(payload).toMatchObject({
      success: true,
      ref: 'origin/main',
      command: 'pnpm exec tsc --noEmit',
      cleanedUp: true,
    });
    expect(payload.log).toContain('Fetch complete.');
  });
});
