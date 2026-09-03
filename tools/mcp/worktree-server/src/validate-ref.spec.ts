import { describe, expect, it } from '@jest/globals';

import { validateRef } from './validate-ref';

describe('validateRef', () => {
  it('accepts a plain remote ref', () => {
    expect(validateRef('origin/main')).toEqual({ ok: true });
  });

  it('accepts a commit SHA', () => {
    expect(validateRef('abc123def456')).toEqual({ ok: true });
  });

  it('accepts a relative ref (parent/ancestor)', () => {
    expect(validateRef('origin/main~1')).toEqual({ ok: true });
    expect(validateRef('HEAD^2')).toEqual({ ok: true });
  });

  it('accepts a reflog-style ref', () => {
    expect(validateRef('origin/main@{yesterday}')).toEqual({ ok: true });
  });

  it('rejects a value starting with -', () => {
    const result = validateRef('--upload-pack=evil');
    expect(result.ok).toBe(false);
  });

  it('rejects whitespace', () => {
    const result = validateRef('origin/main extra');
    expect(result.ok).toBe(false);
  });

  it('rejects shell metacharacters', () => {
    for (const ref of [
      'origin/main; rm -rf /',
      'origin/main`whoami`',
      'origin/main$(whoami)',
    ]) {
      expect(validateRef(ref).ok).toBe(false);
    }
  });

  it('rejects an empty string', () => {
    expect(validateRef('').ok).toBe(false);
  });
});
