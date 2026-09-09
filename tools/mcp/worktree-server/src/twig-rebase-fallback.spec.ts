import { describe, expect, it } from '@jest/globals';

import { isTwigNotFoundError } from './twig-rebase-fallback';

describe('isTwigNotFoundError', () => {
  it('returns true for a Node ENOENT error (no shell intermediary)', () => {
    expect(
      isTwigNotFoundError({ code: 'ENOENT', message: 'spawn twig ENOENT' }),
    ).toBe(true);
  });

  it('returns true for a shell exit code 127 with no matching stderr text', () => {
    expect(
      isTwigNotFoundError({ status: 127, message: 'Command failed' }),
    ).toBe(true);
  });

  it('returns true when stderr reports "not found" (CCR/cloud sh fallback)', () => {
    expect(
      isTwigNotFoundError({
        status: 127,
        message: 'Command failed: twig rebase',
        stderr: '/bin/sh: 1: twig: not found',
      }),
    ).toBe(true);
  });

  it('returns true when stderr reports "command not found" (bash fallback)', () => {
    expect(
      isTwigNotFoundError({
        stderr: 'bash: twig: command not found',
      }),
    ).toBe(true);
  });

  it('returns false for a real twig failure (no parent registered)', () => {
    expect(
      isTwigNotFoundError({
        status: 1,
        message: 'Command failed: twig rebase',
        stderr: 'Error: no parent branch registered for this branch',
      }),
    ).toBe(false);
  });

  it('returns false for a real twig rebase conflict', () => {
    expect(
      isTwigNotFoundError({
        status: 1,
        message: 'Command failed: twig rebase',
        stdout: 'CONFLICT (content): Merge conflict in src/foo.ts',
      }),
    ).toBe(false);
  });
});
