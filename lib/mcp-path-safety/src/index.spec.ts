import { resolve } from 'node:path';

import { validateOutputPath } from './index';

// validateOutputPath returns platform-native resolved paths, so expected
// values go through resolve() too (on Windows '/repo' resolves to 'D:\repo').

describe('validateOutputPath', () => {
  it('rejects a relative path', () => {
    const result = validateOutputPath('relative/path.txt', ['/repo']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('must be an absolute path');
    }
  });

  it('accepts a path that equals an allowed root exactly', () => {
    const result = validateOutputPath('/repo', ['/repo']);
    expect(result).toEqual({ ok: true, resolved: resolve('/repo') });
  });

  it('accepts a path nested under an allowed root', () => {
    const result = validateOutputPath('/repo/terraform/main/x.tf', ['/repo']);
    expect(result).toEqual({
      ok: true,
      resolved: resolve('/repo/terraform/main/x.tf'),
    });
  });

  it('accepts a path under the second allowed root when the first does not match', () => {
    const result = validateOutputPath('/tmp/scratch/x.tf', ['/repo', '/tmp']);
    expect(result).toEqual({
      ok: true,
      resolved: resolve('/tmp/scratch/x.tf'),
    });
  });

  it('rejects a path outside every allowed root', () => {
    const result = validateOutputPath('/etc/passwd', ['/repo', '/tmp']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('outside the allowed write targets');
      expect(result.error).toContain(resolve('/repo'));
      expect(result.error).toContain(resolve('/tmp'));
    }
  });

  it('rejects a sibling directory that merely shares a name prefix (no false positive on string startsWith)', () => {
    // "/repo-evil" starts with the string "/repo" but is not contained in it.
    const result = validateOutputPath('/repo-evil/x.tf', ['/repo']);
    expect(result.ok).toBe(false);
  });

  it('rejects a traversal attempt that resolves outside the allowed root', () => {
    const result = validateOutputPath('/repo/../etc/passwd', ['/repo']);
    expect(result.ok).toBe(false);
  });

  it('returns no matches when allowedRoots is empty', () => {
    const result = validateOutputPath('/anything', []);
    expect(result.ok).toBe(false);
  });
});
