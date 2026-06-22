import { describe, expect, it } from '@jest/globals';

import { containsUnsafePathChars } from './path-safety.js';

describe('containsUnsafePathChars', () => {
  it('accepts ordinary relative and absolute terraform dirs', () => {
    for (const ok of [
      'terraform/main',
      'terraform/runners',
      './terraform/main',
      '/home/user/legacy-sports/terraform/main',
      'C:\\code\\legacy-sports\\terraform\\main',
      'terraform/with space/main',
    ]) {
      expect(containsUnsafePathChars(ok)).toBe(false);
    }
  });

  it('rejects shell metacharacters used for command injection', () => {
    for (const bad of [
      'terraform/main; rm -rf /',
      'terraform/main && echo pwned',
      'terraform/main | cat /etc/passwd',
      'terraform/$(whoami)',
      'terraform/`id`',
      'terraform/main > /tmp/x',
      'terraform/main < /etc/shadow',
    ]) {
      expect(containsUnsafePathChars(bad)).toBe(true);
    }
  });

  it('rejects control characters (newlines, tabs, NUL)', () => {
    expect(containsUnsafePathChars('terraform/main\nrm -rf /')).toBe(true);
    expect(containsUnsafePathChars('terraform/main\r')).toBe(true);
    expect(containsUnsafePathChars('terraform/\tmain')).toBe(true);
    expect(containsUnsafePathChars('terraform/main\x00')).toBe(true);
  });
});
