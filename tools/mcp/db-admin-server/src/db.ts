import postgres from 'postgres';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

/**
 * Postgres connections for the hosted DB-admin MCP server.
 *
 * The server runs inside the VPC and reaches the dev RDS instance directly
 * over TCP — there is no SSM tunnel. Credentials come from Secrets Manager:
 *   - `MCP_READONLY_SECRET_NAME` → the SELECT-only `mcp_readonly` role, used by
 *     `db_query` and `db_migration_status`.
 *   - `DB_SECRET_NAME` → the `migration_user` role, used by `db_migrate` to run
 *     migration DDL. This role CAN write — `db_migrate` is gated separately by
 *     the `mcp/db` scope, a dev-only environment guard, and audit logging.
 *
 * Host/port/database come from `DB_HOST` / `DB_PORT` / `DB_NAME`, wired by
 * Terraform. `DB_HOST` is the RDS instance endpoint, which is formatted as
 * `host:5432`, so it is split here.
 */

const sm = new SecretsManagerClient({});

interface RoleCredentials {
  username: string;
  password: string;
}

async function readRoleSecret(secretName: string): Promise<RoleCredentials> {
  const result = await sm.send(
    new GetSecretValueCommand({ SecretId: secretName }),
  );
  const raw = result.SecretString?.trim();
  if (!raw) {
    throw new Error(`Secret "${secretName}" is missing SecretString`);
  }
  let parsed: Partial<RoleCredentials>;
  try {
    parsed = JSON.parse(raw) as Partial<RoleCredentials>;
  } catch {
    throw new Error(`Secret "${secretName}" is not valid JSON`);
  }
  if (!parsed.username || !parsed.password) {
    throw new Error(
      `Secret "${secretName}" is missing required fields: username and password`,
    );
  }
  return { username: parsed.username, password: parsed.password };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

/** Split the `host:port` RDS instance endpoint into host + port. */
function resolveHostPort(): { host: string; port: number } {
  const hostEnv = requireEnv('DB_HOST');
  const fallbackPort = process.env['DB_PORT'] ?? '5432';
  if (hostEnv.includes(':')) {
    const [host, portStr] = hostEnv.split(':');
    return { host, port: parseInt(portStr || fallbackPort, 10) };
  }
  return { host: hostEnv, port: parseInt(fallbackPort, 10) };
}

let readonlySql: postgres.Sql | null = null;

/**
 * Lazily create (and cache across warm Lambda invocations) a postgres
 * connection authenticated as the SELECT-only `mcp_readonly` role. Writes are
 * impossible: the role lacks INSERT/UPDATE/DELETE/DDL grants, and callers wrap
 * statements in a `READ ONLY` transaction as a second layer.
 *
 * Every new connection runs a `statement_timeout` so a runaway query (e.g.
 * `SELECT pg_sleep(9999)` from an agent) is cancelled by the server rather
 * than tying up a Lambda for the full function timeout.
 */
export async function getReadonlySql(): Promise<postgres.Sql> {
  if (readonlySql) return readonlySql;

  const creds = await readRoleSecret(requireEnv('MCP_READONLY_SECRET_NAME'));
  const { host, port } = resolveHostPort();
  const statementTimeoutMs = parseInt(
    process.env['DB_STATEMENT_TIMEOUT_MS'] ?? '30000',
    10,
  );

  readonlySql = postgres({
    host,
    port,
    database: process.env['DB_NAME'] ?? 'postgres',
    username: creds.username,
    password: creds.password,
    ssl: 'require',
    max: 2,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    connection: {
      statement_timeout: statementTimeoutMs,
    },
  });

  return readonlySql;
}

let migrationSql: postgres.Sql | null = null;

/**
 * Lazily create (and cache across warm Lambda invocations) a postgres
 * connection authenticated as the `migration_user` role for `db_migrate`.
 *
 * Unlike `getReadonlySql`, this role can run DDL — it is the write path. Access
 * to it is gated entirely by `db_migrate`'s own guards (the `mcp/db` scope, the
 * dev-only environment check, and audit logging); nothing else in this server
 * uses it.
 *
 * `max: 1` + `prepare: false` mirrors the local migration runner
 * (`lib/db-client/src/scripts/rollback-migrations.ts`): a single connection for
 * ordered migrations, and no prepared statements because DDL referencing
 * user-defined functions does not work with them.
 *
 * The `statement_timeout` (default 840s, `DB_MIGRATION_STATEMENT_TIMEOUT_MS`
 * to override — Terraform wires it to the worker Lambda timeout minus a 60s
 * buffer) sits just below the async worker's ~900s function timeout (LS-8563):
 * schema changes (e.g. `CREATE INDEX`, backfills) may legitimately run for
 * minutes, but a statement that outlives the worker would freeze mid-run with
 * no terminal write — the timeout makes runaway DDL fail cleanly inside the
 * worker's lifetime instead.
 */
export async function getMigrationSql(): Promise<postgres.Sql> {
  if (migrationSql) return migrationSql;

  const creds = await readRoleSecret(requireEnv('DB_SECRET_NAME'));
  const { host, port } = resolveHostPort();
  const statementTimeoutMs = parseInt(
    process.env['DB_MIGRATION_STATEMENT_TIMEOUT_MS'] ?? '840000',
    10,
  );

  migrationSql = postgres({
    host,
    port,
    database: process.env['DB_NAME'] ?? 'postgres',
    username: creds.username,
    password: creds.password,
    ssl: 'require',
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    connection: {
      statement_timeout: statementTimeoutMs,
    },
  });

  return migrationSql;
}
