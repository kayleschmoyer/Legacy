#!/usr/bin/env node
/**
 * scripts/sync-github-secrets.mjs  (LS-5215)
 *
 * Reads build-time environment config from AWS SSM Parameter Store and
 * Secrets Manager, then upserts each value as a GitHub repository secret.
 * AWS is the source of truth — running this script after a `terraform apply`
 * propagates any changed values to GitHub CI without touching the GitHub UI.
 *
 * SSM parameters (under /legacy-sports/<env>/github-secrets/) are declared in
 * terraform/main/ssm-github-secrets.tf and derive their values from Terraform
 * variables, so URLs stay in sync with the infrastructure automatically.
 *
 * Prerequisites:
 *   - AWS credentials with ssm:GetParameter + ssm:GetParametersByPath (and KMS
 *     decrypt permission for SecureString params) + secretsmanager:GetSecretValue
 *   - `gh` CLI installed and authenticated (`gh auth status`)
 *   - SSM parameters populated (run `terraform apply` in terraform/main first)
 *
 * Usage:
 *   node scripts/sync-github-secrets.mjs
 *   node scripts/sync-github-secrets.mjs --env prod
 *   node scripts/sync-github-secrets.mjs --dry-run
 *   node scripts/sync-github-secrets.mjs --profile my-aws-profile
 *   node scripts/sync-github-secrets.mjs --repo owner/repo
 *
 * Flags:
 *   --env <env>       Terraform environment prefix (default: dev)
 *   --profile <name>  AWS CLI profile to use
 *   --dry-run         Print what would be set without writing to GitHub
 *   --repo <r>        GitHub repo (default: auto-detected from `gh repo view`)
 */

import { spawnSync } from 'node:child_process';

// ── CLI flags ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

const ENV = (() => {
  const i = argv.indexOf('--env');
  return i !== -1 ? argv[i + 1] : (process.env['TF_VAR_environment'] ?? 'dev');
})();

const PROFILE = (() => {
  const i = argv.indexOf('--profile');
  return i !== -1
    ? argv[i + 1]
    : (process.env['AWS_PROFILE'] ??
        process.env['MCP_AWS_PROFILE'] ??
        undefined);
})();

const REPO_OVERRIDE = (() => {
  const i = argv.indexOf('--repo');
  return i !== -1 ? argv[i + 1] : undefined;
})();

const DRY_RUN = argv.includes('--dry-run');

// ── Mappings ──────────────────────────────────────────────────────────────────
//
// SSM parameters declared in terraform/main/ssm-github-secrets.tf.
// `secure: true` means the parameter is a SecureString — read with --with-decryption.
// The `github` field is the exact GitHub Actions secret name.

const SSM_PREFIX = `/legacy-sports/${ENV}/github-secrets`;

const SSM_MAPPINGS = [
  { ssm: 'graphql-host', github: 'GRAPHQL_HOST' },
  { ssm: 'oauth-proxy-url', github: 'OAUTH_PROXY_URL' },
  { ssm: 'websocket-url', github: 'WEBSOCKET_URL' },
  { ssm: 'google-client-id', github: 'GOOGLE_CLIENT_ID' },
  { ssm: 'discord-client-id', github: 'DISCORD_CLIENT_ID' },
  { ssm: 'ga-measurement-id', github: 'GA_MEASUREMENT_ID' },
  { ssm: 'stripe-monthly-price-id', github: 'STRIPE_MONTHLY_PRICE_ID' },
  { ssm: 'stripe-annual-price-id', github: 'STRIPE_ANNUAL_PRICE_ID' },
  { ssm: 'giphy-api-key', github: 'GIPHY_API_KEY', secure: true },
  {
    ssm: 'rollbar-client-access-token',
    github: 'ROLLBAR_CLIENT_ACCESS_TOKEN',
    secure: true,
  },
];

// Secrets Manager values already managed by Terraform in secrets.tf.
// These are synced here so GitHub CI is always consistent with the AWS value.
const SECRETS_MANAGER_MAPPINGS = [
  { secret: `${ENV}/rollbar-access-token`, github: 'ROLLBAR_ACCESS_TOKEN' },
];

// ── LOGGER stub ───────────────────────────────────────────────────────────────
// Local LOGGER stub. The project rule (AGENTS.md) is to use LOGGER from
// @legacy-sports/logging, but this is a standalone `.mjs` script invoked via
// `node scripts/sync-github-secrets.mjs` outside of any build pipeline — it
// cannot import workspace packages because @legacy-sports/logging ships only
// TypeScript source ("main": "./src/index.ts") with no compiled output, and
// plain `node` cannot execute .ts files. This stub mirrors the
// LOGGER.{info,warn,error} interface for consistency. See the identical
// pattern + comment in scripts/mcp-auth.mjs.

const LOGGER = {
  info: (...a) => process.stdout.write(a.join(' ') + '\n'),
  warn: (...a) => process.stderr.write('⚠️  ' + a.join(' ') + '\n'),
  error: (...a) => process.stderr.write('❌ ' + a.join(' ') + '\n'),
};

// ── AWS CLI helpers ───────────────────────────────────────────────────────────

function awsCli(service, subcommand, extraArgs = []) {
  const profileArgs = PROFILE ? ['--profile', PROFILE] : [];
  const result = spawnSync(
    'aws',
    [service, subcommand, ...extraArgs, ...profileArgs, '--output', 'json'],
    { encoding: 'utf8', env: { ...process.env } },
  );
  if (result.error)
    throw new Error(`Failed to spawn aws: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `aws ${service} ${subcommand} failed (exit ${result.status}):\n${result.stderr.trim()}`,
    );
  }
  return JSON.parse(result.stdout);
}

function readSsmParameter(name, decrypt = false) {
  const args = ['--name', name];
  if (decrypt) args.push('--with-decryption');
  try {
    const out = awsCli('ssm', 'get-parameter', args);
    return out['Parameter']['Value'] ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // ParameterNotFound is expected when terraform hasn't applied yet
    if (msg.includes('ParameterNotFound')) return null;
    throw err;
  }
}

function readSecretString(secretId) {
  try {
    const out = awsCli('secretsmanager', 'get-secret-value', [
      '--secret-id',
      secretId,
    ]);
    return out['SecretString'] ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ResourceNotFoundException')) return null;
    throw err;
  }
}

// ── GitHub helpers ────────────────────────────────────────────────────────────

function detectRepo() {
  const result = spawnSync(
    'gh',
    ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(
      'Could not detect GitHub repo. Run `gh auth login` or pass --repo owner/repo.',
    );
  }
  return result.stdout.trim();
}

function setGithubSecret(secretName, value, repo) {
  if (DRY_RUN) {
    LOGGER.info(`  [dry-run] Would set ${secretName} (${value.length} chars)`);
    return;
  }
  // Pass value via stdin to avoid it appearing in the process argument list
  const result = spawnSync(
    'gh',
    ['secret', 'set', secretName, '--repo', repo],
    { input: value, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `gh secret set ${secretName} failed (exit ${result.status}):\n${result.stderr.trim()}`,
    );
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const repo = REPO_OVERRIDE ?? detectRepo();
  LOGGER.info(
    `\n🔄 Syncing GitHub secrets for env="${ENV}" → repo=${repo}${DRY_RUN ? ' [DRY RUN]' : ''}\n`,
  );

  const results = { synced: [], skipped: [], failed: [] };

  // ── SSM parameters ──────────────────────────────────────────────────────────
  LOGGER.info('Reading SSM parameters…');
  for (const { ssm, github, secure } of SSM_MAPPINGS) {
    const paramPath = `${SSM_PREFIX}/${ssm}`;
    let value;
    try {
      value = readSsmParameter(paramPath, secure ?? false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      LOGGER.error(`  ${github}: failed to read SSM ${paramPath}\n    ${msg}`);
      results.failed.push({ name: github, reason: msg });
      continue;
    }

    if (value === null) {
      LOGGER.warn(`  ${github}: SSM parameter not found — ${paramPath}`);
      LOGGER.warn(`    Run 'terraform apply' in terraform/main to create it.`);
      results.skipped.push({ name: github, reason: 'SSM parameter not found' });
      continue;
    }

    try {
      setGithubSecret(github, value, repo);
      if (!DRY_RUN) LOGGER.info(`  ✅ ${github}`);
      results.synced.push(github);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      LOGGER.error(`  ${github}: failed to set GitHub secret\n    ${msg}`);
      results.failed.push({ name: github, reason: msg });
    }
  }

  // ── Secrets Manager ─────────────────────────────────────────────────────────
  LOGGER.info('\nReading Secrets Manager…');
  for (const { secret, github } of SECRETS_MANAGER_MAPPINGS) {
    let value;
    try {
      value = readSecretString(secret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      LOGGER.error(`  ${github}: failed to read secret ${secret}\n    ${msg}`);
      results.failed.push({ name: github, reason: msg });
      continue;
    }

    if (value === null) {
      LOGGER.warn(`  ${github}: Secrets Manager secret not found — ${secret}`);
      results.skipped.push({ name: github, reason: 'secret not found' });
      continue;
    }

    try {
      setGithubSecret(github, value, repo);
      if (!DRY_RUN) LOGGER.info(`  ✅ ${github}`);
      results.synced.push(github);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      LOGGER.error(`  ${github}: failed to set GitHub secret\n    ${msg}`);
      results.failed.push({ name: github, reason: msg });
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const total = SSM_MAPPINGS.length + SECRETS_MANAGER_MAPPINGS.length;
  LOGGER.info(`\n─────────────────────────────────────────────`);
  LOGGER.info(
    `${DRY_RUN ? '[DRY RUN] ' : ''}${results.synced.length}/${total} secrets synced` +
      (results.skipped.length ? `, ${results.skipped.length} skipped` : '') +
      (results.failed.length ? `, ${results.failed.length} failed` : ''),
  );

  if (results.skipped.length > 0) {
    LOGGER.warn('\nSkipped (SSM parameter or secret not yet populated):');
    for (const { name, reason } of results.skipped) {
      LOGGER.warn(`  ${name}: ${reason}`);
    }
    LOGGER.warn(
      '\nPopulate missing SSM params by running terraform apply, then re-run this script.',
    );
  }

  if (results.failed.length > 0) {
    LOGGER.error('\nFailed:');
    for (const { name, reason } of results.failed) {
      LOGGER.error(`  ${name}: ${reason}`);
    }
    process.exit(1);
  }

  if (!DRY_RUN && results.synced.length > 0) {
    LOGGER.info(
      '\n✅ Done. New secrets are live in GitHub Actions immediately.',
    );
    LOGGER.info(
      '   Old VITE_* / EXPO_PUBLIC_* secrets can be deleted from GitHub once CI confirms the new names work.',
    );
  }
}

main().catch((err) => {
  LOGGER.error(
    'sync-github-secrets failed:',
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
