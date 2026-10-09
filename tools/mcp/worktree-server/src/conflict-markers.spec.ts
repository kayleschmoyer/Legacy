import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  getConflictInfo,
  listReplayedCommitFiles,
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
      ['grep', '--cached', '-l', '-E', '^<<<<<<<'],
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

describe('scanStagedForConflictMarkers against a real git repo (LS-9943)', () => {
  let workDir: string;
  const realRunGit = (args: string[], cwd: string): string =>
    execFileSync('git', args, { cwd, encoding: 'utf-8' });

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'worktree-conflict-marker-test-'));
    execFileSync('git', ['init', '-q'], { cwd: workDir });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], {
      cwd: workDir,
    });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workDir });
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('does not flag a file whose marker-like substrings are not at the start of a line', () => {
    // Mirrors the false positives reported in LS-9943: doc examples and test
    // fixtures that legitimately discuss conflict-marker syntax mid-line.
    writeFileSync(
      join(workDir, 'conflict-markers.spec.ts'),
      [
        "it('detects <<<<<<< markers', () => {",
        "  expect(scan(file)).toContain('<<<<<<<');",
        '});',
      ].join('\n'),
    );
    execFileSync('git', ['add', '.'], { cwd: workDir });
    expect(scanStagedForConflictMarkers(workDir, realRunGit)).toEqual([]);
  });

  it('still flags a file with a genuine conflict marker at the start of a line', () => {
    writeFileSync(
      join(workDir, 'foo.ts'),
      ['before', '<<<<<<< HEAD', 'ours', 'after'].join('\n'),
    );
    execFileSync('git', ['add', '.'], { cwd: workDir });
    expect(scanStagedForConflictMarkers(workDir, realRunGit)).toEqual([
      'foo.ts',
    ]);
  });
});

describe('post-rebase scan scoped to replayed commits (LS-10282)', () => {
  let workDir: string;
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: workDir, encoding: 'utf-8' });
  const realRunGit = (args: string[], cwd: string): string =>
    execFileSync('git', args, { cwd, encoding: 'utf-8' });
  const markerDoc = [
    '# Resolving conflicts',
    '```',
    '<<<<<<< HEAD',
    'ours',
    '=======',
    'theirs',
    '>>>>>>> main',
    '```',
  ].join('\n');

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'worktree-replayed-scan-test-'));
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFileSync(join(workDir, 'a.txt'), 'a\n');
    git('add', '.');
    git('commit', '-qm', 'init');
    git('checkout', '-q', '-b', 'feature');
    writeFileSync(join(workDir, 'feature.ts'), 'export const x = 1;\n');
    git('add', '.');
    git('commit', '-qm', 'feature work');
    // main gains a doc that documents conflict markers
    git('checkout', '-q', 'main');
    writeFileSync(join(workDir, 'guide.md'), markerDoc);
    git('add', '.');
    git('commit', '-qm', 'add marker guide');
    git('checkout', '-q', 'feature');
    git('rebase', 'main');
    // `git rebase` leaves ORIG_HEAD at the pre-rebase tip
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('lists only files the replayed commits modified', () => {
    expect(listReplayedCommitFiles(workDir, realRunGit)).toEqual([
      'feature.ts',
    ]);
  });

  it('does not flag a marker-documenting doc that arrived via the base', () => {
    // Unscoped, the staged scan false-positives on guide.md.
    expect(scanStagedForConflictMarkers(workDir, realRunGit)).toEqual([
      'guide.md',
    ]);
    const scoped = listReplayedCommitFiles(workDir, realRunGit) ?? undefined;
    expect(scanStagedForConflictMarkers(workDir, realRunGit, scoped)).toEqual(
      [],
    );
  });

  it('still flags a real committed marker in a replayed file', () => {
    writeFileSync(
      join(workDir, 'feature.ts'),
      ['<<<<<<< HEAD', 'a', '=======', 'b', '>>>>>>> main'].join('\n'),
    );
    git('add', '.');
    git('commit', '-qm', 'bad resolution');
    const files = ['feature.ts'];
    expect(scanStagedForConflictMarkers(workDir, realRunGit, files)).toEqual([
      'feature.ts',
    ]);
  });

  it('scans nothing when the replayed set is empty', () => {
    const runGit = jest.fn<(args: string[], cwd: string) => string>();
    expect(scanStagedForConflictMarkers('/cwd', runGit, [])).toEqual([]);
    expect(runGit).not.toHaveBeenCalled();
  });

  it('returns null when the replayed set cannot be determined', () => {
    const runGit = jest
      .fn<(args: string[], cwd: string) => string>()
      .mockImplementation(() => {
        throw new Error('no ORIG_HEAD');
      });
    expect(listReplayedCommitFiles('/cwd', runGit)).toBeNull();
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
