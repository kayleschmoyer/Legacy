import { describe, expect, it } from '@jest/globals';

import { resolveCommitish } from './resolve-commitish';

describe('resolveCommitish', () => {
  it('resolves from ref when only ref is provided', () => {
    const result = resolveCommitish(undefined, 'c4c1a410b');
    expect(result).toEqual({ ok: true, commitish: 'c4c1a410b' });
  });

  it('resolves from sha when only sha is provided (back-compat)', () => {
    const result = resolveCommitish('c4c1a410b', undefined);
    expect(result).toEqual({ ok: true, commitish: 'c4c1a410b' });
  });

  it('prefers sha when both sha and ref are provided and differ', () => {
    const result = resolveCommitish('sha-value', 'ref-value');
    expect(result).toEqual({ ok: true, commitish: 'sha-value' });
  });

  it('returns a combined error naming both parameters when neither is provided', () => {
    const result = resolveCommitish(undefined, undefined);
    expect(result).toEqual({
      ok: false,
      error: 'Missing required parameter: sha (or ref)',
    });
  });
});
