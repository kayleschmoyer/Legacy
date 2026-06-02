#!/usr/bin/env node
/**
 * gen-tfvars.js — Generate/overlay terraform/main/secrets.auto.tfvars.
 *
 * Reads well-known env vars (and common aliases) and writes the tfvars file that
 * Terraform auto-loads for local development. In CI, these are supplied as
 * TF_VAR_* env vars from GitHub Actions secrets instead.
 *
 * MERGE-AWARE OVERLAY: this script overlays local env vars ON TOP OF whatever is
 * already in secrets.auto.tfvars — typically the AWS baseline written by
 * scripts/rebuild-tfvars-from-aws.mjs. Non-empty env vars win; otherwise the
 * existing baseline value is preserved (`env || baseline || ''`). So
 * "rebuild from AWS, then apply .env overrides" stays a single coherent file,
 * and a partial local .env can no longer blank out a baseline-recovered value.
 *
 * In particular, `discord_client_secret` is now BOTH managed here (a non-empty
 * DISCORD_CLIENT_SECRET overrides it) AND preserved from the baseline when the
 * env var is unset — previously it was emitted by neither this script nor a
 * partial .env, so a local apply saw count→0 and destroyed the live Secrets
 * Manager secret. Keeping a value here keeps count=1 and the secret intact.
 *
 * As of LS-2425 the terraform configuration is split into terraform/main/ and
 * terraform/runners/. This script writes only main/'s secrets file. The runner-
 * specific secrets (github_app_id, github_app_key_base64, github_app_webhook_secret)
 * live in terraform/runners/secrets.auto.tfvars and must be set manually.
 *
 * Usage:
 *   node scripts/gen-tfvars.js              # write terraform/main/secrets.auto.tfvars
 *   node scripts/gen-tfvars.js --check      # report what's missing, don't write
 *   node scripts/gen-tfvars.js --dry-run    # print output without writing
 *
 * Pure helpers (parseTfvarsText, parseExistingTfvars, pick, buildTfvars) are
 * exported for unit testing; the CLI only runs when invoked directly.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(
  REPO_ROOT,
  'terraform',
  'main',
  'secrets.auto.tfvars',
);

// ---------------------------------------------------------------------------
// Pure helpers (exported, unit-tested)
// ---------------------------------------------------------------------------

/** Resolve the first non-empty value from a list of env var names. */
function envFrom(source, names) {
  for (const name of names) {
    const val = source[name];
    if (val && val.trim()) return val.trim();
  }
  return '';
}

/**
 * Parse tfvars text into a { key: value } map (best-effort). Only matches
 * `key = "double-quoted-scalar"` lines; comments, blanks, and any other syntax
 * are ignored. Unescapes `\"` and `\\` so values round-trip through hcl().
 */
function parseTfvarsText(text) {
  /** @type {Record<string, string>} */
  const map = {};
  const re = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/;
  for (const line of text.split('\n')) {
    const m = line.match(re);
    if (m) map[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return map;
}

/** Parse an existing tfvars file; returns {} if the file does not exist. */
function parseExistingTfvars(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return {}; // no baseline yet — behaves like a fresh generation
  }
  return parseTfvarsText(text);
}

/** env value if non-empty, else the baseline value already in the file. */
function pick(existing, key, envValue) {
  return envValue || existing[key] || '';
}

/** Escape a value for an HCL double-quoted string literal. */
function hcl(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Resolve every managed variable from `envObj` overlaid on the `existing`
 * baseline, returning the rendered tfvars text, the required/optional emptiness
 * reports, and the preserved (unmanaged baseline) keys. Pure: no I/O, no
 * reads of the ambient process.env.
 */
function buildTfvars(existing, envObj) {
  const e = (...names) => envFrom(envObj, names);
  const p = (key, envValue) => pick(existing, key, envValue);

  const googleOauthClientSecret = p(
    'google_oauth_client_secret',
    e('GOOGLE_OAUTH_CLIENT_SECRET'),
  );
  const jwtSecretKey = p('jwt_secret_key', e('JWT_SECRET_KEY', 'JWT_SECRET'));
  const oauthProxyCookieSecret = p(
    'oauth_proxy_cookie_secret',
    e('OAUTH_PROXY_COOKIE_SECRET', 'COOKIE_SECRET'),
  );
  const rollbarAccessToken = p(
    'rollbar_access_token',
    e('ROLLBAR_ACCESS_TOKEN'),
  );
  const rollbarWebhookSecret = p(
    'rollbar_webhook_secret',
    e('ROLLBAR_WEBHOOK_SECRET', 'TF_VAR_ROLLBAR_WEBHOOK_SECRET'),
  );
  const stripeSecretKey = p('stripe_secret_key', e('STRIPE_SECRET_KEY'));
  const stripeWebhookSecret = p(
    'stripe_webhook_secret',
    e('STRIPE_WEBHOOK_SECRET'),
  );
  const discordClientSecret = p(
    'discord_client_secret',
    e('DISCORD_CLIENT_SECRET'),
  );
  const discordWebhookUrl = p('discord_webhook_url', e('DISCORD_WEBHOOK_URL'));
  const discordUserSignupWebhookUrl = p(
    'discord_user_signup_webhook_url',
    e('DISCORD_USER_SIGNUP_WEBHOOK_URL'),
  );
  const discordStripeWebhookUrl = p(
    'discord_stripe_webhook_url',
    e('DISCORD_STRIPE_WEBHOOK_URL'),
  );
  const mlbDataApiKey = p('mlb_data_api_key', e('MLB_DATA_API_KEY'));
  const cloudflareAccountId = p(
    'cloudflare_account_id',
    e('CLOUDFLARE_ACCOUNT_ID'),
  );
  const cloudflareAiApiToken = p(
    'cloudflare_ai_api_token',
    e('CLOUDFLARE_AI_API_TOKEN'),
  );

  // jira_credentials: accept a pre-built JSON blob or assemble from components,
  // then fall back to the AWS baseline if neither produced a value.
  let jiraCredentials = e('JIRA_CREDENTIALS');
  if (!jiraCredentials) {
    const clientId = e('JIRA_CLIENT_ID');
    const clientSecret = e('JIRA_CLIENT_SECRET');
    const cloudId = e('JIRA_CLOUD_ID');
    const siteUrl =
      e('JIRA_SITE_URL', 'JIRA_BASE_URL') || 'https://bkrupa.atlassian.net';
    if (clientId && clientSecret && cloudId) {
      jiraCredentials = JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        cloud_id: cloudId,
        site_url: siteUrl,
      });
    }
  }
  jiraCredentials = p('jira_credentials', jiraCredentials);

  // [tfvars_key, value, env_vars_checked]
  const REQUIRED = [
    [
      'google_oauth_client_secret',
      googleOauthClientSecret,
      'GOOGLE_OAUTH_CLIENT_SECRET',
    ],
    ['jwt_secret_key', jwtSecretKey, 'JWT_SECRET_KEY / JWT_SECRET'],
    [
      'oauth_proxy_cookie_secret',
      oauthProxyCookieSecret,
      'OAUTH_PROXY_COOKIE_SECRET / COOKIE_SECRET',
    ],
    [
      'jira_credentials',
      jiraCredentials,
      'JIRA_CREDENTIALS (or JIRA_CLIENT_ID + JIRA_CLIENT_SECRET + JIRA_CLOUD_ID)',
    ],
    ['rollbar_access_token', rollbarAccessToken, 'ROLLBAR_ACCESS_TOKEN'],
    ['stripe_secret_key', stripeSecretKey, 'STRIPE_SECRET_KEY'],
    ['stripe_webhook_secret', stripeWebhookSecret, 'STRIPE_WEBHOOK_SECRET'],
  ];

  const OPTIONAL = [
    [
      'rollbar_webhook_secret',
      rollbarWebhookSecret,
      'ROLLBAR_WEBHOOK_SECRET / TF_VAR_ROLLBAR_WEBHOOK_SECRET',
    ],
    ['discord_client_secret', discordClientSecret, 'DISCORD_CLIENT_SECRET'],
    ['discord_webhook_url', discordWebhookUrl, 'DISCORD_WEBHOOK_URL'],
    [
      'discord_user_signup_webhook_url',
      discordUserSignupWebhookUrl,
      'DISCORD_USER_SIGNUP_WEBHOOK_URL',
    ],
    [
      'discord_stripe_webhook_url',
      discordStripeWebhookUrl,
      'DISCORD_STRIPE_WEBHOOK_URL',
    ],
    ['mlb_data_api_key', mlbDataApiKey, 'MLB_DATA_API_KEY'],
    ['cloudflare_account_id', cloudflareAccountId, 'CLOUDFLARE_ACCOUNT_ID'],
    [
      'cloudflare_ai_api_token',
      cloudflareAiApiToken,
      'CLOUDFLARE_AI_API_TOKEN',
    ],
  ];

  const missing = REQUIRED.filter(([, v]) => !v).map(([k, , en]) => [k, en]);
  const empty = OPTIONAL.filter(([, v]) => !v).map(([k, , en]) => [k, en]);

  const lines = [
    '# =============================================================================',
    '# secrets.auto.tfvars — LOCAL DEV SECRETS (auto-loaded by Terraform)',
    '# =============================================================================',
    '# Generated by: node scripts/gen-tfvars.js',
    '# This file is gitignored and MUST NEVER be committed.',
    '# In CI these are supplied as TF_VAR_* from GitHub Actions secrets.',
    '# Re-run `make gen-tfvars` to refresh after changing env vars.',
    '# =============================================================================',
    '',
    `google_oauth_client_secret = ${hcl(googleOauthClientSecret)}`,
    '',
    `jwt_secret_key = ${hcl(jwtSecretKey)}`,
    '',
    `oauth_proxy_cookie_secret = ${hcl(oauthProxyCookieSecret)}`,
    '',
    `jira_credentials = ${hcl(jiraCredentials)}`,
    '',
    `rollbar_access_token = ${hcl(rollbarAccessToken)}`,
    '',
    `rollbar_webhook_secret = ${hcl(rollbarWebhookSecret)}`,
    '',
    `stripe_secret_key = ${hcl(stripeSecretKey)}`,
    '',
    `stripe_webhook_secret = ${hcl(stripeWebhookSecret)}`,
    '',
    `discord_client_secret = ${hcl(discordClientSecret)}`,
    '',
    `discord_webhook_url = ${hcl(discordWebhookUrl)}`,
    '',
    `discord_user_signup_webhook_url = ${hcl(discordUserSignupWebhookUrl)}`,
    '',
    `discord_stripe_webhook_url = ${hcl(discordStripeWebhookUrl)}`,
    '',
    `mlb_data_api_key = ${hcl(mlbDataApiKey)}`,
    '',
    `cloudflare_account_id = ${hcl(cloudflareAccountId)}`,
    '',
    `cloudflare_ai_api_token = ${hcl(cloudflareAiApiToken)}`,
    '',
  ];

  // Preserve any baseline keys this script does not manage (e.g. the
  // SSM-recovered ga_measurement_id / rollbar_client_access_token /
  // giphy_api_key written by scripts/rebuild-tfvars-from-aws.mjs), so the
  // overlay never drops them.
  const managedKeys = new Set(
    lines
      .map((l) => l.match(/^([A-Za-z_][A-Za-z0-9_]*) =/))
      .filter(Boolean)
      .map((m) => m[1]),
  );
  const preserved = Object.keys(existing).filter((k) => !managedKeys.has(k));
  if (preserved.length > 0) {
    lines.push('# ── Preserved from baseline (not managed by gen-tfvars) ──');
    for (const k of preserved) {
      lines.push(`${k} = ${hcl(existing[k])}`);
      lines.push('');
    }
  }

  return { output: lines.join('\n'), missing, empty, preserved };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function runCli() {
  const args = process.argv.slice(2);
  const CHECK_ONLY = args.includes('--check');
  const DRY_RUN = args.includes('--dry-run');

  const existing = parseExistingTfvars(OUT_FILE);
  const { output, missing, empty } = buildTfvars(existing, process.env);

  if (missing.length > 0) {
    console.error('✗ Missing required env vars:');
    for (const [, e] of missing) console.error(`    ${e}`);
  }
  if (empty.length > 0) {
    console.warn(
      '⚠ Optional env vars not set (will be written as empty string):',
    );
    for (const [, e] of empty) console.warn(`    ${e}`);
  }

  if (CHECK_ONLY) {
    if (missing.length > 0) process.exit(1);
    console.log('✓ All required variables are set.');
    process.exit(0);
  }

  if (missing.length > 0 && !DRY_RUN) {
    console.error(
      '\nAborting — required variables are missing. Set them or use --dry-run.',
    );
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log(output);
    process.exit(0);
  }

  fs.writeFileSync(OUT_FILE, output, 'utf8');
  console.log(`✓ Written: ${OUT_FILE}`);
  if (empty.length > 0) {
    console.log(
      `  (${empty.length} optional vars left empty — fill them in manually if needed)`,
    );
  }
}

module.exports = {
  parseTfvarsText,
  parseExistingTfvars,
  pick,
  buildTfvars,
  OUT_FILE,
};

if (require.main === module) {
  runCli();
}
