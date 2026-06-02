#!/usr/bin/env node
/**
 * scripts/rebuild-tfvars-from-aws.mjs
 *
 * Rebuild the LOCAL terraform/main/secrets.auto.tfvars baseline from the values
 * already stored in AWS (Secrets Manager + SSM Parameter Store).
 *
 * This is the *reverse* of scripts/sync-github-secrets.mjs and the AWS-sourced
 * counterpart to scripts/gen-tfvars.js (which sources from local env vars). It
 * exists so a workstation with an incomplete `.env` can reconstruct a tfvars
 * file that matches what CI actually applied — preventing a local
 * `terraform apply` from destroying/nulling resources whose secret values the
 * developer simply doesn't have locally (the classic count→0 destroy, e.g.
 * aws_secretsmanager_secret.discord_client_secret).
 *
 * INTENDED LAYERING (single merged file):
 *   1. node scripts/rebuild-tfvars-from-aws.mjs   # write the AWS baseline
 *   2. make gen-tfvars                            # overlay non-empty .env values
 * gen-tfvars is merge-aware: it preserves every value this script wrote and only
 * overrides keys where a non-empty local env var is present. So the file starts
 * as a faithful mirror of AWS and becomes a local override on top.
 *
 * AWS is read-only here — this script never writes to AWS. Values are read at
 * runtime and written straight to the gitignored tfvars file; no secret value
 * passes through a process argument or this script's stdout.
 *
 * Prerequisites:
 *   - AWS credentials with secretsmanager:GetSecretValue, ssm:GetParameter, and
 *     KMS decrypt for SecureString params (same role sync-github-secrets uses)
 *   - The terraform/main secret CONTAINERS already exist (terraform apply has run
 *     at least once); their values are populated
 *
 * Usage:
 *   node scripts/rebuild-tfvars-from-aws.mjs
 *   node scripts/rebuild-tfvars-from-aws.mjs --env prod
 *   node scripts/rebuild-tfvars-from-aws.mjs --profile my-aws-profile
 *   node scripts/rebuild-tfvars-from-aws.mjs --dry-run    # print, don't write
 *
 * Flags:
 *   --env <env>       Terraform environment prefix (default: dev)
 *   --profile <name>  AWS CLI profile to use
 *   --dry-run         Print the rendered tfvars (values redacted) without writing
 *
 * Pure/testable helpers (validateIdentifier, collectValues, renderTfvars, hcl,
 * and the mapping tables) are exported; the CLI only runs when invoked directly.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.resolve(
  __dirname,
  '..',
  'terraform',
  'main',
  'secrets.auto.tfvars',
);

// ── Mappings ──────────────────────────────────────────────────────────────────
//
// Each entry maps a terraform/main variable (tfvars key) to where its value
// lives in AWS. Secrets Manager secret names follow `${env}/<suffix>` (see
// terraform/main/secrets.tf). SSM build-time params live under
// `/legacy-sports/${env}/github-secrets/<name>` (see ssm-github-secrets.tf);
// `secure: true` means SecureString (read with --with-decryption).
//
// Keep this list in sync with terraform/main/secrets.tf. Variables NOT present
// in AWS (cloudflare_account_id, cloudflare_ai_api_token) are intentionally
// omitted — they come from the local .env overlay applied by gen-tfvars.

export const SECRETS_MANAGER = [
  { tfvar: 'rollbar_access_token', suffix: 'rollbar-access-token' },
  { tfvar: 'google_oauth_client_secret', suffix: 'google-oauth-client-secret' },
  { tfvar: 'jwt_secret_key', suffix: 'jwt-secret-key' },
  { tfvar: 'oauth_proxy_cookie_secret', suffix: 'oauth-proxy/cookie-secret' },
  { tfvar: 'stripe_secret_key', suffix: 'stripe-secret-key' },
  { tfvar: 'stripe_webhook_secret', suffix: 'stripe-webhook-secret' },
  { tfvar: 'jira_credentials', suffix: 'jira-credentials' },
  { tfvar: 'rollbar_webhook_secret', suffix: 'rollbar-webhook-secret' },
  { tfvar: 'discord_webhook_url', suffix: 'discord-webhook-url' },
  {
    tfvar: 'discord_user_signup_webhook_url',
    suffix: 'discord-user-signup-webhook-url',
  },
  { tfvar: 'discord_stripe_webhook_url', suffix: 'discord-stripe-webhook-url' },
  { tfvar: 'ga_api_secret', suffix: 'ga-api-secret' },
  // Conditional secrets — only created by terraform when the value is non-empty.
  // The count→0 destroy these gate on is exactly what this rebuild prevents.
  { tfvar: 'discord_client_secret', suffix: 'discord-client-secret' },
  { tfvar: 'mlb_data_api_key', suffix: 'mlb-data-api-key' },
];

export const SSM_GITHUB_SECRETS = [
  { tfvar: 'ga_measurement_id', param: 'ga-measurement-id', secure: false },
  {
    tfvar: 'rollbar_client_access_token',
    param: 'rollbar-client-access-token',
    secure: true,
  },
  { tfvar: 'giphy_api_key', param: 'giphy-api-key', secure: true },
];

// Ordered tfvars keys this script writes (Secrets Manager first, then SSM).
const ORDERED_KEYS = [
  ...SECRETS_MANAGER.map((m) => m.tfvar),
  ...SSM_GITHUB_SECRETS.map((m) => m.tfvar),
];

// ── Input validation ──────────────────────────────────────────────────────────
// `env` and `profile` come from CLI flags / environment and are interpolated
// into AWS resource names or passed as `aws` argv. spawnSync with an arg array
// blocks shell injection, but an unvalidated value like `foo --debug` could
// still inject an extra CLI argument. Restrict both to a conservative charset.

// No leading hyphen: a value like "--debug" would otherwise be read by `aws`
// as a flag rather than an argument value (the argument-injection vector).
export const ENV_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;
export const PROFILE_PATTERN = /^[A-Za-z0-9_.][A-Za-z0-9_.-]*$/;

/** Throw if `value` doesn't match `pattern`. Returns the value when valid. */
export function validateIdentifier(label, value, pattern) {
  if (!pattern.test(value)) {
    throw new Error(
      `Invalid ${label} "${value}": must match ${pattern} (no spaces or argument-like tokens).`,
    );
  }
  return value;
}

// ── LOGGER stub ───────────────────────────────────────────────────────────────
// Standalone .mjs invoked via `node` outside the build graph — cannot import
// @legacy-sports/logging (ships TS source only). Mirrors the LOGGER interface,
// matching scripts/sync-github-secrets.mjs and scripts/mcp-auth.mjs.

const LOGGER = {
  info: (...a) => process.stdout.write(a.join(' ') + '\n'),
  warn: (...a) => process.stderr.write('⚠️  ' + a.join(' ') + '\n'),
  error: (...a) => process.stderr.write('❌ ' + a.join(' ') + '\n'),
};

// ── AWS CLI helpers ───────────────────────────────────────────────────────────

function awsCli(profile, service, subcommand, extraArgs = []) {
  const profileArgs = profile ? ['--profile', profile] : [];
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

/**
 * Build the AWS-backed reader pair the CLI uses. Tests inject their own readers
 * into collectValues() instead, so this is never exercised under test.
 */
function makeAwsReaders(profile) {
  return {
    /** Returns the secret string, or null if the secret does not exist. */
    readSecretString(secretId) {
      try {
        const out = awsCli(profile, 'secretsmanager', 'get-secret-value', [
          '--secret-id',
          secretId,
        ]);
        return out['SecretString'] ?? null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('ResourceNotFoundException')) return null;
        throw err;
      }
    },
    /** Returns the parameter value, or null if the parameter does not exist. */
    readSsmParameter(name, decrypt = false) {
      const args = ['--name', name];
      if (decrypt) args.push('--with-decryption');
      try {
        const out = awsCli(profile, 'ssm', 'get-parameter', args);
        return out['Parameter']['Value'] ?? null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('ParameterNotFound')) return null;
        throw err;
      }
    },
  };
}

// ── Pure helpers ────────────────────────────────────────────────────────────

/** Escape a value for an HCL double-quoted string literal. */
export function hcl(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Read every mapped value via the injected `readers`. Pure given deterministic
 * readers — no direct AWS access here, which is what makes it unit-testable.
 * Returns the value map (missing → '') plus recovered/missing bookkeeping.
 */
export function collectValues(env, readers) {
  /** @type {Record<string, string>} */
  const values = {};
  const recovered = [];
  const missing = [];

  for (const { tfvar, suffix } of SECRETS_MANAGER) {
    const secretId = `${env}/${suffix}`;
    const value = readers.readSecretString(secretId);
    if (value === null || value === undefined) {
      values[tfvar] = '';
      missing.push({ tfvar, source: `secretsmanager ${secretId}` });
    } else {
      values[tfvar] = value;
      recovered.push(tfvar);
    }
  }

  for (const { tfvar, param, secure } of SSM_GITHUB_SECRETS) {
    const name = `/legacy-sports/${env}/github-secrets/${param}`;
    const value = readers.readSsmParameter(name, secure);
    if (value === null || value === undefined) {
      values[tfvar] = '';
      missing.push({ tfvar, source: `ssm ${name}` });
    } else {
      values[tfvar] = value;
      recovered.push(tfvar);
    }
  }

  return { values, recovered, missing };
}

/**
 * Render the baseline tfvars file text from a value map. Keys recovered as
 * empty are still written so the file is complete and the subsequent
 * gen-tfvars overlay has a known surface to merge onto. Pure.
 */
export function renderTfvars(env, values) {
  const lines = [
    '# =============================================================================',
    '# secrets.auto.tfvars — AWS BASELINE (auto-loaded by Terraform)',
    '# =============================================================================',
    '# Generated by: node scripts/rebuild-tfvars-from-aws.mjs',
    `# Source: AWS Secrets Manager + SSM for env "${env}". This is a faithful`,
    '# mirror of the values already deployed — apply local overrides on top with',
    '# `make gen-tfvars` (overlays non-empty .env values; preserves these).',
    '# This file is gitignored and MUST NEVER be committed.',
    '# =============================================================================',
    '',
  ];
  for (const key of ORDERED_KEYS) {
    lines.push(`${key} = ${hcl(values[key] ?? '')}`);
    lines.push('');
  }
  return lines.join('\n');
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const envIdx = argv.indexOf('--env');
  const profIdx = argv.indexOf('--profile');
  const env = validateIdentifier(
    'env',
    envIdx !== -1
      ? argv[envIdx + 1]
      : (process.env['TF_VAR_environment'] ?? 'dev'),
    ENV_PATTERN,
  );
  const profileRaw =
    profIdx !== -1
      ? argv[profIdx + 1]
      : (process.env['AWS_PROFILE'] ?? process.env['MCP_AWS_PROFILE'] ?? '');
  const profile = profileRaw
    ? validateIdentifier('profile', profileRaw, PROFILE_PATTERN)
    : undefined;
  return { env, profile, dryRun: argv.includes('--dry-run') };
}

function runCli() {
  const { env, profile, dryRun } = parseArgs(process.argv.slice(2));

  LOGGER.info(
    `\n🔄 Rebuilding terraform/main/secrets.auto.tfvars from AWS (env="${env}")${dryRun ? ' [DRY RUN]' : ''}\n`,
  );

  const readers = makeAwsReaders(profile);
  const { values, recovered, missing } = collectValues(env, readers);
  for (const tfvar of recovered) LOGGER.info(`  ✅ ${tfvar}`);
  for (const { tfvar, source } of missing)
    LOGGER.warn(`  ${tfvar}: not found — ${source} (written empty)`);

  const output = renderTfvars(env, values);

  LOGGER.info(`\n─────────────────────────────────────────────`);
  LOGGER.info(
    `${recovered.length}/${ORDERED_KEYS.length} values recovered from AWS` +
      (missing.length ? `, ${missing.length} not found (written empty)` : ''),
  );

  if (dryRun) {
    LOGGER.info('\n[DRY RUN] Rendered file (secret values redacted):\n');
    process.stdout.write(
      output.replace(/^(\w+) = ".*"$/gm, (_, k) => `${k} = "***"`) + '\n',
    );
    return;
  }

  fs.writeFileSync(OUT_FILE, output, 'utf8');
  LOGGER.info(`\n✅ Written: ${OUT_FILE}`);
  LOGGER.info(
    '   Next: run `make gen-tfvars` to overlay local .env values, then',
  );
  LOGGER.info(
    '   `terraform plan` in terraform/main — confirm only intended changes remain.',
  );
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    runCli();
  } catch (err) {
    LOGGER.error(
      'rebuild-tfvars-from-aws failed:',
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }
}
