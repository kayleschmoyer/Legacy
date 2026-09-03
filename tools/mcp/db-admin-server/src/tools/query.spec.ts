import postgres from 'postgres';
import { query } from './query';
import { getReadonlySql } from '../db.js';

jest.mock('../db.js');

const mockGetReadonlySql = getReadonlySql as jest.MockedFunction<
  typeof getReadonlySql
>;

/** Build a fake postgres `sql` whose `begin('READ ONLY', fn)` runs fn with a tx
 *  whose `unsafe()` resolves to the given rows. Records the begin mode. */
function fakeSql(rows: Record<string, unknown>[]) {
  const beginModes: string[] = [];
  const sql = {
    begin: jest.fn((mode: string, fn: (tx: unknown) => unknown) => {
      beginModes.push(mode);
      const tx = { unsafe: jest.fn(() => Promise.resolve(rows)) };
      return Promise.resolve(fn(tx));
    }),
  };
  return { sql, beginModes };
}

interface QueryPayload {
  rows?: Record<string, unknown>[];
  rowCount?: number;
  columns?: string[];
  available?: boolean;
  reason?: string;
  error?: string;
  elapsedMs?: number;
  message?: string;
  hint?: string;
}

function parseBody(text: string): QueryPayload {
  return JSON.parse(text) as QueryPayload;
}

describe('db_query (hosted, read-only)', () => {
  afterEach(() => jest.resetAllMocks());

  it('runs the query inside a READ ONLY transaction and returns json rows', async () => {
    const { sql, beginModes } = fakeSql([{ id: 1, name: 'a' }]);
    mockGetReadonlySql.mockResolvedValue(sql as never);

    const result = await query({ query: 'SELECT * FROM users' });

    expect(beginModes).toEqual(['READ ONLY']);
    expect(result.isError).toBeUndefined();
    const payload = parseBody(result.content[0].text);
    expect(payload).toEqual({
      rows: [{ id: 1, name: 'a' }],
      rowCount: 1,
      columns: ['id', 'name'],
    });
  });

  it('formats table output as a compact Markdown table when requested', async () => {
    const { sql } = fakeSql([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]);
    mockGetReadonlySql.mockResolvedValue(sql as never);

    const result = await query({ query: 'SELECT id FROM x', format: 'table' });

    // Compact GFM table from the shared helper: header written once, a `---`
    // separator row, then one pipe-joined row per record, with no alignment
    // padding (token-efficient — epic LS-8018).
    expect(result.content[0].text).toBe('id|name\n---|---\n1|a\n2|b\n(2 rows)');
  });

  it('reports zero rows explicitly for an empty table result', async () => {
    const { sql } = fakeSql([]);
    mockGetReadonlySql.mockResolvedValue(sql as never);

    const result = await query({ query: 'SELECT id FROM x', format: 'table' });

    expect(result.content[0].text).toBe('(0 rows)');
  });

  it('classifies a statement_timeout (SQLSTATE 57014) distinctly from a transport failure', async () => {
    const timeoutError = new postgres.PostgresError({
      message: 'canceling statement due to statement timeout',
      code: '57014',
    } as never);
    const sql = { begin: jest.fn(() => Promise.reject(timeoutError)) };
    mockGetReadonlySql.mockResolvedValue(sql as never);

    const result = await query({ query: 'SELECT * FROM game_batting' });

    expect(result.isError).toBe(true);
    const payload = parseBody(result.content[0].text);
    expect(payload.error).toBe('statement_timeout');
    expect(typeof payload.elapsedMs).toBe('number');
    expect(payload.hint).toContain('Rewrite');
  });

  it('classifies a non-timeout Postgres error as sql_error', async () => {
    const relationError = new postgres.PostgresError({
      message: 'relation "nope" does not exist',
      code: '42P01',
    } as never);
    const sql = { begin: jest.fn(() => Promise.reject(relationError)) };
    mockGetReadonlySql.mockResolvedValue(sql as never);

    const result = await query({ query: 'SELECT * FROM nope' });

    expect(result.isError).toBe(true);
    const payload = parseBody(result.content[0].text);
    expect(payload.error).toBe('sql_error');
    expect(payload.message).toContain('relation "nope" does not exist');
  });

  it('classifies a non-Postgres error (transport/connection failure) as upstream_unavailable', async () => {
    const transportError = Object.assign(
      new Error('write CONNECT_TIMEOUT undefined:undefined'),
      { code: 'CONNECT_TIMEOUT' },
    );
    const sql = { begin: jest.fn(() => Promise.reject(transportError)) };
    mockGetReadonlySql.mockResolvedValue(sql as never);

    const result = await query({ query: 'SELECT 1 AS ok' });

    expect(result.isError).toBe(true);
    const payload = parseBody(result.content[0].text);
    expect(payload.error).toBe('upstream_unavailable');
    expect(payload.hint).toContain('Retry');
  });

  it('reports unavailable when the connection cannot be established', async () => {
    mockGetReadonlySql.mockRejectedValue(
      new Error('MCP_READONLY_SECRET_NAME is not configured'),
    );

    const result = await query({ query: 'SELECT 1' });

    const payload = parseBody(result.content[0].text);
    expect(payload.available).toBe(false);
    expect(payload.reason).toContain('Database unavailable');
  });
});
