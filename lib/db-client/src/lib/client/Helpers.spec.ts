import { runWithClient, withPoolTimeoutRetry } from './Helpers';

jest.mock('drizzle-orm', () => ({
  sql: jest.fn().mockReturnValue({}),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  invalidateSecretCache: jest.fn(),
}));

const mockClose = jest.fn();
const mockExecute = jest.fn();
const mockInitialize = jest.fn();

let mockIsInitialized = false;

jest.mock('./abstract/PgDbConnection', () => ({
  PgDbConnection: jest.fn().mockImplementation(() => ({
    get isInitialized() {
      return mockIsInitialized;
    },
    initialize: mockInitialize,
    close: mockClose,
    db: { execute: mockExecute },
  })),
}));

jest.mock('../../drizzle/public/schema', () => ({}));
jest.mock('../../drizzle/internal/schema', () => ({}));

const SCHEMA = {};
const OPTIONS = { type: 'pg-remote' as const };

// The lint and build TS programs disagree on setTimeout's return type, so a
// direct assertion is stripped by eslint --fix under one yet required by the
// other. Route through `unknown` in a helper so the assertion survives --fix.
const asTimeoutHandle = (value: unknown): ReturnType<typeof setTimeout> =>
  value as ReturnType<typeof setTimeout>;

describe('runWithClient', () => {
  let setTimeoutSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // Make retry delays instant so tests don't need fake timers.
    setTimeoutSpy = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((fn: () => void) => {
        fn();
        return asTimeoutHandle(0);
      });
    mockIsInitialized = false;
    mockInitialize.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
    mockExecute.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('happy path', () => {
    it('returns the callback result on first attempt', async () => {
      const callback = jest.fn().mockResolvedValue('result');
      await expect(runWithClient(OPTIONS, SCHEMA, callback)).resolves.toBe(
        'result',
      );
      expect(callback).toHaveBeenCalledTimes(1);
      expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('runs the health-check query before the callback', async () => {
      const order: string[] = [];
      mockExecute.mockImplementation(() => {
        order.push('health');
        return Promise.resolve([]);
      });
      const callback = jest.fn().mockImplementation(() => {
        order.push('callback');
        return Promise.resolve('ok');
      });
      await runWithClient(OPTIONS, SCHEMA, callback);
      expect(order).toEqual(['health', 'callback']);
    });
  });

  describe('retry on transient pg errors', () => {
    it('retries once and succeeds when first attempt has a transient pg error', async () => {
      const transientErr = Object.assign(new Error('connection failure'), {
        code: '08006',
      });
      const callback = jest
        .fn()
        .mockRejectedValueOnce(transientErr)
        .mockResolvedValueOnce('ok');

      await expect(runWithClient(OPTIONS, SCHEMA, callback)).resolves.toBe(
        'ok',
      );
      expect(callback).toHaveBeenCalledTimes(2);
      // Closed after the failing attempt and after the successful one
      expect(mockClose).toHaveBeenCalledTimes(2);
    });

    it('retries a transient error wrapped in a DrizzleQueryError-style cause chain', async () => {
      const pgErr = Object.assign(new Error('admin shutdown'), {
        code: '57P01',
      });
      const drizzleErr = Object.assign(
        new Error('Failed query: select ... from "app_internal"."users"'),
        { cause: pgErr },
      );
      const callback = jest
        .fn()
        .mockRejectedValueOnce(drizzleErr)
        .mockResolvedValueOnce('recovered');

      await expect(runWithClient(OPTIONS, SCHEMA, callback)).resolves.toBe(
        'recovered',
      );
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('exhausts retries and throws when all attempts fail with transient errors', async () => {
      const transientErr = Object.assign(new Error('connection failure'), {
        code: '08006',
      });
      const callback = jest.fn().mockRejectedValue(transientErr);

      await expect(runWithClient(OPTIONS, SCHEMA, callback)).rejects.toThrow(
        'connection failure',
      );
      // 1 initial + 2 retries = 3 total attempts
      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('closes the connection on each failed attempt', async () => {
      const transientErr = Object.assign(new Error('connection failure'), {
        code: '08006',
      });
      const callback = jest.fn().mockRejectedValue(transientErr);

      await runWithClient(OPTIONS, SCHEMA, callback).catch(() => undefined);
      // close() called once per attempt (3 total: 1 initial + 2 retries)
      expect(mockClose).toHaveBeenCalledTimes(3);
    });

    it('uses exponential back-off between retries', async () => {
      const transientErr = Object.assign(new Error('conn failure'), {
        code: '08003',
      });
      const callback = jest.fn().mockRejectedValue(transientErr);

      await runWithClient(OPTIONS, SCHEMA, callback).catch(() => undefined);

      // Assert via setTimeout spy args rather than LOGGER.warn to avoid
      // @typescript-eslint/unbound-method / no-unsafe-member-access.
      // This directly tests the back-off timing values passed to setTimeout.
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(
        1,
        expect.any(Function),
        100,
      );
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(
        2,
        expect.any(Function),
        200,
      );
    });
  });

  describe('no retry on non-transient errors', () => {
    it('throws immediately without retrying on a plain Error', async () => {
      const appErr = new Error('some business logic error');
      const callback = jest.fn().mockRejectedValue(appErr);

      await expect(runWithClient(OPTIONS, SCHEMA, callback)).rejects.toThrow(
        'some business logic error',
      );
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('throws immediately without retrying on a non-transient pg error (23505)', async () => {
      const pgErr = Object.assign(new Error('duplicate key'), {
        code: '23505',
      });
      const callback = jest.fn().mockRejectedValue(pgErr);

      await expect(runWithClient(OPTIONS, SCHEMA, callback)).rejects.toThrow(
        'duplicate key',
      );
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('health-check failure', () => {
    it('retries when the health-check query itself fails with a transient error', async () => {
      const transientErr = Object.assign(new Error('connection gone'), {
        code: '08003',
      });
      // First execute (health-check) fails; subsequent calls succeed
      mockExecute.mockRejectedValueOnce(transientErr).mockResolvedValue([]);
      const callback = jest.fn().mockResolvedValue('ok');

      await expect(runWithClient(OPTIONS, SCHEMA, callback)).resolves.toBe(
        'ok',
      );
      expect(callback).toHaveBeenCalledTimes(1);
    });

    // LS-10037 (Rollbar items 253/259): the health check competes for the same
    // pool as every other concurrent query, so it can fail with the pool's
    // own connection-timeout message (no SQLSTATE code) rather than one of
    // the Aurora transient codes above. Previously this wasn't classified as
    // recoverable and propagated straight to the caller.
    it('retries when the health-check query fails with the pool connection-timeout message', async () => {
      const poolTimeoutErr = new Error(
        'timeout exceeded when trying to connect',
      );
      mockExecute.mockRejectedValueOnce(poolTimeoutErr).mockResolvedValue([]);
      const callback = jest.fn().mockResolvedValue('ok');

      await expect(runWithClient(OPTIONS, SCHEMA, callback)).resolves.toBe(
        'ok',
      );
      expect(callback).toHaveBeenCalledTimes(1);
      expect(mockExecute).toHaveBeenCalledTimes(2);
    });

    it('retries a pool connection-timeout error wrapped in a DrizzleQueryError-style cause chain', async () => {
      const poolTimeoutErr = new Error(
        'timeout exceeded when trying to connect',
      );
      const drizzleErr = Object.assign(
        new Error('Failed query: select 1 + 1'),
        { cause: poolTimeoutErr },
      );
      mockExecute.mockRejectedValueOnce(drizzleErr).mockResolvedValue([]);
      const callback = jest.fn().mockResolvedValue('ok');

      await expect(runWithClient(OPTIONS, SCHEMA, callback)).resolves.toBe(
        'ok',
      );
      expect(mockExecute).toHaveBeenCalledTimes(2);
    });
  });
});

// LS-8478: pg-pool throws a plain Error (no SQLSTATE code) when
// connectionTimeoutMillis elapses waiting for a free client. `withPoolTimeoutRetry`
// catches that specific case (unlike `runWithClient`'s SQLSTATE-based retry).
describe('withPoolTimeoutRetry', () => {
  beforeEach(() => {
    jest.spyOn(global, 'setTimeout').mockImplementation((fn: () => void) => {
      fn();
      return asTimeoutHandle(0);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the result on first attempt when there is no error', async () => {
    const queryFn = jest.fn().mockResolvedValue('rows');
    await expect(withPoolTimeoutRetry(queryFn)).resolves.toBe('rows');
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('retries when the pool connection-timeout error is thrown directly', async () => {
    const poolTimeoutErr = new Error('timeout exceeded when trying to connect');
    const queryFn = jest
      .fn()
      .mockRejectedValueOnce(poolTimeoutErr)
      .mockResolvedValueOnce('rows');

    await expect(withPoolTimeoutRetry(queryFn)).resolves.toBe('rows');
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('retries when the pool timeout is wrapped in a DrizzleQueryError-style cause chain', async () => {
    const poolTimeoutErr = new Error('timeout exceeded when trying to connect');
    const drizzleErr = Object.assign(
      new Error('Failed query: select "id" from "league_positions" where ...'),
      { cause: poolTimeoutErr },
    );
    const queryFn = jest
      .fn()
      .mockRejectedValueOnce(drizzleErr)
      .mockResolvedValueOnce('rows');

    await expect(withPoolTimeoutRetry(queryFn)).resolves.toBe('rows');
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('exhausts retries and throws when every attempt hits the pool timeout', async () => {
    const poolTimeoutErr = new Error('timeout exceeded when trying to connect');
    const queryFn = jest.fn().mockRejectedValue(poolTimeoutErr);

    await expect(withPoolTimeoutRetry(queryFn)).rejects.toThrow(
      'timeout exceeded when trying to connect',
    );
    // 1 initial + 2 retries = 3 total attempts
    expect(queryFn).toHaveBeenCalledTimes(3);
  });

  it('throws immediately without retrying on an unrelated error', async () => {
    const appErr = new Error('some business logic error');
    const queryFn = jest.fn().mockRejectedValue(appErr);

    await expect(withPoolTimeoutRetry(queryFn)).rejects.toThrow(
      'some business logic error',
    );
    expect(queryFn).toHaveBeenCalledTimes(1);
  });
});
