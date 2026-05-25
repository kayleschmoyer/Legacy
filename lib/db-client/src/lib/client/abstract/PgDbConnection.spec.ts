import { PgDbConnection } from './PgDbConnection';

jest.mock('../../../config/database', () => ({
  getDatabaseConfig: jest.fn().mockResolvedValue({
    database: 'testdb',
    host: 'localhost',
    password: 'secret',
    user: 'user',
    ssl: undefined,
  }),
}));

jest.mock('drizzle-orm/node-postgres', () => ({
  drizzle: jest.fn().mockReturnValue({}),
}));

const mockRelease = jest.fn();
const mockEnd = jest.fn().mockResolvedValue(undefined);
const mockConnect = jest.fn();
const mockOn = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    end: mockEnd,
    on: mockOn,
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  })),
}));

describe('PgDbConnection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockEnd.mockResolvedValue(undefined);
    mockRelease.mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('_initialize retry logic', () => {
    it('succeeds on first attempt without retrying', async () => {
      mockConnect.mockResolvedValueOnce({ release: mockRelease });

      const conn = new PgDbConnection(undefined, {});
      await conn.initialize();

      expect(mockConnect).toHaveBeenCalledTimes(1);
      expect(mockEnd).not.toHaveBeenCalled();
    });

    it('retries after a transient failure and succeeds on second attempt', async () => {
      const transientError = new Error('Connection terminated unexpectedly');
      mockConnect
        .mockRejectedValueOnce(transientError)
        .mockResolvedValueOnce({ release: mockRelease });

      const initPromise = conn_initialize();

      // Let the first attempt fail, then advance past the 1s retry delay
      await jest.runAllTimersAsync();

      await initPromise;

      expect(mockConnect).toHaveBeenCalledTimes(2);
      expect(mockEnd).not.toHaveBeenCalled();
    });

    it('retries twice and succeeds on third attempt', async () => {
      const transientError = new Error(
        'Connection terminated due to connection timeout',
      );
      mockConnect
        .mockRejectedValueOnce(transientError)
        .mockRejectedValueOnce(transientError)
        .mockResolvedValueOnce({ release: mockRelease });

      const initPromise = conn_initialize();
      await jest.runAllTimersAsync();
      await initPromise;

      expect(mockConnect).toHaveBeenCalledTimes(3);
      expect(mockEnd).not.toHaveBeenCalled();
    });

    it('throws and ends pool after all 3 attempts fail', async () => {
      const persistentError = new Error(
        'Connection terminated due to connection timeout',
      );
      mockConnect.mockRejectedValue(persistentError);

      // Attach rejection handler immediately to avoid unhandled-rejection warning
      const conn = new PgDbConnection(undefined, {});
      const rejection = expect(conn.initialize()).rejects.toThrow(
        'Connection terminated due to connection timeout',
      );

      await jest.runAllTimersAsync();
      await rejection;

      expect(mockConnect).toHaveBeenCalledTimes(3);
      expect(mockEnd).toHaveBeenCalledTimes(1);
    });
  });
});

function conn_initialize() {
  const conn = new PgDbConnection(undefined, {});
  return conn.initialize();
}
