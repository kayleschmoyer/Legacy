import postgres from 'postgres';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { LOGGER } from '@legacy-sports/logging';

/**
 * Postgres connections for the hosted DB-admin MCP server.
 *
 * The server runs inside the VPC and reaches the dev RDS instance directly
 * over TCP — there is no SSM tunnel. Credentials come from Secrets Manager:
 *   - `MCP_READONLY_SECRET_NAME` → the SELECT-only `mcp_readonly` role, used by
 *     `db_query` and `db_migration_status`.
 *   - `DB_SECRET_NAME` → the RDS master user (`postgres`, an `rds_superuser`
 *     member with CREATEROLE — Terraform's `database_credentials` secret), used
 *     by `db_migrate` to run migration DDL and by the role-password self-heal
 *     below. This role CAN write — `db_migrate` is gated separately by the
 *     `mcp/db` scope, a dev-only environment guard, and audit logging.
 *
 *   - `MCP_WRITE_SECRET_NAME` → the DML-only `mcp_write` role (INSERT/UPDATE/
 *     DELETE/SELECT, no DDL), used by `db_execute` for ad-hoc data writes.
 *
 * Host/port/database come from `DB_HOST` / `DB_PORT` / `DB_NAME`, wired by
 * Terraform. `DB_HOST` is the RDS instance endpoint, which is formatted as
 * `host:5432`, so it is split here.
 *
 * Role-password self-heal (LS-10416): the `mcp_readonly` / `mcp_write` role
 * passwords are seeded once by their creating migrations, while Terraform's
 * `random_password` writes the real value to Secrets Manager — nothing else
 * links the two, so they drift (every secret regeneration or fresh-env
 * migrate). When a role pool is first opened it is probed; a `28P01`
 * (invalid_password) means drift, so the role's password is reset to the
 * secret's value over the master connection and the pool is reopened. The
 * heal is logged at error level, which forwards to Rollbar as the alert.
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

let readonlySql: Promise<postgres.Sql> | null = null;
let readonlyConnectionInfo: { host: string; port: number } | null = null;

/** The MCP login roles whose passwords live in their own Secrets Manager secret. */
export type McpRole = 'mcp_readonly' | 'mcp_write';

const ROLE_SECRET_ENV: Record<McpRole, string> = {
  mcp_readonly: 'MCP_READONLY_SECRET_NAME',
  mcp_write: 'MCP_WRITE_SECRET_NAME',
};

/** SQLSTATE Postgres raises when password authentication fails. */
const INVALID_PASSWORD_SQLSTATE = '28P01';

export function isInvalidPasswordError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === INVALID_PASSWORD_SQLSTATE
  );
}

/**
 * Reset `role`'s Postgres password to `password` over the master connection.
 * Role name and password are bound as transaction-local GUCs and formatted
 * with `%I`/`%L` server-side — never interpolated into SQL text — mirroring
 * the role-creation migrations and `lib/db-client/src/scripts/resync-mcp-role-password.ts`.
 */
async function setRolePassword(role: McpRole, password: string): Promise<void> {
  const admin = await getMigrationSql();
  await admin.begin(async (tx) => {
    await tx`SELECT set_config('mcp_resync.role', ${role}, true), set_config('mcp_resync.password', ${password}, true)`;
    await tx.unsafe(`
      DO $$
      BEGIN
        EXECUTE format(
          'ALTER ROLE %I WITH PASSWORD %L',
          current_setting('mcp_resync.role'),
          current_setting('mcp_resync.password')
        );
      END
      $$;
    `);
  });
}

interface RolePoolOptions {
  max: number;
  statementTimeoutMs: number;
}

/**
 * Open a pool authenticated as `role` and probe it. On `28P01` the role's
 * password has drifted from its secret: resync it and reopen. Any other probe
 * failure is left for the tool's own query to surface, so its error
 * classification (statement_timeout / upstream_unavailable / sql_error) is
 * unchanged.
 */
async function openRolePool(
  role: McpRole,
  { max, statementTimeoutMs }: RolePoolOptions,
): Promise<postgres.Sql> {
  const secretName = requireEnv(ROLE_SECRET_ENV[role]);
  const creds = await readRoleSecret(secretName);
  if (creds.username !== role) {
    throw new Error(
      `Secret "${secretName}" is for role "${creds.username}", not "${role}"`,
    );
  }
  const { host, port } = resolveHostPort();
  if (role === 'mcp_readonly') readonlyConnectionInfo = { host, port };

  const connect = (): postgres.Sql =>
    postgres({
      host,
      port,
      database: process.env['DB_NAME'] ?? 'postgres',
      username: creds.username,
      password: creds.password,
      ssl: 'require',
      max,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      connection: {
        statement_timeout: statementTimeoutMs,
      },
    });

  const pool = connect();
  try {
    await pool`SELECT 1`;
    return pool;
  } catch (error) {
    if (!isInvalidPasswordError(error)) return pool;
    await pool.end({ timeout: 0 });
  }

  LOGGER.error(
    `[db-admin] Postgres role "${role}" password drifted from Secrets Manager ("${secretName}") — ` +
      'login failed with 28P01; resyncing the role password from the secret (LS-10416).',
  );
  try {
    await setRolePassword(role, creds.password);
  } catch (healError) {
    const reason =
      healError instanceof Error ? healError.message : String(healError);
    throw new Error(
      `Postgres role "${role}" password does not match Secrets Manager ("${secretName}") and the ` +
        `automatic resync failed: ${reason}. Manual fallback: pnpm --prefix lib/db-client run ` +
        `db:resync-role -- --role ${role} --secret-name ${secretName}`,
    );
  }

  const healed = connect();
  try {
    await healed`SELECT 1`;
  } catch (error) {
    await healed.end({ timeout: 0 });
    throw error;
  }
  LOGGER.info(
    `[db-admin] Postgres role "${role}" password resynced; login verified.`,
  );
  return healed;
}

/**
 * The host/port the readonly connection was last opened against — known to
 * this client at connect time, unlike the `postgres` driver's own
 * CONNECT_TIMEOUT error, which can report `undefined:undefined` when the
 * failure happens before its internal socket options are populated (LS-9590).
 * `query.ts` uses this to fill in a legible host:port on that error path.
 */
export function getReadonlyConnectionInfo(): {
  host: string;
  port: number;
} | null {
  return readonlyConnectionInfo;
}

/** Cache a pool promise across warm invocations; a failed open is not cached. */
function cachePool(
  open: () => Promise<postgres.Sql>,
  clear: () => void,
): Promise<postgres.Sql> {
  return open().catch((error: unknown) => {
    clear();
    throw error;
  });
}

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
export function getReadonlySql(): Promise<postgres.Sql> {
  readonlySql ??= cachePool(
    () =>
      openRolePool('mcp_readonly', {
        max: 2,
        statementTimeoutMs: parseInt(
          process.env['DB_STATEMENT_TIMEOUT_MS'] ?? '30000',
          10,
        ),
      }),
    () => {
      readonlySql = null;
    },
  );
  return readonlySql;
}

let migrationSql: postgres.Sql | null = null;

/**
 * Lazily create (and cache across warm Lambda invocations) a postgres
 * connection authenticated as the RDS master user (`DB_SECRET_NAME`) for
 * `db_migrate` and the role-password self-heal.
 *
 * Unlike `getReadonlySql`, this role can run DDL — it is the write path. Access
 * to it is gated by `db_migrate`'s own guards (the `mcp/db` scope, the
 * dev-only environment check, and audit logging); the only other user is
 * `openRolePool`'s `ALTER ROLE ... PASSWORD` resync (LS-10416).
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

let writeSql: Promise<postgres.Sql> | null = null;

/**
 * Lazily create (and cache across warm Lambda invocations) a postgres
 * connection authenticated as the DML-only `mcp_write` role for `db_execute`.
 *
 * Unlike `getMigrationSql`, this role has no DDL grants at all — it can only
 * INSERT/UPDATE/DELETE/SELECT on the public and app_internal schemas. Access
 * is gated by `db_execute`'s own guards (the `mcp/db` scope, the dev-only
 * environment check, and audit logging), same as `db_migrate`.
 *
 * `statement_timeout` defaults short (unlike the migration connection) since
 * `db_execute` runs a single ad-hoc statement, not long-running DDL/backfills.
 */
export function getWriteSql(): Promise<postgres.Sql> {
  writeSql ??= cachePool(
    () =>
      openRolePool('mcp_write', {
        max: 2,
        statementTimeoutMs: parseInt(
          process.env['DB_WRITE_STATEMENT_TIMEOUT_MS'] ?? '30000',
          10,
        ),
      }),
    () => {
      writeSql = null;
    },
  );
  return writeSql;
}
