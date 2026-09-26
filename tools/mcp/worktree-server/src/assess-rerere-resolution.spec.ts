import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assessRerereResolution,
  listUnmergedPaths,
  parseRerereResolvedPaths,
  type RerereAssessmentDeps,
} from './assess-rerere-resolution';

const RESOLVED_LINE = (path: string) =>
  `Resolved '${path}' using previous resolution.`;

/** Deps backed by an in-memory file map, for the unit-level cases. */
function fakeDeps(
  lsFilesU: string,
  files: Record<string, string> = {},
): RerereAssessmentDeps {
  return {
    runShell: (cmd: string) => {
      if (cmd === 'git ls-files -u') return lsFilesU;
      throw new Error(`unexpected command: ${cmd}`);
    },
    readFile: (path: string) => {
      const key = path.replace(/^\/cwd\//, '');
      if (!(key in files)) throw new Error(`ENOENT: ${path}`);
      return files[key];
    },
    join: (...segments: string[]) => segments.join('/'),
  };
}

describe('parseRerereResolvedPaths', () => {
  it('extracts each resolved path from rebase output', () => {
    const output = [
      'Auto-merging src/a.ts',
      'CONFLICT (content): Merge conflict in src/a.ts',
      RESOLVED_LINE('src/a.ts'),
      RESOLVED_LINE('src/b.ts'),
    ].join('\n');
    expect(parseRerereResolvedPaths(output)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('returns an empty list when rerere reported nothing', () => {
    expect(
      parseRerereResolvedPaths(
        'CONFLICT (content): Merge conflict in src/a.ts',
      ),
    ).toEqual([]);
  });

  it('does not match a resolved-looking sentence mid-line', () => {
    expect(
      parseRerereResolvedPaths(
        "note: we Resolved 'src/a.ts' using previous resolution. earlier",
      ),
    ).toEqual([]);
  });
});

describe('listUnmergedPaths', () => {
  it('dedupes the three conflict stages into one path per file', () => {
    const lsFilesU = [
      '100644 aaa 1\tsrc/a.ts',
      '100644 bbb 2\tsrc/a.ts',
      '100644 ccc 3\tsrc/a.ts',
      '100644 ddd 2\tsrc/b.ts',
      '',
    ].join('\n');
    expect(listUnmergedPaths('/cwd', fakeDeps(lsFilesU))).toEqual([
      'src/a.ts',
      'src/b.ts',
    ]);
  });

  it('returns an empty list when git fails', () => {
    const deps = {
      runShell: () => {
        throw new Error('not a git repository');
      },
    };
    expect(listUnmergedPaths('/cwd', deps)).toEqual([]);
  });
});

describe('assessRerereResolution', () => {
  const conflicted = [
    'before',
    '<<<<<<< HEAD',
    'ours',
    '=======',
    'theirs',
    '>>>>>>> 694ca5ada',
    'after',
  ].join('\n');

  it('refuses to auto-continue when rerere is disabled, even with no unmerged paths left', () => {
    const result = assessRerereResolution(
      '/cwd',
      'CONFLICT (content): Merge conflict in src/a.ts',
      { disableRerere: true },
      fakeDeps(''),
    );
    expect(result.autoContinueSafe).toBe(false);
    expect(result.rerereResolvedPaths).toEqual([]);
    expect(result.pathsToStage).toEqual([]);
    expect(result.reason).toContain('disableRerere');
  });

  it('refuses to auto-continue when rerere reported no resolution', () => {
    const result = assessRerereResolution(
      '/cwd',
      'CONFLICT (content): Merge conflict in src/a.ts',
      { disableRerere: false },
      fakeDeps('100644 aaa 1\tsrc/a.ts\n', { 'src/a.ts': conflicted }),
    );
    expect(result.autoContinueSafe).toBe(false);
    expect(result.unmergedPaths).toEqual(['src/a.ts']);
    expect(result.reason).toContain('did not report replaying');
  });

  it('refuses to auto-continue when rerere resolved only some conflicted files', () => {
    const result = assessRerereResolution(
      '/cwd',
      RESOLVED_LINE('src/a.ts'),
      { disableRerere: false },
      fakeDeps(
        ['100644 aaa 1\tsrc/a.ts', '100644 bbb 1\tsrc/b.ts', ''].join('\n'),
        { 'src/a.ts': 'clean\n', 'src/b.ts': conflicted },
      ),
    );
    expect(result.autoContinueSafe).toBe(false);
    expect(result.unaccountedPaths).toEqual(['src/b.ts']);
    expect(result.pathsToStage).toEqual([]);
  });

  it('refuses to auto-continue when a "resolved" file still has conflict markers', () => {
    const result = assessRerereResolution(
      '/cwd',
      RESOLVED_LINE('src/a.ts'),
      { disableRerere: false },
      fakeDeps('100644 aaa 1\tsrc/a.ts\n', { 'src/a.ts': conflicted }),
    );
    expect(result.autoContinueSafe).toBe(false);
    expect(result.markerPaths).toEqual(['src/a.ts']);
    expect(result.reason).toContain('conflict markers are still present');
  });

  it('auto-continues and stages only the resolved paths when rerere genuinely resolved everything', () => {
    const result = assessRerereResolution(
      '/cwd',
      RESOLVED_LINE('src/a.ts'),
      { disableRerere: false },
      fakeDeps('100644 aaa 1\tsrc/a.ts\n', { 'src/a.ts': 'merged\n' }),
    );
    expect(result.autoContinueSafe).toBe(true);
    expect(result.pathsToStage).toEqual(['src/a.ts']);
  });

  it('auto-continues when rerere.autoUpdate already staged the resolution', () => {
    const result = assessRerereResolution(
      '/cwd',
      RESOLVED_LINE('src/a.ts'),
      { disableRerere: false },
      fakeDeps('', { 'src/a.ts': 'merged\n' }),
    );
    expect(result.autoContinueSafe).toBe(true);
    expect(result.pathsToStage).toEqual([]);
  });

  it('ignores an unreadable (deleted or binary) conflicted path when scanning markers', () => {
    const result = assessRerereResolution(
      '/cwd',
      RESOLVED_LINE('src/gone.ts'),
      { disableRerere: false },
      fakeDeps('100644 aaa 1\tsrc/gone.ts\n', {}),
    );
    expect(result.markerPaths).toEqual([]);
    expect(result.autoContinueSafe).toBe(true);
  });
});

describe('assessRerereResolution against a real git repo (LS-10254)', () => {
  let workDir: string;
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: workDir, encoding: 'utf-8' });

  const realDeps = (): RerereAssessmentDeps => ({
    runShell: (cmd: string) =>
      execFileSync(cmd, { cwd: workDir, encoding: 'utf-8', shell: true }),
    readFile: (path: string) => readFileSync(path, 'utf8'),
    join,
  });

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'worktree-rerere-assess-test-'));
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: workDir });
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    git('config', 'rerere.enabled', 'false');

    writeFileSync(join(workDir, 'surface-map.json'), 'base\n');
    git('add', '.');
    git('commit', '-q', '-m', 'base');

    // main advances
    writeFileSync(join(workDir, 'surface-map.json'), 'from-main\n');
    git('commit', '-q', '-am', 'main change');

    // feature branch off the base commit, touching the same line
    git('checkout', '-q', '-b', 'feature', 'HEAD~1');
    writeFileSync(join(workDir, 'surface-map.json'), 'from-feature\n');
    git('commit', '-q', '-am', 'feature change');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  /**
   * The exact scenario from LS-10254: a genuine content conflict with rerere
   * disabled. The old implementation ran `git add -u` first, which cleared the
   * unmerged status and made it conclude "rerere auto-resolved all conflicts",
   * committing the markers.
   */
  it('reports a genuine content conflict as unsafe to auto-continue with rerere disabled', () => {
    let rebaseOutput = '';
    try {
      execFileSync('git', ['-c', 'rerere.enabled=false', 'rebase', 'main'], {
        cwd: workDir,
        encoding: 'utf-8',
      });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      rebaseOutput = [e.stdout, e.stderr].filter(Boolean).join('\n');
    }

    expect(rebaseOutput).toContain('CONFLICT');
    expect(git('status', '--porcelain')).toContain('UU');

    const result = assessRerereResolution(
      workDir,
      rebaseOutput,
      { disableRerere: true },
      realDeps(),
    );

    expect(result.autoContinueSafe).toBe(false);
    expect(result.unmergedPaths).toEqual(['surface-map.json']);
    expect(result.pathsToStage).toEqual([]);

    // And the assessment must not have staged anything: the file is still
    // unmerged and still carries its markers.
    expect(git('status', '--porcelain')).toContain('UU');
    expect(readFileSync(join(workDir, 'surface-map.json'), 'utf8')).toContain(
      '<<<<<<<',
    );

    git('rebase', '--abort');
  });

  /**
   * Negative control pinning the exact mechanism of LS-10254: `git add -u`
   * clears the unmerged status, so the old "stage first, then check
   * --diff-filter=U" sequence saw a clean tree for a file that still has raw
   * conflict markers. If this ever stops holding, the guard above is passing
   * for the wrong reason.
   */
  it('confirms the old stage-then-check sequence reports a clean tree for the same conflict', () => {
    try {
      execFileSync('git', ['-c', 'rerere.enabled=false', 'rebase', 'main'], {
        cwd: workDir,
        encoding: 'utf-8',
      });
    } catch {
      // Expected: the rebase stops on the conflict.
    }

    expect(git('diff', '--name-only', '--diff-filter=U').trim()).toBe(
      'surface-map.json',
    );

    git('add', '-u');

    expect(git('diff', '--name-only', '--diff-filter=U').trim()).toBe('');
    expect(readFileSync(join(workDir, 'surface-map.json'), 'utf8')).toContain(
      '<<<<<<<',
    );

    git('rebase', '--abort');
  });

  it('also reports it as unsafe when rerere is enabled but has no cached resolution', () => {
    let rebaseOutput = '';
    try {
      execFileSync('git', ['-c', 'rerere.enabled=true', 'rebase', 'main'], {
        cwd: workDir,
        encoding: 'utf-8',
      });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      rebaseOutput = [e.stdout, e.stderr].filter(Boolean).join('\n');
    }

    const result = assessRerereResolution(
      workDir,
      rebaseOutput,
      { disableRerere: false },
      realDeps(),
    );

    expect(result.autoContinueSafe).toBe(false);
    expect(result.rerereResolvedPaths).toEqual([]);
    expect(result.unmergedPaths).toEqual(['surface-map.json']);

    git('rebase', '--abort');
  });

  /**
   * Positive control: the legitimate rerere replay must still auto-continue.
   * Guards against the tightened check being so strict that it never fires —
   * and pins the `Resolved '<path>' using previous resolution.` output shape
   * the verdict now depends on.
   */
  it('permits auto-continue when rerere genuinely replays a recorded resolution', () => {
    // rerere must be on for BOTH passes: the preimage is recorded when the
    // conflict appears, but the resolution is only recorded at
    // `rebase --continue` time.
    git('config', 'rerere.enabled', 'true');
    const featureSha = git('rev-parse', 'HEAD').trim();

    // First pass: hit the conflict, resolve it by hand so rerere records it.
    try {
      git('rebase', 'main');
    } catch {
      // Expected: the rebase stops on the conflict.
    }
    writeFileSync(join(workDir, 'surface-map.json'), 'merged\n');
    git('add', 'surface-map.json');
    execFileSync('git', ['-c', 'core.editor=true', 'rebase', '--continue'], {
      cwd: workDir,
      encoding: 'utf-8',
    });

    // Second pass over the same conflict: rerere replays its resolution.
    git('reset', '-q', '--hard', featureSha);
    let rebaseOutput = '';
    try {
      git('rebase', 'main');
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      rebaseOutput = [e.stdout, e.stderr].filter(Boolean).join('\n');
    }

    expect(rebaseOutput).toContain(
      "Resolved 'surface-map.json' using previous resolution.",
    );

    const result = assessRerereResolution(
      workDir,
      rebaseOutput,
      { disableRerere: false },
      realDeps(),
    );

    expect(result.autoContinueSafe).toBe(true);
    expect(result.rerereResolvedPaths).toEqual(['surface-map.json']);
    expect(result.markerPaths).toEqual([]);
    expect(result.pathsToStage).toEqual(['surface-map.json']);

    git('rebase', '--abort');
  });
});
