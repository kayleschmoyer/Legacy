import {
  buildMigrationPayload,
  buildStatusCallBody,
  buildToolCallBody,
  type LocalMigration,
  parseToolResultPayload,
  pollMigrateJob,
  postMigrations,
  transpileMigrationSource,
} from './migrate-client.js';

interface RpcToolCallBody {
  method: string;
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

function parseRpcBody(body: string): RpcToolCallBody {
  return JSON.parse(body) as RpcToolCallBody;
}

/** Wrap a tool payload in the MCP JSON-RPC response envelope the server sends. */
function rpcResponse(payload: unknown): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: { content: [{ type: 'text', text: JSON.stringify(payload) }] },
  });
}

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
    const body = parseRpcBody(
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
    expect(init?.body as string).toContain('db_migrate');
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

describe('buildStatusCallBody', () => {
  it('builds a tools/call request for db_migration_status with the jobId', () => {
    const body = parseRpcBody(buildStatusCallBody('job-1'));

    expect(body.method).toBe('tools/call');
    expect(body.params.name).toBe('db_migration_status');
    expect(body.params.arguments.jobId).toBe('job-1');
  });
});

describe('parseToolResultPayload', () => {
  it('extracts the JSON payload from the text content', () => {
    const payload = parseToolResultPayload(
      rpcResponse({ jobId: 'j', status: 'running' }),
    );
    expect(payload).toEqual({ jobId: 'j', status: 'running' });
  });

  it('throws on a JSON-RPC error member', () => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32000, message: 'boom' },
    });
    expect(() => parseToolResultPayload(body)).toThrow(/boom/);
  });

  it('throws when there is no text content', () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} });
    expect(() => parseToolResultPayload(body)).toThrow(/no text content/);
  });
});

describe('pollMigrateJob (LS-8563)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('polls until the job leaves running and returns the terminal payload', async () => {
    const responses = [
      rpcResponse({ jobId: 'j', status: 'running', terminal: false }),
      rpcResponse({ jobId: 'j', status: 'running', terminal: false }),
      rpcResponse({
        jobId: 'j',
        status: 'done',
        terminal: true,
        applied: 1,
        success: true,
      }),
    ];
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(
          new Response(responses.shift() ?? '{}', { status: 200 }),
        ),
      );

    const terminal = await pollMigrateJob({
      serverUrl: 'https://srv/mcp',
      bearer: 'tok',
      jobId: 'j',
      intervalMs: 0,
      sleep: () => Promise.resolve(),
    });

    expect(terminal.status).toBe('done');
    expect(terminal.applied).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Every poll is a db_migration_status call carrying the jobId.
    expect(fetchMock.mock.calls[0][1]?.body as string).toContain(
      'db_migration_status',
    );
  });

  it('returns an orphaned payload as terminal', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          rpcResponse({ jobId: 'j', status: 'orphaned', terminal: true }),
          { status: 200 },
        ),
      );

    const terminal = await pollMigrateJob({
      serverUrl: 'https://srv/mcp',
      bearer: 'tok',
      jobId: 'j',
      sleep: () => Promise.resolve(),
    });

    expect(terminal.status).toBe('orphaned');
  });

  it('throws once the deadline passes with the job still running', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          rpcResponse({ jobId: 'j', status: 'running', terminal: false }),
          { status: 200 },
        ),
      );

    await expect(
      pollMigrateJob({
        serverUrl: 'https://srv/mcp',
        bearer: 'tok',
        jobId: 'j',
        timeoutMs: 0,
        sleep: () => Promise.resolve(),
      }),
    ).rejects.toThrow(/still running/);
  });
});
