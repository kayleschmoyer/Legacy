import { describe, expect, it, jest } from '@jest/globals';
import { join } from 'node:path';

jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));
jest.mock('./run-command.js', () => ({ runNx: jest.fn() }));

import { existsSync, readFileSync } from 'node:fs';
import { runNx } from './run-command.js';
import {
  buildProjectNotFoundHint,
  suggestProjectNames,
} from './project-resolution.js';

const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockReadFileSync = readFileSync as jest.MockedFunction<
  typeof readFileSync
>;
const mockRunNx = runNx as jest.MockedFunction<typeof runNx>;
// Production joins with node:path, so match its platform-native separators.
const CI_SERVER_PROJECT_JSON = join(
  '/repo',
  'tools/mcp',
  'ci-server',
  'project.json',
);

describe('suggestProjectNames', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockRunNx.mockResolvedValue('');
  });

  it('resolves the real name from a project.json found under tools/mcp/<name> (LS-9880 repro)', async () => {
    mockExistsSync.mockImplementation(
      (p) => String(p) === CI_SERVER_PROJECT_JSON,
    );
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'mcp-ci-server' }));

    const result = await suggestProjectNames('ci-server', '/repo');

    expect(result).toContain('mcp-ci-server');
  });

  it('fuzzy-matches against nx show projects when no project.json path resolves', async () => {
    mockRunNx.mockResolvedValue(
      JSON.stringify([
        'mcp-ci-server',
        'mcp-github-server',
        'shared-components',
      ]),
    );

    const result = await suggestProjectNames('ci-server', '/repo');

    expect(result).toContain('mcp-ci-server');
    expect(result).not.toContain('shared-components');
  });

  it('parses the newline-per-project output shape too (older/alternate Nx versions)', async () => {
    mockRunNx.mockResolvedValue('mcp-ci-server\nmcp-github-server\n');

    const result = await suggestProjectNames('ci-server', '/repo');

    expect(result).toContain('mcp-ci-server');
  });

  it('combines both strategies and dedupes', async () => {
    mockExistsSync.mockImplementation(
      (p) => String(p) === CI_SERVER_PROJECT_JSON,
    );
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'mcp-ci-server' }));
    mockRunNx.mockResolvedValue(
      JSON.stringify(['mcp-ci-server', 'mcp-github-server']),
    );

    const result = await suggestProjectNames('ci-server', '/repo');

    expect(result).toEqual(['mcp-ci-server']);
  });

  it('returns an empty list when nothing resembles the input', async () => {
    mockRunNx.mockResolvedValue(
      JSON.stringify(['shared-components', 'graphql']),
    );

    const result = await suggestProjectNames('totally-unrelated', '/repo');

    expect(result).toEqual([]);
  });

  it('does not fail when nx show projects itself errors', async () => {
    mockRunNx.mockRejectedValue(new Error('nx show projects failed'));

    await expect(suggestProjectNames('ci-server', '/repo')).resolves.toEqual(
      [],
    );
  });

  it('ignores a malformed project.json rather than throwing', async () => {
    mockExistsSync.mockImplementation(
      (p) => String(p) === CI_SERVER_PROJECT_JSON,
    );
    mockReadFileSync.mockReturnValue('not json');

    await expect(suggestProjectNames('ci-server', '/repo')).resolves.toEqual(
      [],
    );
  });

  it('caps suggestions at 5', async () => {
    mockRunNx.mockResolvedValue(
      JSON.stringify(Array.from({ length: 10 }, (_, i) => `mcp-server-${i}`)),
    );

    const result = await suggestProjectNames('server', '/repo');

    expect(result.length).toBe(5);
  });
});

describe('buildProjectNotFoundHint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  it('returns undefined when output does not contain a Cannot find project failure', () => {
    return expect(
      buildProjectNotFoundHint('PASS some.spec.ts', '/repo'),
    ).resolves.toBeUndefined();
  });

  it('returns undefined when the project name is unresolved but no suggestions exist', async () => {
    mockRunNx.mockResolvedValue(JSON.stringify(['shared-components']));

    const hint = await buildProjectNotFoundHint(
      "NX   Cannot find project 'totally-unrelated'",
      '/repo',
    );

    expect(hint).toBeUndefined();
  });

  it('builds a "Did you mean" hint mirroring ci_list_runs style for the exact LS-9880 repro', async () => {
    mockExistsSync.mockImplementation(
      (p) => String(p) === CI_SERVER_PROJECT_JSON,
    );
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'mcp-ci-server' }));

    const hint = await buildProjectNotFoundHint(
      "NX   Cannot find project 'ci-server'",
      '/repo',
    );

    expect(hint).toBe(
      'No nx project named "ci-server" exists. Did you mean one of these? "mcp-ci-server"',
    );
  });
});
