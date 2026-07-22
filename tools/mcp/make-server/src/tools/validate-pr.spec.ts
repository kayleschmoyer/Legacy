import { describe, expect, it, jest, beforeEach } from '@jest/globals';

import { validatePR } from './validate-pr.js';

jest.mock('../run-command.js', () => ({
  runCommand: jest.fn(),
  runMake: jest.fn(),
  getRepoRoot: jest.fn(() => '/tmp/test-repo-root'),
  TimeoutError: class TimeoutError extends Error {
    partialOutput = '';
    constructor(msg: string, partial = '') {
      super(msg);
      this.partialOutput = partial;
    }
  },
}));

jest.mock('./make-run-bg.js', () => ({
  startMakeInBackground: jest.fn(() => ({
    jobId: 'job-123',
    logPath: '/tmp/job.log',
  })),
  waitForJobDone: jest.fn(),
  readJobLog: jest.fn(() => 'chunk output'),
}));

jest.mock('./run-target-utils.js', () => ({
  parseSteps: jest.fn(() => []),
  extractErrors: jest.fn(() => []),
  truncateOutput: jest.fn((s: unknown) => s),
  MAX_OUTPUT_CHARS: 10000,
}));

jest.mock('node:fs', () => ({
  readdirSync: jest.fn(() => []),
  existsSync: jest.fn(() => true),
}));

const { runCommand: mockRunCommand, runMake: mockRunMake } = jest.requireMock(
  '../run-command.js',
) as { runCommand: jest.Mock<any>; runMake: jest.Mock<any> };
const { existsSync: mockExistsSync } = jest.requireMock('node:fs') as {
  existsSync: jest.Mock<any>;
};
const {
  startMakeInBackground: mockStartMakeInBackground,
  waitForJobDone: mockWaitForJobDone,
} = jest.requireMock('./make-run-bg.js') as {
  startMakeInBackground: jest.Mock<any>;
  waitForJobDone: jest.Mock<any>;
};

/** A terminal job snapshot as returned by waitForJobDone. */
function doneRecord(exitCode = 0, error: string | null = null) {
  return {
    jobId: 'job-123',
    status: exitCode === 0 && error === null ? 'done' : 'failed',
    label: 'make chunk',
    cwd: '/tmp/test-repo-root',
    elapsedSec: 1,
    exitCode,
    error,
    log: 'chunk output',
    meta: { target: 'chunk', workDir: '/tmp/test-repo-root', verbose: false },
  };
}

describe('validatePR', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockRunCommand.mockResolvedValue('0 pending migrations');
    mockRunMake.mockResolvedValue('All pre-commit checks passed');
    mockStartMakeInBackground.mockReturnValue({
      jobId: 'job-123',
      logPath: '/tmp/job.log',
    });
    mockWaitForJobDone.mockResolvedValue(doneRecord());
  });

  describe('worktreePath validation', () => {
    it('errors on relative worktreePath', async () => {
      const result = await validatePR({ worktreePath: 'relative/path' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/absolute path/);
    });

    it('errors when worktreePath does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      const result = await validatePR({
        worktreePath: '/tmp/test-repo-root/missing',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/does not exist/);
    });

    it('errors when worktreePath is outside repo root', async () => {
      const result = await validatePR({ worktreePath: '/tmp/some-other-dir' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/outside the repository root/);
    });

    it('accepts valid absolute path inside repo root', async () => {
      const result = await validatePR({
        worktreePath: '/tmp/test-repo-root/sub-wt',
      });
      expect(result.isError).toBeFalsy();
    });
  });

  describe('background mode', () => {
    it('returns jobId when runPcInBackground is true', async () => {
      const result = await validatePR({ runPcInBackground: true });
      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(result.content[0].text) as {
        pc: { jobId: string; status: string };
      };
      expect(payload.pc.jobId).toBe('job-123');
      expect(payload.pc.status).toBe('running');
    });
  });

  describe('migration handling', () => {
    it('applies migrations when pending and continues with pc', async () => {
      mockRunCommand
        .mockResolvedValueOnce('1 pending migrations')
        .mockResolvedValueOnce('Migration applied');
      const result = await validatePR({});
      expect(result.isError).toBeFalsy();
      expect(mockRunCommand).toHaveBeenCalledTimes(2);
    });

    it('returns error and skips pc when migration fails', async () => {
      mockRunCommand
        .mockResolvedValueOnce('1 pending migrations')
        .mockRejectedValueOnce(new Error('Migration failed'));
      const result = await validatePR({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Migration failed/);
      expect(mockStartMakeInBackground).not.toHaveBeenCalled();
    });
  });

  describe('pc result', () => {
    it('returns passed:true when make pc succeeds', async () => {
      const result = await validatePR({});
      const payload = JSON.parse(result.content[0].text) as {
        pc: { passed: boolean };
      };
      expect(payload.pc.passed).toBe(true);
    });

    it('returns pc.status running with a jobId when pc outlives the sync budget', async () => {
      mockWaitForJobDone.mockResolvedValueOnce({
        ...doneRecord(),
        status: 'running',
        exitCode: null,
        log: undefined,
        logTail: 'chunk output',
      });
      const result = await validatePR({});
      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(result.content[0].text) as {
        pc: { status: string; jobId: string; hint: string };
      };
      expect(payload.pc.status).toBe('running');
      expect(payload.pc.jobId).toBe('job-123');
      expect(payload.pc.hint).toContain('make_run_wait');
    });
  });

  describe('sanctioned chunks mode', () => {
    it('runs all seven chunks in order and returns passed:true', async () => {
      const result = await validatePR({ sanctionedChunks: true });
      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(result.content[0].text) as {
        pc: { passed: boolean; chunks: Array<{ target: string }> };
      };
      expect(payload.pc.passed).toBe(true);
      expect(payload.pc.chunks.map((c) => c.target)).toEqual([
        'pc-db-prep',
        'pc-typecheck',
        'pc-format',
        'pc-lint',
        'pc-workflows',
        'pc-test',
        'pc-build',
      ]);
    });

    it('stops on the first failing chunk', async () => {
      mockWaitForJobDone
        .mockResolvedValueOnce(doneRecord())
        .mockResolvedValueOnce(
          doneRecord(2, 'pc-typecheck exited with code 2'),
        );
      const result = await validatePR({ sanctionedChunks: true });
      expect(result.isError).toBe(true);
      const payload = JSON.parse(result.content[0].text) as {
        pc: { passed: boolean; failedTarget: string };
      };
      expect(payload.pc.passed).toBe(false);
      expect(payload.pc.failedTarget).toBe('pc-typecheck');
      expect(mockStartMakeInBackground).toHaveBeenCalledTimes(2);
    });

    it('returns in_progress with the jobId when a chunk outlives the budget', async () => {
      mockWaitForJobDone.mockResolvedValueOnce({
        ...doneRecord(),
        status: 'running',
        exitCode: null,
        log: undefined,
        logTail: 'chunk output',
      });
      const result = await validatePR({ sanctionedChunks: true });
      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(result.content[0].text) as {
        pc: {
          status: string;
          currentChunk: string;
          jobId: string;
          hint: string;
        };
      };
      expect(payload.pc.status).toBe('in_progress');
      expect(payload.pc.currentChunk).toBe('pc-db-prep');
      expect(payload.pc.jobId).toBe('job-123');
      expect(payload.pc.hint).toContain('make_run_wait');
      expect(payload.pc.hint).toContain('startAtChunk');
    });

    it('startAtChunk resumes mid-sequence and skips the migration check', async () => {
      const result = await validatePR({ startAtChunk: 'pc-test' });
      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(result.content[0].text) as {
        migrations: { skipped: boolean };
        pc: { passed: boolean; chunks: Array<{ target: string }> };
      };
      expect(payload.migrations.skipped).toBe(true);
      expect(mockRunCommand).not.toHaveBeenCalled();
      expect(payload.pc.chunks.map((c) => c.target)).toEqual([
        'pc-test',
        'pc-build',
      ]);
    });

    it('rejects an invalid startAtChunk', async () => {
      const result = await validatePR({
        startAtChunk: 'pc-bogus' as never,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('startAtChunk');
    });
  });
});
