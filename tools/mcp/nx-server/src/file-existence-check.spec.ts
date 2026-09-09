import { describe, expect, it, jest } from '@jest/globals';
import { resolve } from 'node:path';

jest.mock('node:fs', () => ({ existsSync: jest.fn() }));

import { existsSync } from 'node:fs';
import { checkFileExists } from './file-existence-check.js';

const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;

describe('checkFileExists', () => {
  it('returns null when the file exists under cwd', () => {
    mockExistsSync.mockReturnValue(true);

    expect(checkFileExists('a.ts', '/repo', undefined)).toBeNull();
  });

  it('names the repo root when worktreePath was not supplied', () => {
    mockExistsSync.mockReturnValue(false);

    const result = checkFileExists('tools/missing.ts', '/repo', undefined);

    expect(result?.isError).toBe(true);
    expect(result?.content[0].text).toBe(
      'File "tools/missing.ts" not found under repo root /repo.',
    );
  });

  it('names worktreePath explicitly when it was supplied', () => {
    mockExistsSync.mockReturnValue(false);
    const worktree = resolve('/worktree');

    const result = checkFileExists('a.ts', worktree, worktree);

    expect(result?.isError).toBe(true);
    expect(result?.content[0].text).toBe(
      `File "a.ts" not found under worktreePath ${worktree}.`,
    );
  });
});
