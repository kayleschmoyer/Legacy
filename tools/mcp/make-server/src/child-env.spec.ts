import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { buildChildEnv } from './child-env.js';

describe('buildChildEnv', () => {
  const originalTsxTsconfigPath = process.env.TSX_TSCONFIG_PATH;

  beforeEach(() => {
    // Simulate the env mcp-bootstrap.mjs auto-injects into this MCP server's
    // own process for `legacy-sports-make` (LS-9806).
    process.env.TSX_TSCONFIG_PATH = 'tools/mcp/make-server/tsconfig.json';
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
