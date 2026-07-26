import { describe, expect, it } from '@jest/globals';

import { resolveAmendAddArgs } from './resolve-amend-add-args';

describe('resolveAmendAddArgs', () => {
  it('stages only tracked changes when addAll is false', () => {
    expect(resolveAmendAddArgs(false)).toEqual(['add', '-u']);
  });

  it('stages tracked and untracked changes when addAll is true', () => {
    expect(resolveAmendAddArgs(true)).toEqual(['add', '-A']);
  });
});
