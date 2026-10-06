#!/usr/bin/env tsx
/**
 * Resync an MCP database role's live Postgres password to match its current
 * AWS Secrets Manager value (LS-9974).
 *
 * Root cause: mcp_write (and, by the same construction, mcp_readonly) is
 * created/updated by a one-time migration
 * (lib/db-client/migrations/20260902_120100_add_mcp_write_role.ts) whose
 * `ALTER ROLE ... PASSWORD` statement is seeded from the MCP_WRITE_DB_PASSWORD
 * env var *at the moment the migration ran*. drizzle records that migration as
 * applied in drizzle.__drizzle_migrations and never re-runs it. The
 * MCP_WRITE_DB_PASSWORD env var is NOT wired into the hosted mcp-db Lambda
 * (terraform/main/lambda-mcp-db.tf only sets MCP_WRITE_SECRET_NAME, the
 * secret's *name*, used to authenticate AS that role — never the value used to
 * set the role's password), so if this migration ran through `db_migrate`
 * (the hosted, sandboxed path — which only allows `require('postgres')` /
 * `require('drizzle-orm')`, so a migration cannot itself reach into Secrets
 * Manager to self-heal), the env var was unset and the ALTER ROLE fell back to
 * the migration's literal default password ('CHANGE_ME_IN_PRODUCTION').
 * Meanwhile Terraform's `random_password.mcp_write_db_password` resource keeps
 * generating the *real* password stored in Secrets Manager. There is no
 * rotation Lambda linking the two (see the TODOs in terraform/main/secrets.tf),
 * so the Postgres role and the secret the Lambda authenticates with
 * permanently disagree until someone manually re-syncs them — this script is
 * that manual resync path.
 *
 * Since LS-10416 this is the FALLBACK path: the hosted mcp-db Lambda now
 * resyncs the role itself on its first 28P01 login failure
 * (tools/mcp/db-admin-server/src/db.ts, `openRolePool`). Use this script only
 * when that self-heal reports "automatic resync failed".
 *
 * Run this LOCALLY (not from a hosted/cloud agent session — neither carries
 * AWS credentials): it needs `aws sso login` credentials to read the target
 * secret, and DB network access to connect as the privileged migration user
 * (the same credentials `db_migrate`/`pnpm run db:up` use).
 *
 * Usage:
 *   pnpm --prefix lib/db-client run db:resync-role -- --role mcp_write --secret-name <secret-id-or-arn>
 *
 * `--secret-name` is the same secret referenced by the Lambda's
 * MCP_WRITE_SECRET_NAME / MCP_READONLY_SECRET_NAME env var — look it up with:
 *   aws lambda get-function-configuration --function-name <env>-legacy-sports-mcp-db \
 *     --query "Environment.Variables.MCP_WRITE_SECRET_NAME"
 * or via `aws secretsmanager list-secrets --query "SecretList[?starts_with(Name, '<env>-legacy-sports-mcp-write-db-creds')].Name"`.
 *
 * After this script reports success, verify end-to-end with a real
 * `db_execute` MCP call (e.g. `SELECT 1`) — the hosted Lambda's connection pool
 * is cached across warm invocations, so a cold `db_execute` call afterward
 * picks up the corrected password automatically; no Lambda redeploy needed.
 */

import { config } from 'dotenv';
// eslint-disable-next-line import/order -- resolve needed immediately for config
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../../.env') });

import postgres from 'postgres';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';
import { LOGGER } from '@legacy-sports/logging';
import { getMigrationDatabaseConfig } from '../config/database';

// corpus_ingest_readonly (LS-10605) is created without a password; this
// script is how it first gets the one Terraform stored in its secret.
const ALLOWED_ROLES = new Set([
  'mcp_write',
  'mcp_readonly',
  'corpus_ingest_readonly',
]);

interface RoleSecret {
  username?: string;
  password?: string;
}

interface ParsedArgs {
  role: string;
  secretName: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const roleIndex = argv.indexOf('--role');
  const secretIndex = argv.indexOf('--secret-name');
  const role = roleIndex >= 0 ? argv[roleIndex + 1] : undefined;
  const secretName = secretIndex >= 0 ? argv[secretIndex + 1] : undefined;

  if (!role || !ALLOWED_ROLES.has(role)) {
    throw new Error(
      `--role must be one of: ${[...ALLOWED_ROLES].join(', ')} (got "${role ?? ''}")`,
    );
  }
  if (!secretName) {
    throw new Error(
      '--secret-name is required — the Secrets Manager secret ID or ARN backing this role ' +
        '(the same value wired into the Lambda as MCP_WRITE_SECRET_NAME / MCP_READONLY_SECRET_NAME).',
    );
  }
  return { role, secretName };
}

/**
 * Fetch the role's current Secrets Manager value and verify it actually
 * belongs to the role we're about to alter — refuses to proceed on a
 * username mismatch rather than silently setting the wrong role's password.
 */
async function fetchRoleSecret(
  role: string,
  secretName: string,
): Promise<{ password: string }> {
  LOGGER.info(`Fetching current Secrets Manager value for "${secretName}"...`);
  const raw = await retrieveSecretParameterValue(secretName);
  const secret = JSON.parse(raw) as RoleSecret;

  if (!secret.username || !secret.password) {
    throw new Error(
      `Secret "${secretName}" is missing required fields: username and password.`,
    );
  }
  if (secret.username !== role) {
    throw new Error(
      `Secret "${secretName}" is for role "${secret.username}", not "${role}" — ` +
        'wrong secret for this role. Pass the secret whose username matches --role.',
    );
  }
  return { password: secret.password };
}

/**
 * Set the Postgres role's password to `password` using the privileged
 * migration-user connection (the same role `db_migrate` uses to run DDL).
 * Both the role name and password are bound as session-scoped GUCs — never
 * interpolated into SQL text — mirroring the pattern already used by the
 * role-creation migrations (20260616_150000_add_mcp_readonly_role.ts,
 * 20260902_120100_add_mcp_write_role.ts).
 */
async function setRolePassword(
  sql: postgres.Sql,
  role: string,
  password: string,
): Promise<void> {
  await sql.unsafe(
    `SELECT set_config('resync_role.role', $1, false), set_config('resync_role.password', $2, false)`,
    [role, password],
  );
  try {
    await sql.unsafe(`
      DO $$
      DECLARE
        target_role text := current_setting('resync_role.role');
        pw text := current_setting('resync_role.password');
      BEGIN
        EXECUTE format('ALTER ROLE %I WITH PASSWORD %L', target_role, pw);
      END
      $$;
    `);
  } finally {
    await sql.unsafe(
      `SELECT set_config('resync_role.role', '', false), set_config('resync_role.password', '', false)`,
    );
  }
}

/** Reconnect AS the target role with the freshly-set password to prove the resync worked. */
async function verifyRoleLogin(
  role: string,
  password: string,
  dbConfig: {
    host: string;
    port?: number;
    database: string;
    ssl?: { ca?: Buffer; rejectUnauthorized?: boolean };
  },
): Promise<void> {
  const roleClient = postgres({
    host: dbConfig.host,
    port: dbConfig.port ?? 5432,
    database: dbConfig.database,
    username: role,
    password,
    ssl: dbConfig.ssl ?? { rejectUnauthorized: true },
    max: 1,
    prepare: false,
  });
  try {
    await roleClient`SELECT 1`;
  } finally {
    await roleClient.end();
  }
}

export async function resyncRolePassword(
  role: string,
  secretName: string,
): Promise<void> {
  const { password } = await fetchRoleSecret(role, secretName);

  LOGGER.info('Resolving migration (privileged) database credentials...');
  const dbConfig = await getMigrationDatabaseConfig();

  const migrationClient = postgres({
    host: dbConfig.host,
    port: dbConfig.port ?? 5432,
    database: dbConfig.database,
    username: dbConfig.user,
    password: dbConfig.password,
    ssl: dbConfig.ssl ?? { rejectUnauthorized: true },
    max: 1,
    prepare: false,
  });

  try {
    LOGGER.info(
      `Setting Postgres password for role "${role}" to match Secrets Manager...`,
    );
    await setRolePassword(migrationClient, role, password);
  } finally {
    await migrationClient.end();
  }

  LOGGER.info(`Verifying login as "${role}" with the new password...`);
  await verifyRoleLogin(role, password, dbConfig);

  LOGGER.info(
    `✅ Postgres role "${role}" now matches Secrets Manager, and login was verified directly.`,
  );
  LOGGER.info(
    'Next: confirm the hosted MCP tool too — call db_execute (or db_query for mcp_readonly) with a harmless statement like "SELECT 1".',
  );
}

if (require.main === module) {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    LOGGER.error(
      'Usage: tsx resync-mcp-role-password.ts --role <mcp_write|mcp_readonly> --secret-name <secret-id-or-arn>',
    );
    LOGGER.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  resyncRolePassword(args.role, args.secretName).catch((error) => {
    LOGGER.error(
      '❌ Resync failed:',
      error instanceof Error ? error : new Error(String(error)),
    );
    process.exit(1);
  });
}
