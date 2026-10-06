import path from 'path';
import {
  buildCliConnectionConfig,
  isReadOnlyQuery,
  resolveQuerySslConfig,
} from './db-cli';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

describe('resolveQuerySslConfig', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.DB_SSL_SELF_SIGNED;
    delete process.env.DB_CERT_PATH;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('disables verification when DB_SSL_SELF_SIGNED=true, regardless of DB_CERT_PATH', () => {
    process.env.DB_SSL_SELF_SIGNED = 'true';
    process.env.DB_CERT_PATH = '/does/not/matter.pem';

    expect(resolveQuerySslConfig()).toEqual({ rejectUnauthorized: false });
  });

  it('defaults to strict verification (never weakened implicitly)', () => {
    process.env.DB_CERT_PATH = __filename;

    const result = resolveQuerySslConfig();

    expect(result.rejectUnauthorized).toBe(true);
    expect(result.ca).toBeDefined();
  });

  it('resolves a relative DB_CERT_PATH against the repo root, not the cwd', () => {
    process.env.DB_CERT_PATH = path.relative(REPO_ROOT, __filename);
    const cwd = jest
      .spyOn(process, 'cwd')
      .mockReturnValue(path.join(REPO_ROOT, 'lib/db-client'));

    try {
      const result = resolveQuerySslConfig();
      expect(result.rejectUnauthorized).toBe(true);
      expect(result.ca).toBeDefined();
    } finally {
      cwd.mockRestore();
    }
  });

  it('reports the repo-root-resolved path when a relative DB_CERT_PATH is missing', () => {
    process.env.DB_CERT_PATH = 'certs/missing-bundle.pem';

    expect(() => resolveQuerySslConfig()).toThrow(
      path.join(REPO_ROOT, 'certs/missing-bundle.pem'),
    );
  });

  it('surfaces a clear, actionable error when the CA bundle cannot be read (not a raw chain dump)', () => {
    process.env.DB_CERT_PATH = '/definitely/does/not/exist.pem';

    expect(() => resolveQuerySslConfig()).toThrow(
      /Failed to read CA certificate.*DB_SSL_SELF_SIGNED=true/s,
    );
  });
});

describe('isReadOnlyQuery', () => {
  it.each([
    'SELECT 1',
    '  select * from users',
    'EXPLAIN SELECT * FROM users',
    'explain analyze select 1',
    'SHOW search_path',
    'WITH t AS (SELECT 1) SELECT * FROM t',
    '-- a leading comment\nSELECT 1',
    '/* block comment */ SELECT 1',
  ])('treats %p as read-only', (sql) => {
    expect(isReadOnlyQuery(sql)).toBe(true);
  });

  it.each([
    'DELETE FROM users',
    'UPDATE users SET name = $1',
    'DROP TABLE users',
    'TRUNCATE users',
    'INSERT INTO users (id) VALUES (1)',
    'ALTER TABLE users ADD COLUMN foo text',
    'CREATE INDEX idx ON users(id)',
    'GRANT SELECT ON users TO public',
    'WITH deleted AS (DELETE FROM users RETURNING *) SELECT * FROM deleted',
    'WITH inserted AS (INSERT INTO users (id) VALUES (1) RETURNING *) SELECT * FROM inserted',
  ])('treats %p as NOT read-only', (sql) => {
    expect(isReadOnlyQuery(sql)).toBe(false);
  });
});

describe('buildCliConnectionConfig', () => {
  const ORIGINAL_ENV = process.env;
  const credentials = {
    host: 'legacy-sports-dev.abc123.us-east-1.rds.amazonaws.com',
    port: 5432,
    user: 'app',
    password: 'pw',
    database: 'postgres',
  };

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.DB_TUNNEL;
    delete process.env.LAMBDA_TASK_ROOT;
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('connects to the resolved host when DB_TUNNEL is unset', () => {
    const config = buildCliConnectionConfig(credentials, {
      rejectUnauthorized: true,
    });

    expect(config).toEqual({
      ...credentials,
      ssl: { rejectUnauthorized: true },
    });
  });

  it('routes through DB_TUNNEL while verifying TLS against the RDS hostname', () => {
    process.env.DB_TUNNEL = 'localhost:15432';

    const config = buildCliConnectionConfig(credentials, {
      rejectUnauthorized: true,
    });

    expect(config.host).toBe('localhost');
    expect(config.port).toBe(15432);
    expect(config.ssl?.rejectUnauthorized).toBe(true);
    expect(config.ssl?.servername).toBe(credentials.host);
    expect(config.ssl?.checkServerIdentity).toEqual(expect.any(Function));
  });

  it('swaps only the endpoint when no ssl config is given (psql command)', () => {
    process.env.DB_TUNNEL = 'localhost:15432';

    const config = buildCliConnectionConfig(credentials);

    expect(config).toEqual({
      ...credentials,
      host: 'localhost',
      port: 15432,
      ssl: undefined,
    });
  });
});
