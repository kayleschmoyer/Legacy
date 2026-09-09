import { isReadOnlyQuery, resolveQuerySslConfig } from './db-cli';

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
