import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../run-command.js', () => ({
  getRepoRoot: jest.fn(() => '/repo'),
  runNx: jest.fn(),
}));
jest.mock('../jobs.js', () => ({ runJobWithBudget: jest.fn() }));

import { runJobWithBudget } from '../jobs.js';
import type { JobSnapshot, StartJobOptions } from '../jobs.js';
import {
  coalesceWindowsTestPathPatterns,
  isTargetAllowed,
  runTarget,
} from './run-target.js';

const mockRunJob = runJobWithBudget as jest.MockedFunction<
  typeof runJobWithBudget
>;

/** Configure runJobWithBudget to resolve with a terminal "done" snapshot. */
function setupJob(): void {
  mockRunJob.mockImplementation(async (jobOpts: StartJobOptions) => {
    const snapshot: JobSnapshot = {
      jobId: 'nx-test-job',
      status: 'done',
      label: jobOpts.label,
      cwd: jobOpts.cwd,
      elapsedSec: 1,
      exitCode: 0,
      error: null,
      meta: jobOpts.meta,
      log: '',
    };
    return snapshot;
  });
}

/** The nx args passed to the (mocked) job runner in the first call. */
function jobCallArgs(): string[] {
  return mockRunJob.mock.calls[0][0].args;
}

describe('coalesceWindowsTestPathPatterns', () => {
  it('coalesces two separate values into a single pipe-separated token', () => {
    expect(
      coalesceWindowsTestPathPatterns([
        '--testPathPatterns',
        'expo-public-env',
        'statsApiUrl',
      ]),
    ).toEqual(['--testPathPatterns', 'expo-public-env|statsApiUrl']);
  });

  it('coalesces three values into a single pipe-separated token', () => {
    expect(
      coalesceWindowsTestPathPatterns([
        '--testPathPatterns',
        'FileA',
        'FileB',
        'FileC',
      ]),
    ).toEqual(['--testPathPatterns', 'FileA|FileB|FileC']);
  });

  it('leaves a single value unchanged (no coalescing needed)', () => {
    expect(
      coalesceWindowsTestPathPatterns(['--testPathPatterns', 'FileA']),
    ).toEqual(['--testPathPatterns', 'FileA']);
  });

  it('leaves a single already-pipe-separated value unchanged', () => {
    expect(
      coalesceWindowsTestPathPatterns([
        '--testPathPatterns',
        'expo-public-env|statsApiUrl',
      ]),
    ).toEqual(['--testPathPatterns', 'expo-public-env|statsApiUrl']);
  });

  it('stops coalescing at flag boundaries (does not absorb --all)', () => {
    expect(
      coalesceWindowsTestPathPatterns([
        '--testPathPatterns',
        'FileA',
        'FileB',
        '--all',
      ]),
    ).toEqual(['--testPathPatterns', 'FileA|FileB', '--all']);
  });

  it('handles equals-form with one trailing value', () => {
    expect(
      coalesceWindowsTestPathPatterns([
        '--testPathPatterns=expo-public-env',
        'statsApiUrl',
      ]),
    ).toEqual(['--testPathPatterns=expo-public-env|statsApiUrl']);
  });

  it('handles equals-form with two trailing values', () => {
    expect(
      coalesceWindowsTestPathPatterns([
        '--testPathPatterns=FileA',
        'FileB',
        'FileC',
      ]),
    ).toEqual(['--testPathPatterns=FileA|FileB|FileC']);
  });

  it('returns tokens unchanged when no --testPathPatterns flag is present', () => {
    expect(coalesceWindowsTestPathPatterns(['--all', '--verbose'])).toEqual([
      '--all',
      '--verbose',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = ['--testPathPatterns', 'FileA', 'FileB'];
    const original = [...input];
    coalesceWindowsTestPathPatterns(input);
    expect(input).toEqual(original);
  });
});

describe('isTargetAllowed', () => {
  it('allows exact matches from the allowlist', () => {
    expect(isTargetAllowed('test')).toBe(true);
    expect(isTargetAllowed('deploy:plan')).toBe(true);
  });

  it('allows colon-suffixed variants of an allowed base target', () => {
    expect(isTargetAllowed('test:web')).toBe(true);
    expect(isTargetAllowed('test:mobile')).toBe(true);
    expect(isTargetAllowed('test:stories')).toBe(true);
  });

  it('rejects a colon-suffixed variant whose base is not allowed', () => {
    expect(isTargetAllowed('deploy:staging')).toBe(false);
  });

  it('rejects a target with no allowlist match at all', () => {
    expect(isTargetAllowed('publish')).toBe(false);
  });
});

describe('runTarget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts test:web and test:mobile variants', async () => {
    setupJob();
    const web = await runTarget({
      project: 'shared-components',
      target: 'test:web',
    });
    const mobile = await runTarget({
      project: 'shared-components',
      target: 'test:mobile',
    });
    expect(web.isError).toBeUndefined();
    expect(mobile.isError).toBeUndefined();
  });

  it('accepts the test:stories variant', async () => {
    setupJob();
    const result = await runTarget({
      project: 'shared-components',
      target: 'test:stories',
    });
    expect(result.isError).toBeUndefined();
  });

  it('still rejects a disallowed colon-suffixed target with the allowlist error', async () => {
    const result = await runTarget({ project: 'x', target: 'deploy:staging' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not in the allowed list/);
    expect(mockRunJob).not.toHaveBeenCalled();
  });

  it('auto-appends --all when --testPathPatterns is passed against test:web', async () => {
    setupJob();
    await runTarget({
      project: 'shared-components',
      target: 'test:web',
      args: ['--testPathPatterns', 'SomeFile'],
    });
    expect(jobCallArgs()).toContain('--all');
  });

  it('appends --updateSnapshot for test:mobile when requested', async () => {
    setupJob();
    await runTarget({
      project: 'shared-components',
      target: 'test:mobile',
      updateSnapshot: true,
    });
    expect(jobCallArgs()).toContain('--updateSnapshot');
  });
});
