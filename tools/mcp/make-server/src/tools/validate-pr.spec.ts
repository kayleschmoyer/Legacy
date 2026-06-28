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

describe('validatePR', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockRunCommand.mockResolvedValue('0 pending migrations');
    mockRunMake.mockResolvedValue('All pre-commit checks passed');
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
      expect(mockRunMake).not.toHaveBeenCalled();
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
  });
});
