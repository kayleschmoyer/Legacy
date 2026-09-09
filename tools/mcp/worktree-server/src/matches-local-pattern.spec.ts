import { describe, expect, it } from '@jest/globals';

import { matchesLocalPattern } from './matches-local-pattern';

describe('matchesLocalPattern', () => {
  it('matches a plain (no-wildcard) pattern as a case-insensitive substring', () => {
    const matches = matchesLocalPattern('LS-9782');

    expect(matches('claude/LS-9782-worktree-name')).toBe(true);
    expect(matches('ls-9782')).toBe(true);
    expect(matches('LS-1111')).toBe(false);
  });

  it('checks a plain pattern against every field passed in', () => {
    const matches = matchesLocalPattern('LS-9782');

    expect(
      matches('some-key', 'unrelated-branch', '/path/to/LS-9782-worktree'),
    ).toBe(true);
    expect(matches('some-key', 'unrelated-branch', '/unrelated/path')).toBe(
      false,
    );
  });

  it('matches a wildcard pattern as a full-string glob', () => {
    const matches = matchesLocalPattern('*serene-planck*');

    expect(matches('claude/serene-planck-8kz29t')).toBe(true);
    expect(matches('serene-planck')).toBe(true);
    expect(matches('serene')).toBe(false);
  });

  it('does not substring-match a wildcard pattern outside the glob', () => {
    const matches = matchesLocalPattern('LS-9782-*');

    expect(matches('LS-9782-worktree')).toBe(true);
    expect(matches('prefix-LS-9782-worktree')).toBe(false);
  });

  it('is case-insensitive for wildcard patterns too', () => {
    const matches = matchesLocalPattern('*Serene-Planck*');

    expect(matches('claude/serene-planck-8kz29t')).toBe(true);
  });
});
