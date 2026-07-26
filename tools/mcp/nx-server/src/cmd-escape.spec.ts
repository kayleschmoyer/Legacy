import { describe, expect, it } from '@jest/globals';

import { escapeCmdShellArg } from './cmd-escape.js';

describe('escapeCmdShellArg', () => {
  it('wraps args containing parens in double-quotes', () => {
    expect(escapeCmdShellArg('(app)/(tabs)/players.spec')).toBe(
      '"(app)/(tabs)/players.spec"',
    );
  });

  it('wraps args containing a pipe in double-quotes', () => {
    expect(escapeCmdShellArg('expo-public-env|statsApiUrl')).toBe(
      '"expo-public-env|statsApiUrl"',
    );
  });

  it('wraps args containing < in double-quotes', () => {
    expect(escapeCmdShellArg('a<b')).toBe('"a<b"');
  });

  it('wraps args containing > in double-quotes', () => {
    expect(escapeCmdShellArg('a>b')).toBe('"a>b"');
  });

  it('wraps args containing whitespace in double-quotes', () => {
    expect(escapeCmdShellArg('Mobile Chrome')).toBe('"Mobile Chrome"');
  });

  it('passes plain args through unchanged', () => {
    expect(escapeCmdShellArg('players.spec')).toBe('players.spec');
  });

  it('passes args with hyphens and dots through unchanged', () => {
    expect(escapeCmdShellArg('--testPathPatterns=foo.spec')).toBe(
      '--testPathPatterns=foo.spec',
    );
  });
});
