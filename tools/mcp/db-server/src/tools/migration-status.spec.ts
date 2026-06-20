import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../run-command.js', () => ({
  getRepoRoot: jest.fn(() => '/repo'),
  runTsx: jest.fn(),
}));

jest.mock('node:fs/promises', () => ({
  access: jest.fn(),
}));

import { access } from 'node:fs/promises';
import { runTsx, getRepoRoot } from '../run-command.js';
import { migrationStatus, parseStatusOutput } from './migration-status.js';

const mockRunTsx = runTsx as jest.MockedFunction<typeof runTsx>;
const mockAccess = access as jest.MockedFunction<typeof access>;
const mockGetRepoRoot = getRepoRoot as jest.MockedFunction<typeof getRepoRoot>;

const log = (msg: string) => `[2026-06-13T21:00:00.000Z] INFO: ${msg}`;

const statusOutput = (applied: number, pending: string[]) =>
  [
    log(`📁 Total migrations available: ${applied + pending.length}`),
    log(`📊 Applied migrations: ${applied}`),
    ...pending.map((name) => log(`⏸️  Pending: ${name}`)),
  ].join('\n');

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRepoRoot.mockReturnValue('/repo');
});

describe('parseStatusOutput', () => {
  it('extracts applied/pending counts and names', () => {
    const out = statusOutput(2, ['20260101_000000_one.ts']);
    expect(parseStatusOutput(out)).toEqual({
      applied: 2,
      pending: 1,
      pendingNames: ['20260101_000000_one.ts'],
      needsMigration: true,
    });
  });

  it('reports needsMigration: false when nothing is pending', () => {
    const out = statusOutput(3, []);
    expect(parseStatusOutput(out)).toEqual({
      applied: 3,
      pending: 0,
      pendingNames: [],
      needsMigration: false,
    });
  });
});

describe('migrationStatus (singular)', () => {
  it('uses repo root when no worktreePath is provided', async () => {
    mockRunTsx.mockResolvedValue(statusOutput(5, []));
    const result = await migrationStatus({});
    expect(mockGetRepoRoot).toHaveBeenCalled();
    const body = JSON.parse(result.content[0].text);
    expect(body).toMatchObject({ available: true, applied: 5, pending: 0 });
  });

  it('returns { available: false } with a friendly reason on SSL errors', async () => {
    mockRunTsx.mockRejectedValue(new Error('self signed certificate in chain'));
    const result = await migrationStatus({ worktreePath: '/wt/a' });
    const body = JSON.parse(result.content[0].text);
    expect(body.available).toBe(false);
    expect(body.reason).toMatch(/SSL certificate/i);
  });

  it('returns isError: true for unclassified failures', async () => {
    mockRunTsx.mockRejectedValue(new Error('something exploded'));
    const result = await migrationStatus({ worktreePath: '/wt/a' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Failed to check migration status/);
  });
});

describe('migrationStatus (batch)', () => {
  it('returns per-worktree status keyed by path', async () => {
    mockAccess.mockResolvedValue(undefined);
    mockRunTsx.mockImplementation(async (_script, _args, cwd) => {
      if (cwd.includes('/wt/a')) return statusOutput(3, []);
      return statusOutput(2, ['20260101_000000_x.ts']);
    });

    const result = await migrationStatus({
      worktreePaths: ['/wt/a', '/wt/b'],
    });
    const body = JSON.parse(result.content[0].text);
    expect(Object.keys(body.status).sort()).toEqual(['/wt/a', '/wt/b']);
    expect(body.status['/wt/a']).toMatchObject({ applied: 3, pending: 0 });
    expect(body.status['/wt/b']).toMatchObject({ applied: 2, pending: 1 });
    expect(body.missing).toEqual([]);
  });

  it('isolates missing paths into missing[] without failing the batch', async () => {
    mockAccess.mockImplementation(async (path) => {
      if (String(path).includes('ghost')) {
        throw new Error('ENOENT');
      }
    });
    mockRunTsx.mockResolvedValue(statusOutput(1, []));

    const result = await migrationStatus({
      worktreePaths: ['/wt/real', '/wt/ghost'],
    });
    const body = JSON.parse(result.content[0].text);
    expect(Object.keys(body.status)).toEqual(['/wt/real']);
    expect(body.missing).toEqual([
      { worktreePath: '/wt/ghost', reason: 'Path does not exist' },
    ]);
  });

  it('captures unreadable-journal errors per-worktree without aborting the batch', async () => {
    mockAccess.mockResolvedValue(undefined);
    mockRunTsx.mockImplementation(async (_script, _args, cwd) => {
      if (cwd.includes('/wt/bad')) {
        throw new Error('Cannot read journal file');
      }
      return statusOutput(4, []);
    });

    const result = await migrationStatus({
      worktreePaths: ['/wt/good', '/wt/bad'],
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.status['/wt/good']).toMatchObject({ applied: 4 });
    expect(body.status['/wt/bad']).toBeUndefined();
    expect(body.missing).toEqual([
      { worktreePath: '/wt/bad', reason: 'Cannot read journal file' },
    ]);
  });

  it('classifies connection errors as available: false instead of missing[]', async () => {
    mockAccess.mockResolvedValue(undefined);
    mockRunTsx.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:5432'));

    const result = await migrationStatus({ worktreePaths: ['/wt/a'] });
    const body = JSON.parse(result.content[0].text);
    expect(body.status['/wt/a'].available).toBe(false);
    expect(body.status['/wt/a'].reason).toMatch(/DB connection unavailable/);
    expect(body.missing).toEqual([]);
  });

  it('rejects an empty worktreePaths array', async () => {
    const result = await migrationStatus({ worktreePaths: [] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/between 1 and 25/);
  });

  it('rejects more than 25 worktreePaths', async () => {
    const paths = Array.from({ length: 26 }, (_, i) => `/wt/${i}`);
    const result = await migrationStatus({ worktreePaths: paths });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/between 1 and 25/);
  });

  it('caps concurrency at 5 in-flight runs', async () => {
    mockAccess.mockResolvedValue(undefined);
    let inFlight = 0;
    let maxInFlight = 0;
    mockRunTsx.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return statusOutput(1, []);
    });

    const paths = Array.from({ length: 15 }, (_, i) => `/wt/${i}`);
    const result = await migrationStatus({ worktreePaths: paths });
    const body = JSON.parse(result.content[0].text);
    expect(Object.keys(body.status)).toHaveLength(15);
    expect(maxInFlight).toBeLessThanOrEqual(5);
  });

  it('prefers worktreePaths when both fields are provided', async () => {
    mockAccess.mockResolvedValue(undefined);
    mockRunTsx.mockResolvedValue(statusOutput(7, []));

    const result = await migrationStatus({
      worktreePath: '/should-be-ignored',
      worktreePaths: ['/wt/a'],
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.status['/wt/a']).toMatchObject({ applied: 7 });
    expect(body.missing).toEqual([]);
  });
});
