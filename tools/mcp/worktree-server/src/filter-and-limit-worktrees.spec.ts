import { filterAndLimitWorktrees } from './filter-and-limit-worktrees';

const wt = (key: string, branch: string, path: string, isStale: boolean) => ({
  key,
  branch,
  path,
  isStale,
});

describe('filterAndLimitWorktrees', () => {
  const worktrees = [
    wt('a', 'claude/ls-9815-foo', '/repo/.claude/worktrees/a', false),
    wt('b', 'claude/ls-1234-bar', '/repo/.claude/worktrees/b', true),
    wt('c', 'main', '/repo', false),
  ];

  it('returns everything unfiltered and uncapped when no options are given', () => {
    const result = filterAndLimitWorktrees(worktrees, {});
    expect(result.filtered).toEqual(worktrees);
    expect(result.capped).toEqual(worktrees);
    expect(result.truncated).toBe(false);
  });

  it('filters by pattern against key, branch, and path', () => {
    const result = filterAndLimitWorktrees(worktrees, { pattern: 'LS-9815' });
    expect(result.filtered.map((w) => w.key)).toEqual(['a']);
  });

  it('filters to stale-only worktrees with nodeModulesFilter: "stale"', () => {
    const result = filterAndLimitWorktrees(worktrees, {
      nodeModulesFilter: 'stale',
    });
    expect(result.filtered.map((w) => w.key)).toEqual(['b']);
  });

  it('filters to active-only worktrees with nodeModulesFilter: "active"', () => {
    const result = filterAndLimitWorktrees(worktrees, {
      nodeModulesFilter: 'active',
    });
    expect(result.filtered.map((w) => w.key)).toEqual(['a', 'c']);
  });

  it('combines pattern and nodeModulesFilter', () => {
    const result = filterAndLimitWorktrees(worktrees, {
      pattern: 'claude',
      nodeModulesFilter: 'stale',
    });
    expect(result.filtered.map((w) => w.key)).toEqual(['b']);
  });

  it('defaults the cap to 20 when no limit is given', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      wt(`k${i}`, `branch-${i}`, `/path/${i}`, false),
    );
    const result = filterAndLimitWorktrees(many, {});
    expect(result.capped).toHaveLength(20);
    expect(result.truncated).toBe(true);
  });

  it('honours an explicit positive limit', () => {
    const result = filterAndLimitWorktrees(worktrees, { limit: 2 });
    expect(result.capped).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('falls back to the default limit for a non-positive limit', () => {
    const result = filterAndLimitWorktrees(worktrees, { limit: 0 });
    expect(result.capped).toEqual(worktrees);
    expect(result.truncated).toBe(false);
  });

  it('reports truncated: false when everything fits under the limit', () => {
    const result = filterAndLimitWorktrees(worktrees, { limit: 10 });
    expect(result.capped).toEqual(worktrees);
    expect(result.truncated).toBe(false);
  });
});
