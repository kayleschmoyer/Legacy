import { describe, expect, it } from '@jest/globals';

import { resolveCommitArgs } from './resolve-commit-args';

describe('resolveCommitArgs', () => {
  it('builds a plain new commit', () => {
    expect(
      resolveCommitArgs({ amend: false, msgPath: '/tmp/msg.txt' }),
    ).toEqual(['commit', '-F', '/tmp/msg.txt']);
  });

  it('adds --allow-empty to a new commit when allowEmpty is true', () => {
    expect(
      resolveCommitArgs({
        amend: false,
        msgPath: '/tmp/msg.txt',
        allowEmpty: true,
      }),
    ).toEqual(['commit', '-F', '/tmp/msg.txt', '--allow-empty']);
  });

  it('builds an amend with a new message', () => {
    expect(resolveCommitArgs({ amend: true, msgPath: '/tmp/msg.txt' })).toEqual(
      ['commit', '--amend', '-F', '/tmp/msg.txt'],
    );
  });

  it('builds an amend keeping the existing message (--no-edit)', () => {
    expect(resolveCommitArgs({ amend: true })).toEqual([
      'commit',
      '--amend',
      '--no-edit',
    ]);
  });

  it('adds --reset-author and --allow-empty to an amend, in order', () => {
    expect(
      resolveCommitArgs({ amend: true, resetAuthor: true, allowEmpty: true }),
    ).toEqual([
      'commit',
      '--amend',
      '--no-edit',
      '--reset-author',
      '--allow-empty',
    ]);
  });

  it('adds --allow-empty to an amend with a new message', () => {
    expect(
      resolveCommitArgs({
        amend: true,
        msgPath: '/tmp/msg.txt',
        allowEmpty: true,
      }),
    ).toEqual(['commit', '--amend', '-F', '/tmp/msg.txt', '--allow-empty']);
  });

  it('omits --reset-author and --allow-empty when both are false/undefined', () => {
    expect(
      resolveCommitArgs({ amend: false, msgPath: '/tmp/msg.txt' }),
    ).toEqual(['commit', '-F', '/tmp/msg.txt']);
  });
});
