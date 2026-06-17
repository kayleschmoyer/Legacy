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
    begin: jest.fn(async (mode: string, fn: (tx: unknown) => unknown) => {
      beginModes.push(mode);
      const tx = { unsafe: jest.fn(async () => rows) };
      return fn(tx);
    }),
  };
  return { sql, beginModes };
}

describe('db_query (hosted, read-only)', () => {
  afterEach(() => jest.resetAllMocks());

  it('runs the query inside a READ ONLY transaction and returns json rows', async () => {
    const { sql, beginModes } = fakeSql([{ id: 1, name: 'a' }]);
    mockGetReadonlySql.mockResolvedValue(sql as never);

    const result = await query({ query: 'SELECT * FROM users' });

    expect(beginModes).toEqual(['READ ONLY']);
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0].text);
    expect(payload).toEqual({
      rows: [{ id: 1, name: 'a' }],
      rowCount: 1,
      columns: ['id', 'name'],
    });
  });

  it('formats table output when requested', async () => {
    const { sql } = fakeSql([{ id: 1 }]);
    mockGetReadonlySql.mockResolvedValue(sql as never);

    const result = await query({ query: 'SELECT id FROM x', format: 'table' });

    expect(result.content[0].text).toContain('(1 rows)');
    expect(result.content[0].text).toContain('id');
  });

  it('returns an error result when the query fails', async () => {
    const sql = {
      begin: jest.fn(async () => {
        throw new Error('relation "nope" does not exist');
      }),
    };
    mockGetReadonlySql.mockResolvedValue(sql as never);

    const result = await query({ query: 'SELECT * FROM nope' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Query failed');
  });

  it('reports unavailable when the connection cannot be established', async () => {
    mockGetReadonlySql.mockRejectedValue(
      new Error('MCP_READONLY_SECRET_NAME is not configured'),
    );

    const result = await query({ query: 'SELECT 1' });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.available).toBe(false);
    expect(payload.reason).toContain('Database unavailable');
  });
});
