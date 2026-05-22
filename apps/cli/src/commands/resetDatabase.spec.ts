import {
  assertEnvNotProduction,
  assertHostAllowed,
  getAllowedDevHosts,
  handleResetDatabase,
} from './resetDatabase';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockGetDatabaseConfig = jest.fn<Promise<unknown>, []>();
const mockResetDatabase = jest.fn<Promise<void>, []>();

jest.mock('@legacy-sports/db-client', () => ({
  getDatabaseConfig: (): Promise<unknown> => mockGetDatabaseConfig(),
  resetDatabase: (): Promise<void> => mockResetDatabase(),
}));

describe('assertEnvNotProduction', () => {
  it('throws when NODE_ENV=production', () => {
    expect(() => assertEnvNotProduction({ NODE_ENV: 'production' })).toThrow(
      /NODE_ENV=production/,
    );
  });

  it('throws when LEGACY_SPORTS_ENV=production', () => {
    expect(() =>
      assertEnvNotProduction({ LEGACY_SPORTS_ENV: 'production' }),
    ).toThrow(/LEGACY_SPORTS_ENV=production/);
  });

  it('does not throw for non-production envs', () => {
    expect(() =>
      assertEnvNotProduction({
        NODE_ENV: 'development',
        LEGACY_SPORTS_ENV: 'dev',
      }),
    ).not.toThrow();
  });
});

describe('getAllowedDevHosts', () => {
  it('includes the documented defaults', () => {
    const allowed = getAllowedDevHosts({});
    expect(allowed.has('localhost')).toBe(true);
    expect(allowed.has('127.0.0.1')).toBe(true);
    expect(allowed.has('host.docker.internal')).toBe(true);
  });

  it('extends the allow-list from LEGACY_SPORTS_DEV_DB_HOSTS', () => {
    const allowed = getAllowedDevHosts({
      LEGACY_SPORTS_DEV_DB_HOSTS: 'dev-db.example.com, another.example.com',
    });
    expect(allowed.has('dev-db.example.com')).toBe(true);
    expect(allowed.has('another.example.com')).toBe(true);
  });
});

describe('assertHostAllowed', () => {
  it('allows localhost', () => {
    expect(() => assertHostAllowed('localhost', {})).not.toThrow();
  });

  it('allows 127.0.0.1', () => {
    expect(() => assertHostAllowed('127.0.0.1', {})).not.toThrow();
  });

  it('allows host.docker.internal', () => {
    expect(() => assertHostAllowed('host.docker.internal', {})).not.toThrow();
  });

  it('refuses an RDS production-shaped host (*.amazonaws.com)', () => {
    expect(() =>
      assertHostAllowed(
        'legacy-sports-prod.cluster-abc123.us-east-1.rds.amazonaws.com',
        {},
      ),
    ).toThrow(/not in the dev allow-list/);
  });

  it('allows hosts added via LEGACY_SPORTS_DEV_DB_HOSTS', () => {
    expect(() =>
      assertHostAllowed('dev-db.example.com', {
        LEGACY_SPORTS_DEV_DB_HOSTS: 'dev-db.example.com',
      }),
    ).not.toThrow();
  });
});

describe('handleResetDatabase', () => {
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NODE_ENV;
    delete process.env.LEGACY_SPORTS_ENV;
    delete process.env.LEGACY_SPORTS_DEV_DB_HOSTS;
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((
      code?: number,
    ) => {
      throw new Error(`process.exit(${code ?? ''})`);
    }) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('exits without confirmation flag', async () => {
    await expect(handleResetDatabase({})).rejects.toThrow('process.exit(1)');
    expect(mockGetDatabaseConfig).not.toHaveBeenCalled();
    expect(mockResetDatabase).not.toHaveBeenCalled();
  });

  it('refuses to run against an RDS host (*.amazonaws.com)', async () => {
    mockGetDatabaseConfig.mockResolvedValue({
      host: 'legacy-sports-prod.cluster-abc.us-east-1.rds.amazonaws.com',
      database: 'legacy_sports',
      user: 'app',
      password: 'secret',
    });

    await expect(
      handleResetDatabase({ confirm: true, dbName: 'legacy_sports' }),
    ).rejects.toThrow('process.exit(1)');

    expect(mockResetDatabase).not.toHaveBeenCalled();
  });

  it('refuses to run when NODE_ENV=production', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      handleResetDatabase({ confirm: true, dbName: 'legacy_sports' }),
    ).rejects.toThrow('process.exit(1)');
    expect(mockGetDatabaseConfig).not.toHaveBeenCalled();
    expect(mockResetDatabase).not.toHaveBeenCalled();
  });

  it('refuses to run when LEGACY_SPORTS_ENV=production', async () => {
    process.env.LEGACY_SPORTS_ENV = 'production';
    await expect(
      handleResetDatabase({ confirm: true, dbName: 'legacy_sports' }),
    ).rejects.toThrow('process.exit(1)');
    expect(mockGetDatabaseConfig).not.toHaveBeenCalled();
    expect(mockResetDatabase).not.toHaveBeenCalled();
  });

  it('refuses without --db-name', async () => {
    mockGetDatabaseConfig.mockResolvedValue({
      host: 'localhost',
      database: 'legacy_sports_dev',
      user: 'app',
      password: 'secret',
    });

    await expect(handleResetDatabase({ confirm: true })).rejects.toThrow(
      'process.exit(1)',
    );

    expect(mockResetDatabase).not.toHaveBeenCalled();
  });

  it('refuses when --db-name does not match the connected database', async () => {
    mockGetDatabaseConfig.mockResolvedValue({
      host: 'localhost',
      database: 'legacy_sports_dev',
      user: 'app',
      password: 'secret',
    });

    await expect(
      handleResetDatabase({ confirm: true, dbName: 'legacy_sports' }),
    ).rejects.toThrow('process.exit(1)');

    expect(mockResetDatabase).not.toHaveBeenCalled();
  });

  it('proceeds when all guards pass', async () => {
    mockGetDatabaseConfig.mockResolvedValue({
      host: 'localhost',
      database: 'legacy_sports_dev',
      user: 'app',
      password: 'secret',
    });
    mockResetDatabase.mockResolvedValue(undefined);

    await handleResetDatabase({
      confirm: true,
      dbName: 'legacy_sports_dev',
    });

    expect(mockResetDatabase).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
