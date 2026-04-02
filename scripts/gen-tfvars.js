#!/usr/bin/env node
/**
 * gen-tfvars.js — Generate terraform/secrets.auto.tfvars from environment variables.
 *
 * Reads well-known env vars (and common aliases) and writes the tfvars file that
 * Terraform auto-loads for local development. In CI, these are supplied as
 * TF_VAR_* env vars from GitHub Actions secrets instead.
 *
 * Usage:
 *   node scripts/gen-tfvars.js              # write terraform/secrets.auto.tfvars
 *   node scripts/gen-tfvars.js --check      # report what's missing, don't write
 *   node scripts/gen-tfvars.js --dry-run    # print output without writing
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(REPO_ROOT, 'terraform', 'secrets.auto.tfvars');

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');
const DRY_RUN = args.includes('--dry-run');

/** Resolve the first non-empty value from a list of env var names. */
function env(...names) {
  for (const name of names) {
    const val = process.env[name];
    if (val && val.trim()) return val.trim();
  }
  return '';
}

// ---------------------------------------------------------------------------
// Variable resolution
// ---------------------------------------------------------------------------

const googleOauthClientSecret = env('GOOGLE_OAUTH_CLIENT_SECRET');
const jwtSecretKey = env('JWT_SECRET_KEY', 'JWT_SECRET');
const oauthProxyCookieSecret = env(
  'OAUTH_PROXY_COOKIE_SECRET',
  'COOKIE_SECRET',
);
const rollbarAccessToken = env('ROLLBAR_ACCESS_TOKEN');
const rollbarWebhookSecret = env(
  'ROLLBAR_WEBHOOK_SECRET',
  'TF_VAR_ROLLBAR_WEBHOOK_SECRET',
);
const stripeSecretKey = env('STRIPE_SECRET_KEY');
const stripeWebhookSecret = env('STRIPE_WEBHOOK_SECRET');
const discordWebhookUrl = env('DISCORD_WEBHOOK_URL');
const discordUserSignupWebhookUrl = env('DISCORD_USER_SIGNUP_WEBHOOK_URL');
const discordStripeWebhookUrl = env('DISCORD_STRIPE_WEBHOOK_URL');
const mlbDataApiKey = env('MLB_DATA_API_KEY');
const cloudflareAccountId = env('CLOUDFLARE_ACCOUNT_ID');
const cloudflareAiApiToken = env('CLOUDFLARE_AI_API_TOKEN');

// jira_credentials: accept a pre-built JSON blob or assemble from components
let jiraCredentials = env('JIRA_CREDENTIALS');
if (!jiraCredentials) {
  const clientId = env('JIRA_CLIENT_ID');
  const clientSecret = env('JIRA_CLIENT_SECRET');
  const cloudId = env('JIRA_CLOUD_ID');
  const siteUrl =
    env('JIRA_SITE_URL', 'JIRA_BASE_URL') || 'https://bkrupa.atlassian.net';
  if (clientId && clientSecret && cloudId) {
    jiraCredentials = JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      cloud_id: cloudId,
      site_url: siteUrl,
    });
  }
}

// ---------------------------------------------------------------------------
// Missing-var report
// ---------------------------------------------------------------------------

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
  ['cloudflare_ai_api_token', cloudflareAiApiToken, 'CLOUDFLARE_AI_API_TOKEN'],
];

const missing = REQUIRED.filter(([, v]) => !v).map(([k, , e]) => [k, e]);
const empty = OPTIONAL.filter(([, v]) => !v).map(([k, , e]) => [k, e]);

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

// ---------------------------------------------------------------------------
// Render tfvars
// ---------------------------------------------------------------------------

/** Escape a value for HCL string literal. */
function hcl(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

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

const output = lines.join('\n');

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
