import { describe, expect, it } from '@jest/globals';

import {
  type BranchEntry,
  formatBranchList,
  formatCommitLog,
  formatDiffStat,
  formatObject,
  formatRemoteBranches,
  formatWorktreeList,
  metaLine,
  parseNumstat,
  type RemoteBranchRow,
  type WorktreeListEntry,
} from './format';

describe('metaLine', () => {
  it('joins fields and omits undefined/null', () => {
    expect(metaLine({ total: 3, filter: undefined, base: null })).toBe(
      '_total: 3_',
    );
  });

  it('returns empty string when no fields remain', () => {
    expect(metaLine({ a: undefined, b: null })).toBe('');
  });
});

describe('formatWorktreeList', () => {
  const rows: WorktreeListEntry[] = [
    {
      key: 'LS-1',
      path: '/wt/ls-1',
      branch: 'claude/ls-1',
      nodeModules: 'symlinked -> pool/abc',
      lock: 'none',
    },
  ];

  it('renders a compact table (no padding) with a node_modules header', () => {
    const out = formatWorktreeList(rows, '_Active worktree: /wt/ls-1_');
    const lines = out.split('\n');
    expect(lines[0]).toBe('key|branch|path|node_modules|lock');
    expect(lines[1]).toBe('---|---|---|---|---');
    expect(lines[2]).toBe(
      'LS-1|claude/ls-1|/wt/ls-1|symlinked -> pool/abc|none',
    );
    // No pretty-printed JSON in the output.
    expect(out).not.toContain('{');
    // Footer appended after a blank line.
    expect(out.endsWith('_Active worktree: /wt/ls-1_')).toBe(true);
  });
});

describe('formatRemoteBranches', () => {
  const rows: RemoteBranchRow[] = [
    { branch: 'feat/a', ahead: 2, behind: 0, lastCommitDate: '2026-06-01' },
  ];

  it('renders a table plus a metadata footer', () => {
    const out = formatRemoteBranches({
      rows,
      count: 1,
      totalRemote: 1,
      truncated: false,
      compareBase: 'origin/main',
    });
    expect(out).toContain('branch|ahead|behind|lastCommitDate');
    expect(out).toContain('feat/a|2|0|2026-06-01');
    expect(out).toContain('_count: 1');
    expect(out).toContain('compareBase: origin/main_');
  });

  it('returns only the footer when there are no rows', () => {
    const out = formatRemoteBranches({
      rows: [],
      count: 0,
      totalRemote: 0,
      truncated: false,
      compareBase: 'origin/main',
    });
    expect(out.startsWith('_count: 0')).toBe(true);
    expect(out).not.toContain('|');
  });

  it('includes mergedInto only when provided', () => {
    expect(
      formatRemoteBranches({
        rows: [],
        count: 0,
        totalRemote: 0,
        truncated: false,
        compareBase: 'origin/main',
        mergedInto: 'origin/main',
      }),
    ).toContain('mergedInto: origin/main');
  });
});

describe('formatBranchList', () => {
  const branches: BranchEntry[] = [
    { name: 'main', type: 'local', current: true },
    { name: 'origin/main', type: 'remote', current: false },
  ];

  it('renders a table with a total/filter footer', () => {
    const out = formatBranchList(branches, '^claude/');
    expect(out).toContain('name|type|current');
    expect(out).toContain('main|local|true');
    expect(out).toContain('origin/main|remote|false');
    expect(out).toContain('_total: 2 · filter: ^claude/_');
  });

  it('returns only the footer for an empty list', () => {
    expect(formatBranchList([], undefined)).toBe('_total: 0_');
  });
});

describe('formatCommitLog', () => {
  const commits = [
    {
      sha: 'a'.repeat(40),
      shortSha: 'abc1234',
      message: 'feat: thing',
      author: 'Dev',
      date: '2026-06-01T00:00:00Z',
      refs: 'HEAD -> main',
    },
  ];

  it('renders a table and drops the full 40-char sha', () => {
    const out = formatCommitLog(commits);
    expect(out).toContain('shortSha|date|author|message|refs');
    expect(out).toContain('abc1234');
    // Full sha pruned (shortSha is a valid ref).
    expect(out).not.toContain('a'.repeat(40));
  });

  it('signals an empty log explicitly', () => {
    expect(formatCommitLog([])).toBe('_commits: 0_');
  });
});

describe('parseNumstat / formatDiffStat', () => {
  it('parses numeric and binary (-) numstat rows', () => {
    const rows = parseNumstat('12\t3\tsrc/a.ts\n-\t-\tassets/logo.png\n');
    expect(rows).toEqual([
      { path: 'src/a.ts', insertions: 12, deletions: 3 },
      { path: 'assets/logo.png', insertions: '-', deletions: '-' },
    ]);
  });

  it('renders a stat table with a totals footer excluding binary counts', () => {
    const rows = parseNumstat('12\t3\tsrc/a.ts\n-\t-\tassets/logo.png\n');
    const out = formatDiffStat(rows);
    expect(out).toContain('path|insertions|deletions');
    expect(out).toContain('src/a.ts|12|3');
    expect(out).toContain('assets/logo.png|-|-');
    expect(out).toContain(
      '_files changed: 2 · insertions: +12 · deletions: -3_',
    );
  });

  it('returns only a zeroed footer for an empty diff', () => {
    expect(formatDiffStat([])).toBe(
      '_files changed: 0 · insertions: +0 · deletions: -0_',
    );
  });
});

describe('formatObject', () => {
  it('serializes single objects as minified JSON (no pretty-print whitespace)', () => {
    const out = formatObject({ branch: 'main', clean: true, modified: [] });
    expect(out).toBe('{"branch":"main","clean":true,"modified":[]}');
    expect(out).not.toContain('\n');
  });
});
