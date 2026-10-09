import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { buildChildEnv, ensureGitBashOnPath } from './child-env.js';

describe('buildChildEnv', () => {
  const originalTsxTsconfigPath = process.env.TSX_TSCONFIG_PATH;

  beforeEach(() => {
    // Simulate the env `.mcp.json` injects into this MCP server's own
    // process for `legacy-sports-nx` (LS-9681).
    process.env.TSX_TSCONFIG_PATH = 'tools/mcp/nx-server/tsconfig.json';
  });

  afterEach(() => {
    if (originalTsxTsconfigPath === undefined) {
      delete process.env.TSX_TSCONFIG_PATH;
    } else {
      process.env.TSX_TSCONFIG_PATH = originalTsxTsconfigPath;
    }
  });

  it('strips the server-injected TSX_TSCONFIG_PATH from the child env', () => {
    const childEnv = buildChildEnv();
    expect(childEnv.TSX_TSCONFIG_PATH).toBeUndefined();
  });

  it('strips TSX_TSCONFIG_PATH even when the caller passes other env overrides', () => {
    const childEnv = buildChildEnv({ FOO: 'bar' });
    expect(childEnv.TSX_TSCONFIG_PATH).toBeUndefined();
    expect(childEnv.FOO).toBe('bar');
  });

  it('lets a caller-supplied TSX_TSCONFIG_PATH win (explicit opt-in)', () => {
    const childEnv = buildChildEnv({
      TSX_TSCONFIG_PATH: 'lib/db-client/tsconfig.json',
    });
    expect(childEnv.TSX_TSCONFIG_PATH).toBe('lib/db-client/tsconfig.json');
  });

  it('preserves the rest of the host env', () => {
    const childEnv = buildChildEnv();
    expect(childEnv.PATH ?? childEnv.Path).toBe(
      process.env.PATH ?? process.env.Path,
    );
  });
});

describe('ensureGitBashOnPath (LS-10370)', () => {
  const git = 'C:\\Program Files\\Git';
  const env = { ProgramFiles: 'C:\\Program Files' } as NodeJS.ProcessEnv;
  const existing = new Set([
    `${git}\\usr\\bin`,
    `${git}\\bin`,
    `${git}\\usr\\bin\\bash.exe`,
    `${git}\\bin\\bash.exe`,
  ]);
  const exists = (p: string): boolean => existing.has(p);

  it('appends Git usr\\bin and bin when bash is not on PATH', () => {
    const result = ensureGitBashOnPath(
      `${git}\\cmd;C:\\Windows`,
      env,
      'win32',
      exists,
    );
    expect(result).toBe(`${git}\\cmd;C:\\Windows;${git}\\usr\\bin;${git}\\bin`);
  });

  it('leaves PATH alone when bash already resolves', () => {
    const pathValue = `${git}\\bin;C:\\Windows`;
    expect(ensureGitBashOnPath(pathValue, env, 'win32', exists)).toBe(
      pathValue,
    );
  });

  it('leaves PATH alone when no Git install exists', () => {
    const pathValue = 'C:\\Windows';
    expect(ensureGitBashOnPath(pathValue, env, 'win32', () => false)).toBe(
      pathValue,
    );
  });

  it('is a no-op on non-Windows platforms', () => {
    expect(ensureGitBashOnPath('/usr/bin', env, 'linux', exists)).toBe(
      '/usr/bin',
    );
  });
});
