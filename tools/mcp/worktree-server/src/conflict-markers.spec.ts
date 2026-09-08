import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  getConflictInfo,
  scanStagedForConflictMarkers,
  scanWorkingTreeForConflictMarkers,
} from './conflict-markers';

describe('scanStagedForConflictMarkers', () => {
  it('returns empty array when git grep exits non-zero (no matches)', () => {
    const runGit = jest
      .fn<(args: string[], cwd: string) => string>()
      .mockImplementation(() => {
        throw Object.assign(new Error('exit 1'), { status: 1 });
      });
    expect(scanStagedForConflictMarkers('/cwd', runGit)).toEqual([]);
  });

  it('returns file list when conflict markers are found', () => {
    const runGit = jest
      .fn<(args: string[], cwd: string) => string>()
      .mockReturnValue('src/foo.ts\nsrc/bar.ts\n');
    const result = scanStagedForConflictMarkers('/cwd', runGit);
    expect(result).toEqual(['src/foo.ts', 'src/bar.ts']);
    expect(runGit).toHaveBeenCalledWith(
      ['grep', '--cached', '-l', '<<<<<<<'],
      '/cwd',
    );
  });

  it('filters empty lines from output', () => {
    const runGit = jest
      .fn<(args: string[], cwd: string) => string>()
      .mockReturnValue('\nsrc/baz.ts\n\n');
    expect(scanStagedForConflictMarkers('/cwd', runGit)).toEqual([
      'src/baz.ts',
    ]);
  });
});

describe('getConflictInfo', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'worktree-conflict-info-test-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('returns no files when there are no conflicts', () => {
    const run = jest
      .fn<(cmd: string, cwd: string) => string>()
      .mockReturnValue('');
    expect(getConflictInfo(workDir, run)).toEqual({ files: [] });
  });

  it('parses marker line ranges and previews for a conflicted file', () => {
    writeFileSync(
      join(workDir, 'foo.ts'),
      [
        'before',
        '<<<<<<< HEAD',
        'ours',
        '=======',
        'theirs',
        '>>>>>>> origin/main',
        'after',
      ].join('\n'),
    );
    const run = jest
      .fn<(cmd: string, cwd: string) => string>()
      .mockReturnValue('foo.ts\0');
    const result = getConflictInfo(workDir, run);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('foo.ts');
    expect(result.files[0].conflicts).toEqual([
      {
        startLine: 2,
        separatorLine: 4,
        endLine: 6,
        oursPreview: 'ours',
        theirsPreview: 'theirs',
      },
    ]);
  });

  it('reports a conflicted file with no markers when it does not exist on disk', () => {
    const run = jest
      .fn<(cmd: string, cwd: string) => string>()
      .mockReturnValue('missing.ts\0');
    const result = getConflictInfo(workDir, run);
    expect(result.files).toEqual([{ path: 'missing.ts', conflicts: [] }]);
  });

  it('falls back to a working-tree marker scan when git reports no unmerged files (rerere bad resolution)', () => {
    writeFileSync(
      join(workDir, 'foo.ts'),
      [
        'before',
        '<<<<<<< HEAD',
        'ours',
        '=======',
        'theirs',
        '>>>>>>> origin/main',
        'after',
      ].join('\n'),
    );
    const run = jest
      .fn<(cmd: string, cwd: string) => string>()
      .mockImplementation((cmd: string) => {
        if (cmd.includes('diff --name-only')) return '';
        if (cmd.includes('git grep')) return 'foo.ts\n';
        throw new Error(`unexpected command: ${cmd}`);
      });
    const result = getConflictInfo(workDir, run);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('foo.ts');
    expect(result.files[0].conflicts).toEqual([
      {
        startLine: 2,
        separatorLine: 4,
        endLine: 6,
        oursPreview: 'ours',
        theirsPreview: 'theirs',
      },
    ]);
  });

  it('does not run the working-tree fallback scan when git already reports unmerged files', () => {
    const run = jest
      .fn<(cmd: string, cwd: string) => string>()
      .mockImplementation((cmd: string) => {
        if (cmd.includes('diff --name-only')) return 'missing.ts\0';
        throw new Error(`unexpected command: ${cmd}`);
      });
    const result = getConflictInfo(workDir, run);
    expect(result.files).toEqual([{ path: 'missing.ts', conflicts: [] }]);
  });

  it('returns no files when neither git diff nor the working-tree scan find markers', () => {
    const run = jest
      .fn<(cmd: string, cwd: string) => string>()
      .mockImplementation((cmd: string) => {
        if (cmd.includes('diff --name-only')) return '';
        if (cmd.includes('git grep')) {
          throw Object.assign(new Error('exit 1'), { status: 1 });
        }
        throw new Error(`unexpected command: ${cmd}`);
      });
    expect(getConflictInfo(workDir, run)).toEqual({ files: [] });
  });
});

describe('scanWorkingTreeForConflictMarkers', () => {
  it('returns empty array when git grep exits non-zero (no matches)', () => {
    const run = jest
      .fn<(cmd: string, cwd: string) => string>()
      .mockImplementation(() => {
        throw Object.assign(new Error('exit 1'), { status: 1 });
      });
    expect(scanWorkingTreeForConflictMarkers('/cwd', run)).toEqual([]);
  });

  it('returns file list when conflict markers are found in the working tree', () => {
    const run = jest
      .fn<(cmd: string, cwd: string) => string>()
      .mockReturnValue('src/foo.ts\nsrc/bar.ts\n');
    const result = scanWorkingTreeForConflictMarkers('/cwd', run);
    expect(result).toEqual(['src/foo.ts', 'src/bar.ts']);
  });
});
