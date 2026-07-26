import { describe, expect, it, jest } from '@jest/globals';

import {
  executeWorktreeFileMode,
  executeWorktreeSetExecutable,
  type FileModeDeps,
  parseLsFilesModeOutput,
  validateTrackedPaths,
} from './file-mode-utils';

describe('validateTrackedPaths', () => {
  const cwd = '/wt';

  it('accepts a normal relative path', () => {
    expect(validateTrackedPaths(['scripts/foo.sh'], cwd)).toBeNull();
  });

  it('rejects a non-array or empty paths value', () => {
    expect(validateTrackedPaths([], cwd)).toMatch(/non-empty array/);
    expect(validateTrackedPaths(undefined, cwd)).toMatch(/non-empty array/);
  });

  it('rejects more than 100 paths', () => {
    const paths = Array.from({ length: 101 }, (_, i) => `file${i}.sh`);
    expect(validateTrackedPaths(paths, cwd)).toMatch(/Too many paths/);
  });

  it('rejects control characters and empty strings', () => {
    expect(validateTrackedPaths(['foo\nbar'], cwd)).toMatch(/Invalid path/);
    expect(validateTrackedPaths(['' as unknown as string], cwd)).toMatch(
      /Invalid path/,
    );
  });

  it('rejects paths starting with a dash', () => {
    expect(validateTrackedPaths(['-rf'], cwd)).toMatch(/must not start with/);
  });

  it('rejects absolute paths', () => {
    expect(validateTrackedPaths(['/etc/passwd'], cwd)).toMatch(
      /no absolute paths/,
    );
  });

  it('rejects paths with .. segments that escape the worktree root', () => {
    expect(validateTrackedPaths(['../secrets.txt'], cwd)).toMatch(
      /must not escape/,
    );
    expect(validateTrackedPaths(['foo/../../secrets.txt'], cwd)).toMatch(
      /must not escape/,
    );
  });
});

describe('parseLsFilesModeOutput', () => {
  it('parses a normal (100644) mode line', () => {
    const output =
      '100644 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 0\tscripts/foo.sh\n';
    const modes = parseLsFilesModeOutput(output);
    expect(modes.get('scripts/foo.sh')).toBe('100644');
  });

  it('parses an executable (100755) mode line', () => {
    const output =
      '100755 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 0\tscripts/foo.sh\n';
    const modes = parseLsFilesModeOutput(output);
    expect(modes.get('scripts/foo.sh')).toBe('100755');
  });

  it('returns an empty map for empty output (untracked path)', () => {
    expect(parseLsFilesModeOutput('').size).toBe(0);
  });

  it('normalizes backslashes and leading ./ in parsed paths', () => {
    const output =
      '100644 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 0\t./scripts\\foo.sh\n';
    const modes = parseLsFilesModeOutput(output);
    expect(modes.get('scripts/foo.sh')).toBe('100644');
  });
});

describe('executeWorktreeFileMode', () => {
  const okResolver: FileModeDeps['resolveTargetDir'] = () => ({
    path: '/wt',
  });

  it('reports mode and executable:false for a tracked 100644 file', () => {
    const runGit = jest
      .fn<FileModeDeps['runGit']>()
      .mockReturnValue('100644 abc123 0\tscripts/foo.sh\n');

    const res = executeWorktreeFileMode(
      { paths: ['scripts/foo.sh'] },
      { resolveTargetDir: okResolver, runGit },
    );

    expect(runGit).toHaveBeenCalledWith(
      ['ls-files', '-s', '--', 'scripts/foo.sh'],
      '/wt',
      { timeout: 15_000 },
    );
    expect(res.isError).toBeUndefined();
    expect(JSON.parse(res.content[0].text)).toEqual({
      results: [
        {
          path: 'scripts/foo.sh',
          tracked: true,
          mode: '100644',
          executable: false,
        },
      ],
    });
  });

  it('reports mode and executable:true for a tracked 100755 file', () => {
    const runGit = jest
      .fn<FileModeDeps['runGit']>()
      .mockReturnValue('100755 abc123 0\tscripts/foo.sh\n');

    const res = executeWorktreeFileMode(
      { paths: ['scripts/foo.sh'] },
      { resolveTargetDir: okResolver, runGit },
    );

    expect(JSON.parse(res.content[0].text)).toEqual({
      results: [
        {
          path: 'scripts/foo.sh',
          tracked: true,
          mode: '100755',
          executable: true,
        },
      ],
    });
  });

  it('reports tracked:false and no mode for an untracked path', () => {
    const runGit = jest.fn<FileModeDeps['runGit']>().mockReturnValue('');

    const res = executeWorktreeFileMode(
      { paths: ['scratch/untracked.sh'] },
      { resolveTargetDir: okResolver, runGit },
    );

    expect(JSON.parse(res.content[0].text)).toEqual({
      results: [
        { path: 'scratch/untracked.sh', tracked: false, executable: false },
      ],
    });
  });

  it('rejects an out-of-root path without calling git', () => {
    const runGit = jest.fn<FileModeDeps['runGit']>();

    const res = executeWorktreeFileMode(
      { paths: ['../secrets.txt'] },
      { resolveTargetDir: okResolver, runGit },
    );

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/must not escape/);
    expect(runGit).not.toHaveBeenCalled();
  });

  it('returns an error response when the worktree cannot be resolved', () => {
    const runGit = jest.fn<FileModeDeps['runGit']>();
    const res = executeWorktreeFileMode(
      { paths: ['scripts/foo.sh'] },
      {
        resolveTargetDir: () => ({ error: 'No active worktree set.' }),
        runGit,
      },
    );

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe('No active worktree set.');
    expect(runGit).not.toHaveBeenCalled();
  });

  it('surfaces git stderr when git ls-files -s fails', () => {
    const runGit = jest.fn<FileModeDeps['runGit']>().mockImplementation(() => {
      throw Object.assign(new Error('Command failed'), {
        stderr: 'fatal: not a git repository',
      });
    });

    const res = executeWorktreeFileMode(
      { paths: ['scripts/foo.sh'] },
      { resolveTargetDir: okResolver, runGit },
    );

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('git ls-files -s failed');
    expect(res.content[0].text).toContain('not a git repository');
  });
});

describe('executeWorktreeSetExecutable', () => {
  const okResolver: FileModeDeps['resolveTargetDir'] = () => ({
    path: '/wt',
  });

  it('sets the executable bit and reports the new mode', () => {
    const runGit = jest
      .fn<FileModeDeps['runGit']>()
      .mockReturnValueOnce('') // update-index --chmod=+x
      .mockReturnValueOnce('100755 abc123 0\tscripts/foo.sh\n'); // ls-files -s readback

    const res = executeWorktreeSetExecutable(
      { path: 'scripts/foo.sh', executable: true },
      { resolveTargetDir: okResolver, runGit },
    );

    expect(runGit).toHaveBeenNthCalledWith(
      1,
      ['update-index', '--chmod=+x', '--', 'scripts/foo.sh'],
      '/wt',
      { timeout: 15_000 },
    );
    expect(res.isError).toBeUndefined();
    expect(JSON.parse(res.content[0].text)).toEqual({
      path: 'scripts/foo.sh',
      executable: true,
      mode: '100755',
    });
  });

  it('clears the executable bit and reports the new mode', () => {
    const runGit = jest
      .fn<FileModeDeps['runGit']>()
      .mockReturnValueOnce('')
      .mockReturnValueOnce('100644 abc123 0\tscripts/foo.sh\n');

    const res = executeWorktreeSetExecutable(
      { path: 'scripts/foo.sh', executable: false },
      { resolveTargetDir: okResolver, runGit },
    );

    expect(runGit).toHaveBeenNthCalledWith(
      1,
      ['update-index', '--chmod=-x', '--', 'scripts/foo.sh'],
      '/wt',
      { timeout: 15_000 },
    );
    expect(JSON.parse(res.content[0].text)).toEqual({
      path: 'scripts/foo.sh',
      executable: false,
      mode: '100644',
    });
  });

  it('rejects a non-boolean executable value', () => {
    const runGit = jest.fn<FileModeDeps['runGit']>();
    const res = executeWorktreeSetExecutable(
      { path: 'scripts/foo.sh', executable: 'yes' as unknown as boolean },
      { resolveTargetDir: okResolver, runGit },
    );

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/must be a boolean/);
    expect(runGit).not.toHaveBeenCalled();
  });

  it('rejects an out-of-root path without calling git', () => {
    const runGit = jest.fn<FileModeDeps['runGit']>();
    const res = executeWorktreeSetExecutable(
      { path: '../secrets.txt', executable: true },
      { resolveTargetDir: okResolver, runGit },
    );

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/must not escape/);
    expect(runGit).not.toHaveBeenCalled();
  });

  it('surfaces git stderr when update-index fails on an untracked path', () => {
    const runGit = jest.fn<FileModeDeps['runGit']>().mockImplementation(() => {
      throw Object.assign(new Error('Command failed'), {
        stderr:
          "error: pathspec 'scratch/untracked.sh' did not match any file(s) known to git",
      });
    });

    const res = executeWorktreeSetExecutable(
      { path: 'scratch/untracked.sh', executable: true },
      { resolveTargetDir: okResolver, runGit },
    );

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('git update-index --chmod failed');
    expect(res.content[0].text).toContain('did not match any file');
  });

  it('returns an error response when the worktree cannot be resolved', () => {
    const runGit = jest.fn<FileModeDeps['runGit']>();
    const res = executeWorktreeSetExecutable(
      { path: 'scripts/foo.sh', executable: true },
      {
        resolveTargetDir: () => ({ error: 'No active worktree set.' }),
        runGit,
      },
    );

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe('No active worktree set.');
    expect(runGit).not.toHaveBeenCalled();
  });
});
