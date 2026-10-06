/**
 * Connection reuse in Lambda (LS-9530).
 *
 * `runWithClient` opened and tore down a pool on every call, so a warm Lambda
 * container re-paid a Secrets Manager credential resolve plus a TCP/TLS connect
 * for each invocation. These tests pin the reuse behaviour and — more
 * importantly — the recovery paths that make holding a connection across
 * freeze/thaw safe.
 *
 * `isLambda` is read once at module load, so every case re-imports the module
 * with the environment already set.
 */
export {};

const mockClose = jest.fn();
const mockExecute = jest.fn();
const mockInitialize = jest.fn();
const mockInvalidateSecretCache = jest.fn();

let mockIsInitialized = false;
let constructedConnections = 0;

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  invalidateSecretCache: (...args: unknown[]): void => {
    mockInvalidateSecretCache(...args);
  },
}));

jest.mock('./abstract/PgDbConnection', () => ({
  PgDbConnection: jest.fn().mockImplementation(() => {
    constructedConnections++;
    return {
      get isInitialized() {
        return mockIsInitialized;
      },
      initialize: mockInitialize,
      close: mockClose,
      db: { execute: mockExecute },
    };
  }),
}));

jest.mock('../../drizzle/public/schema', () => ({}));
jest.mock('../../drizzle/internal/schema', () => ({}));

const PUBLIC_SCHEMA = { publicTable: {} };
const INTERNAL_SCHEMA = { internalTable: {} };
const OPTIONS = { type: 'pg-remote' as const };

type HelpersModule = typeof import('./Helpers');

/**
 * Load Helpers fresh, picking up whatever environment the case has set.
 *
 * `isLambda` is captured once at module load, so each case needs its own
 * evaluation of the module rather than a shared import.
 */
async function loadHelpers(): Promise<HelpersModule> {
  jest.resetModules();
  return await import('./Helpers');
}

/** A pg error carrying a SQLSTATE code, as node-postgres raises. */
function pgError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('runWithClient — connection reuse in Lambda (LS-9530)', () => {
  const originalFunctionName = process.env.AWS_LAMBDA_FUNCTION_NAME;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'legacy-sports-dev-oauth-proxy';
    constructedConnections = 0;
    mockIsInitialized = false;
    mockInitialize.mockImplementation(() => {
      mockIsInitialized = true;
      return Promise.resolve();
    });
    mockClose.mockResolvedValue(undefined);
    mockExecute.mockResolvedValue([]);
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0;
    }) as unknown as typeof setTimeout);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalFunctionName === undefined) {
      delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    } else {
      process.env.AWS_LAMBDA_FUNCTION_NAME = originalFunctionName;
    }
  });

  it('keeps the connection open across calls instead of tearing it down', async () => {
    const { runWithClient } = await loadHelpers();

    await runWithClient(OPTIONS, PUBLIC_SCHEMA, () => Promise.resolve('a'));
    await runWithClient(OPTIONS, PUBLIC_SCHEMA, () => Promise.resolve('b'));

    expect(constructedConnections).toBe(1);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('still runs the health check on every reused call', async () => {
    const { runWithClient } = await loadHelpers();

    await runWithClient(OPTIONS, PUBLIC_SCHEMA, () => Promise.resolve('a'));
    await runWithClient(OPTIONS, PUBLIC_SCHEMA, () => Promise.resolve('b'));

    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('does not hand a public-schema connection to an internal-schema caller', async () => {
    const { runWithClient } = await loadHelpers();

    await runWithClient(OPTIONS, PUBLIC_SCHEMA, () => Promise.resolve('a'));
    await runWithClient(OPTIONS, INTERNAL_SCHEMA, () => Promise.resolve('b'));

    // One cached connection per schema: db.query.<table> is built from the
    // schema the connection was constructed with, so sharing one entry between
    // both would leave the second caller without its tables.
    expect(constructedConnections).toBe(2);
  });

  it('keeps a reusable connection when the callback throws an application error', async () => {
    const { runWithClient } = await loadHelpers();

    await expect(
      runWithClient(OPTIONS, PUBLIC_SCHEMA, () =>
        Promise.reject(new Error('duplicate key value violates constraint')),
      ),
    ).rejects.toThrow('duplicate key');

    // A query fault says nothing about the socket — discarding the pool here
    // would give back the per-request connect cost this change removes.
    expect(mockClose).not.toHaveBeenCalled();

    await runWithClient(OPTIONS, PUBLIC_SCHEMA, () => Promise.resolve('ok'));
    expect(constructedConnections).toBe(1);
  });

  describe('recovery from a connection severed while the container was frozen', () => {
    it('discards and reconnects when the health check reports a dead socket', async () => {
      const { runWithClient } = await loadHelpers();

      await runWithClient(OPTIONS, PUBLIC_SCHEMA, () => Promise.resolve('a'));
      expect(constructedConnections).toBe(1);

      // Second invocation: the pooled socket died during the freeze. pg
      // surfaces this with no SQLSTATE at all.
      mockExecute
        .mockRejectedValueOnce(new Error('Connection terminated unexpectedly'))
        .mockResolvedValue([]);

      await expect(
        runWithClient(OPTIONS, PUBLIC_SCHEMA, () => Promise.resolve('b')),
      ).resolves.toBe('b');

      expect(mockClose).toHaveBeenCalledTimes(1);
      expect(constructedConnections).toBe(2);
    });

    it.each([
      ['ECONNRESET', pgError('read ECONNRESET', 'ECONNRESET')],
      ['EPIPE', pgError('write EPIPE', 'EPIPE')],
      [
        'not queryable',
        new Error(
          'Client has encountered a connection error and is not queryable',
        ),
      ],
      ['57P01 admin_shutdown', pgError('terminating connection', '57P01')],
    ])('recovers from %s', async (_label, error) => {
      const { runWithClient } = await loadHelpers();

      await runWithClient(OPTIONS, PUBLIC_SCHEMA, () => Promise.resolve('a'));
      mockExecute.mockRejectedValueOnce(error).mockResolvedValue([]);

      await expect(
        runWithClient(OPTIONS, PUBLIC_SCHEMA, () => Promise.resolve('b')),
      ).resolves.toBe('b');

      expect(constructedConnections).toBe(2);
    });

    it('finds a transient error wrapped in a cause chain', async () => {
      const { runWithClient } = await loadHelpers();

      await runWithClient(OPTIONS, PUBLIC_SCHEMA, () => Promise.resolve('a'));

      // Drizzle wraps driver failures, so the real reason is on .cause.
      const wrapped = new Error('Failed query: select 1 + 1', {
        cause: new Error('Connection terminated unexpectedly'),
      });
      mockExecute.mockRejectedValueOnce(wrapped).mockResolvedValue([]);

      await expect(
        runWithClient(OPTIONS, PUBLIC_SCHEMA, () => Promise.resolve('b')),
      ).resolves.toBe('b');

      expect(constructedConnections).toBe(2);
    });
  });

  it('does not end a shared pool while a concurrent call is still using it (LS-10196)', async () => {
    const { runWithClient } = await loadHelpers();

    // Warm the cached connection.
    await runWithClient(OPTIONS, PUBLIC_SCHEMA, () => Promise.resolve('warm'));

    let releaseSibling!: () => void;
    const siblingGate = new Promise<void>((resolve) => {
      releaseSibling = resolve;
    });
    const closedWhileSiblingRunning: boolean[] = [];

    // Sibling A is mid-query on the shared connection.
    const sibling = runWithClient(OPTIONS, PUBLIC_SCHEMA, async () => {
      await siblingGate;
      closedWhileSiblingRunning.push(mockClose.mock.calls.length > 0);
      return 'sibling';
    });

    // Caller B hits a severed socket on its health check and discards the
    // connection; it must not close the pool A is still using.
    mockExecute
      .mockRejectedValueOnce(new Error('Connection terminated unexpectedly'))
      .mockResolvedValue([]);
    await expect(
      runWithClient(OPTIONS, PUBLIC_SCHEMA, () => Promise.resolve('b')),
    ).resolves.toBe('b');

    expect(mockClose).not.toHaveBeenCalled();

    releaseSibling();
    await expect(sibling).resolves.toBe('sibling');

    expect(closedWhileSiblingRunning).toEqual([false]);
    // Closed exactly once, after the last in-flight user finished.
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  describe('credential rotation', () => {
    afterEach(() => {
      delete process.env.DB_SECRET_NAME;
    });

    it('drops the cached secret and reconnects when Postgres rejects the password', async () => {
      process.env.DB_SECRET_NAME = 'legacy-sports-dev-db-creds';
      const { runWithClient } = await loadHelpers();

      await runWithClient(OPTIONS, PUBLIC_SCHEMA, () => Promise.resolve('a'));

      // The credentials rotated inside the secret cache's TTL, so the cached
      // value no longer authenticates. Without the eviction the retry would
      // replay the same stale password until the TTL expired.
      mockExecute
        .mockRejectedValueOnce(
          pgError('password authentication failed for user', '28P01'),
        )
        .mockResolvedValue([]);

      await expect(
        runWithClient(OPTIONS, PUBLIC_SCHEMA, () => Promise.resolve('b')),
      ).resolves.toBe('b');

      expect(mockInvalidateSecretCache).toHaveBeenCalledTimes(1);
      // Scoped to the database secret, not a blanket cache clear.
      expect(mockInvalidateSecretCache).toHaveBeenCalledWith(
        'legacy-sports-dev-db-creds',
      );
      expect(constructedConnections).toBe(2);
    });

    it('does not invalidate secrets for an ordinary query failure', async () => {
      const { runWithClient } = await loadHelpers();

      await expect(
        runWithClient(OPTIONS, PUBLIC_SCHEMA, () =>
          Promise.reject(pgError('syntax error at or near', '42601')),
        ),
      ).rejects.toThrow('syntax error');

      expect(mockInvalidateSecretCache).not.toHaveBeenCalled();
    });
  });

  it('gives up and rethrows after the retry budget is exhausted', async () => {
    const { runWithClient } = await loadHelpers();

    mockExecute.mockRejectedValue(
      new Error('Connection terminated unexpectedly'),
    );

    await expect(
      runWithClient(OPTIONS, PUBLIC_SCHEMA, () => Promise.resolve('never')),
    ).rejects.toThrow('Connection terminated unexpectedly');

    // Initial attempt plus MAX_QUERY_RETRIES, each with a fresh connection,
    // and none of them left cached.
    expect(constructedConnections).toBe(3);
    expect(mockClose).toHaveBeenCalledTimes(3);
  });
});

describe('runWithClient — outside Lambda (LS-9530)', () => {
  const originalFunctionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
  const originalTaskRoot = process.env.LAMBDA_TASK_ROOT;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    delete process.env.LAMBDA_TASK_ROOT;
    constructedConnections = 0;
    mockIsInitialized = false;
    mockInitialize.mockImplementation(() => {
      mockIsInitialized = true;
      return Promise.resolve();
    });
    mockClose.mockImplementation(() => {
      mockIsInitialized = false;
      return Promise.resolve();
    });
    mockExecute.mockResolvedValue([]);
  });

  afterEach(() => {
    if (originalFunctionName !== undefined) {
      process.env.AWS_LAMBDA_FUNCTION_NAME = originalFunctionName;
    }
    if (originalTaskRoot !== undefined) {
      process.env.LAMBDA_TASK_ROOT = originalTaskRoot;
    }
  });

  it('still closes the connection after every call', async () => {
    const { runWithClient } = await loadHelpers();

    await runWithClient(OPTIONS, PUBLIC_SCHEMA, () => Promise.resolve('a'));
    await runWithClient(OPTIONS, PUBLIC_SCHEMA, () => Promise.resolve('b'));

    // CLI runs, scripts, migrations and jest must not be left holding a pool
    // that keeps the process alive.
    expect(mockClose).toHaveBeenCalledTimes(2);
    expect(constructedConnections).toBe(2);
  });
});
