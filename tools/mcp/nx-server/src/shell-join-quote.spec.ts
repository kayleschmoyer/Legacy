import { describe, expect, it } from '@jest/globals';

import { quoteForShellJoin } from './shell-join-quote.js';

/**
 * These run on Linux in CI, so they assert the POSIX branch. The Windows
 * branch is exercised by the platform-switch test below.
 */
describe('quoteForShellJoin (LS-10153)', () => {
  it('leaves a single-word value untouched (negative control)', () => {
    expect(quoteForShellJoin('keeper')).toBe('keeper');
  });

  it('leaves a pipe-alternated path pattern untouched — no whitespace to split', () => {
    expect(quoteForShellJoin('DraftRail|DraftDetailsPanel')).toBe(
      'DraftRail|DraftDetailsPanel',
    );
  });

  it('quotes a multi-word value so it stays one shell word', () => {
    expect(quoteForShellJoin('keeper entitlement gate')).toBe(
      "'keeper entitlement gate'",
    );
  });

  it('quotes the em-dash + parens shape real describe blocks use', () => {
    expect(
      quoteForShellJoin(
        'createLeagueAndTeams mutation — keeper entitlement gate (LS-8385)',
      ),
    ).toBe(
      "'createLeagueAndTeams mutation — keeper entitlement gate (LS-8385)'",
    );
  });

  it('splices an embedded single quote out of and back into the quoting', () => {
    // 'it doesn'\''t crash' — the only character POSIX single quotes cannot
    // contain, so it is closed, escaped, and reopened.
    expect(quoteForShellJoin("it doesn't crash")).toBe(
      "'it doesn'\\''t crash'",
    );
  });

  it('wraps in backslash-escaped double quotes on Windows, where single quotes do not quote', () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      // Backslash-escaped so the pair survives escapeCmdShellArg's own
      // double-quote wrapping of the outer `pnpm exec nx` arg.
      expect(quoteForShellJoin('keeper entitlement gate')).toBe(
        '\\"keeper entitlement gate\\"',
      );
      expect(quoteForShellJoin('keeper')).toBe('keeper');
    } finally {
      if (original) Object.defineProperty(process, 'platform', original);
    }
  });
});
