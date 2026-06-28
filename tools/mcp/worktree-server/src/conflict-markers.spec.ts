import { describe, expect, it, jest } from '@jest/globals';

import { scanStagedForConflictMarkers } from './conflict-markers';

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
