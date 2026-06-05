import { describe, expect, it } from '@jest/globals';

import { escapeCmdShellArg } from './cmd-escape.js';

describe('escapeCmdShellArg', () => {
  it('wraps args containing | in double-quotes so cmd.exe does not interpret it as a pipe', () => {
    expect(escapeCmdShellArg('expo-public-env|statsApiUrl')).toBe(
      '"expo-public-env|statsApiUrl"',
    );
  });

  it('wraps args containing < in double-quotes', () => {
    expect(escapeCmdShellArg('foo<bar')).toBe('"foo<bar"');
  });

  it('wraps args containing > in double-quotes', () => {
    expect(escapeCmdShellArg('foo>bar')).toBe('"foo>bar"');
  });

  it('leaves safe args unchanged', () => {
    expect(escapeCmdShellArg('--testPathPatterns')).toBe('--testPathPatterns');
    expect(escapeCmdShellArg('some-file')).toBe('some-file');
    expect(escapeCmdShellArg('exec')).toBe('exec');
  });

  it('leaves args with no metacharacters unchanged', () => {
    expect(escapeCmdShellArg('app:test')).toBe('app:test');
    expect(escapeCmdShellArg('--all')).toBe('--all');
    expect(escapeCmdShellArg('--')).toBe('--');
  });
});
