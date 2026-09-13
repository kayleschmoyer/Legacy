import { execute } from './execute.js';
import { getWriteSql } from '../db.js';
import type { McpCaller } from '../audit.js';

jest.mock('../db.js');

const mockGetWriteSql = getWriteSql as jest.MockedFunction<typeof getWriteSql>;

const CALLER: McpCaller = { clientId: 'client-abc', sub: 'sub-123' };

interface ExecutePayload {
  rows?: Record<string, unknown>[];
  rowCount?: number;
  columns?: string[];
  success?: boolean;
  error?: string;
}

function parse(text: string): ExecutePayload {
  return JSON.parse(text) as ExecutePayload;
}

/** Fake postgres `sql.unsafe` resolving to a RowList-shaped array (rows + a
 * `count` property, mirroring what `postgres` attaches at runtime). */
function fakeSql(rows: Record<string, unknown>[], count: number) {
  const unsafeMock = jest.fn(() =>
    Promise.resolve(Object.assign([...rows], { count })),
  );
  return { unsafe: unsafeMock } as never;
}

describe('db_execute (hosted, DML-only)', () => {
  const originalEnv = process.env['NODE_ENV'];

  beforeEach(() => {
    process.env['NODE_ENV'] = 'dev';
  });

  afterEach(() => {
    process.env['NODE_ENV'] = originalEnv;
    jest.resetAllMocks();
  });

  it('runs a single statement and returns rows + rowCount as json', async () => {
    mockGetWriteSql.mockResolvedValue(fakeSql([{ id: 1 }], 1));

    const result = await execute(
      {
        sql: 'INSERT INTO app_internal.subscriptions (id) VALUES ($1) RETURNING id',
        params: [1],
      },
      CALLER,
    );

    expect(result.isError).toBeUndefined();
    const payload = parse(result.content[0].text);
    expect(payload).toEqual({
      rows: [{ id: 1 }],
      rowCount: 1,
      columns: ['id'],
    });
  });

  it('reports rowCount with no RETURNING rows', async () => {
    mockGetWriteSql.mockResolvedValue(fakeSql([], 3));

    const result = await execute(
      { sql: "UPDATE app_internal.users SET status = 'active'" },
      CALLER,
    );

    const payload = parse(result.content[0].text);
    expect(payload).toEqual({ rows: [], rowCount: 3, columns: [] });
  });

  it('formats table output as a compact Markdown table when requested', async () => {
    mockGetWriteSql.mockResolvedValue(fakeSql([{ id: 1 }, { id: 2 }], 2));

    const result = await execute(
      { sql: 'UPDATE t SET x = 1 RETURNING id', format: 'table' },
      CALLER,
    );

    expect(result.content[0].text).toBe('id\n---\n1\n2\n(2 row(s) affected)');
  });

  it('rejects stacked statements without touching the database', async () => {
    const result = await execute(
      { sql: 'DELETE FROM t WHERE id = 1; DELETE FROM t WHERE id = 2' },
      CALLER,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('exactly one SQL statement');
    expect(mockGetWriteSql).not.toHaveBeenCalled();
  });

  it('rejects an empty statement', async () => {
    const result = await execute({ sql: '   ' }, CALLER);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('No SQL statement provided');
  });

  it('refuses to run outside dev environments', async () => {
    process.env['NODE_ENV'] = 'production';

    const result = await execute({ sql: 'DELETE FROM t WHERE id = 1' }, CALLER);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      'disabled outside dev environments',
    );
    expect(mockGetWriteSql).not.toHaveBeenCalled();
  });

  it('returns an error result when the statement fails', async () => {
    mockGetWriteSql.mockResolvedValue({
      unsafe: jest.fn(() =>
        Promise.reject(new Error('permission denied for table t')),
      ),
    } as never);

    const result = await execute({ sql: 'DELETE FROM t WHERE id = 1' }, CALLER);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('permission denied for table t');
  });

  it('reports unavailable when the connection cannot be established', async () => {
    mockGetWriteSql.mockRejectedValue(
      new Error('MCP_WRITE_SECRET_NAME is not configured'),
    );

    const result = await execute({ sql: 'DELETE FROM t WHERE id = 1' }, CALLER);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Database unavailable');
  });
});
