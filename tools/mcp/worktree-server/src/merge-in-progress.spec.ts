import { describe, expect, it } from '@jest/globals';

import { mergeCommitRefusal, parseUnmergedPaths } from './merge-in-progress';

describe('parseUnmergedPaths', () => {
  it('returns an empty list for empty output', () => {
    expect(parseUnmergedPaths('')).toEqual([]);
    expect(parseUnmergedPaths('\n')).toEqual([]);
  });

  it('splits newline-separated paths', () => {
    expect(parseUnmergedPaths('a.ts\nb/c.ts\n')).toEqual(['a.ts', 'b/c.ts']);
  });
});

describe('mergeCommitRefusal', () => {
  it('allows concluding the merge when no unmerged paths remain', () => {
    expect(mergeCommitRefusal([], false)).toBeNull();
  });

  it('refuses and lists every path while conflicts remain', () => {
    const msg = mergeCommitRefusal(['a.ts', 'b.ts'], false);
    expect(msg).toContain('2 path(s)');
    expect(msg).toContain('  - a.ts');
    expect(msg).toContain('  - b.ts');
    expect(msg).toContain('git merge --abort');
  });

  it('refuses amend mid-merge even when conflicts are resolved', () => {
    expect(mergeCommitRefusal([], true)).toContain('cannot amend');
  });
});
