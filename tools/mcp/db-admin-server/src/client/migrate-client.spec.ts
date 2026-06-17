import {
  transpileMigrationSource,
  buildMigrationPayload,
  buildToolCallBody,
  postMigrations,
  type LocalMigration,
} from './migrate-client';

describe('transpileMigrationSource', () => {
  it('strips type-only imports and emits CJS exports.up', () => {
    const ts = [
      "import type { PgDatabase } from 'drizzle-orm/pg-core';",
      '// eslint-disable-next-line',
      'export const up = async ({ db }: { db: PgDatabase<any> }) => {',
      "  await db.execute('SELECT 1');",
      '};',
    ].join('\n');

    const code = transpileMigrationSource(ts);

    // esbuild's cjs output exposes up via `module.exports`/`__toCommonJS`.
    expect(code).toContain('module.exports');
    expect(code).toContain('up');
    expect(code).not.toContain('import type');
    // A type-only import must not survive as a runtime require.
    expect(code).not.toContain('require("drizzle-orm/pg-core")');
    expect(code).not.toContain('PgDatabase');
  });

  it('turns a runtime import into a require() the sandbox can resolve', () => {
    const ts = [
      "import { sql } from 'drizzle-orm';",
      'export const up = async () => {',
      '  sql`SELECT 1`;',
      '};',
    ].join('\n');

    const code = transpileMigrationSource(ts);

    expect(code).toContain('require("drizzle-orm")');
    expect(code).toContain('module.exports');
  });
});

describe('buildMigrationPayload', () => {
  const migrations: LocalMigration[] = [
    {
      name: '20260616_130000_c.ts',
      source: 'export const up = async () => {};',
    },
    {
      name: '20260616_120000_a.ts',
      source: 'export const up = async () => {};',
    },
    {
      name: '20260616_125000_b.ts',
      source: 'export const up = async () => {};',
    },
  ];

  it('orders by filename (timestamp) and keys hash to the filename', () => {
    const payload = buildMigrationPayload(migrations);

    expect(payload.map((m) => m.name)).toEqual([
      '20260616_120000_a.ts',
      '20260616_125000_b.ts',
      '20260616_130000_c.ts',
    ]);
    for (const item of payload) {
      expect(item.hash).toBe(item.name);
      expect(item.jsSource).toContain('module.exports');
    }
  });
});

describe('buildToolCallBody', () => {
  it('builds a tools/call request for db_migrate', () => {
    const body = JSON.parse(
      buildToolCallBody([
        { name: 'a.ts', hash: 'a.ts', jsSource: 'exports.up = 1;' },
      ]),
    );

    expect(body.method).toBe('tools/call');
    expect(body.params.name).toBe('db_migrate');
    expect(body.params.arguments.migrations).toHaveLength(1);
  });
});

describe('postMigrations', () => {
  afterEach(() => jest.restoreAllMocks());

  it('POSTs with a Bearer header and returns the response body', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{"result":"ok"}', { status: 200 }));

    const text = await postMigrations('https://srv/mcp', 'tok', [
      { name: 'a.ts', hash: 'a.ts', jsSource: 'exports.up = 1;' },
    ]);

    expect(text).toContain('ok');
    const [, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(String(init?.body)).toContain('db_migrate');
  });

  it('does not double-prefix an existing Bearer value', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await postMigrations('https://srv/mcp', 'Bearer abc', []);

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe('Bearer abc');
  });

  it('throws on a non-2xx response', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('nope', { status: 403 }));

    await expect(postMigrations('https://srv/mcp', 'tok', [])).rejects.toThrow(
      /HTTP 403/,
    );
  });
});
