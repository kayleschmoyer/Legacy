import { isReadOnlyQuery } from './db-cli';

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
