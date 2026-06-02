/**
 * Tests for the parse + merge logic in scripts/gen-tfvars.js (LS-5975).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/gen-tfvars.test.mjs
 *
 * gen-tfvars overlays local env vars on top of an existing baseline (typically
 * the AWS mirror written by scripts/rebuild-tfvars-from-aws.mjs). The merge is
 * correctness-critical: a regression that blanks a baseline value can flip a
 * count-gated Terraform resource to count=0 and destroy a live Secrets Manager
 * secret (the discord_client_secret case this PR fixes). These tests pin the
 * parsing, the env-vs-baseline precedence, and the preserve-unmanaged-keys
 * behavior so that can't silently regress.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { parseTfvarsText, pick, buildTfvars } = require(
  resolve(__dirname, '..', 'gen-tfvars.js'),
);

// --- parseTfvarsText -------------------------------------------------------

test('parseTfvarsText: empty input yields empty map', () => {
  assert.deepEqual(parseTfvarsText(''), {});
});

test('parseTfvarsText: ignores comments, blanks, and unquoted/malformed lines', () => {
  const text = [
    '# a comment',
    '',
    '   ',
    'bare_key = not_quoted',
    'jwt_secret_key = "abc123"',
    '  oauth_proxy_cookie_secret = "spaced"  ',
    '= "no key"',
    'has spaces = "x"',
  ].join('\n');
  assert.deepEqual(parseTfvarsText(text), {
    jwt_secret_key: 'abc123',
    oauth_proxy_cookie_secret: 'spaced',
  });
});

test('parseTfvarsText: round-trips escaped quotes and backslashes', () => {
  // Mirrors how hcl() renders a JSON blob: " -> \" and \ -> \\
  const text =
    'jira_credentials = "{\\"client_id\\":\\"x\\",\\"path\\":\\"a\\\\b\\"}"';
  const parsed = parseTfvarsText(text);
  assert.equal(parsed.jira_credentials, '{"client_id":"x","path":"a\\b"}');
});

// --- pick (env-vs-baseline precedence) -------------------------------------

test('pick: non-empty env value wins over baseline', () => {
  assert.equal(pick({ k: 'BASE' }, 'k', 'ENV'), 'ENV');
});

test('pick: falls back to baseline when env value is empty', () => {
  assert.equal(pick({ k: 'BASE' }, 'k', ''), 'BASE');
});

test('pick: empty string when neither env nor baseline present', () => {
  assert.equal(pick({}, 'k', ''), '');
});

// --- buildTfvars (full merge) ----------------------------------------------

/** Parse buildTfvars output back into a map for assertions. */
function build(existing, envObj) {
  const result = buildTfvars(existing, envObj);
  return { ...result, map: parseTfvarsText(result.output) };
}

test('buildTfvars: env overrides baseline; baseline preserved where env is empty', () => {
  const existing = {
    jwt_secret_key: 'BASE_JWT',
    discord_client_secret: 'BASE_DISCORD',
    stripe_secret_key: 'BASE_STRIPE',
  };
  const envObj = { STRIPE_SECRET_KEY: 'ENV_STRIPE' };
  const { map } = build(existing, envObj);

  assert.equal(map.stripe_secret_key, 'ENV_STRIPE', 'env should win');
  assert.equal(map.jwt_secret_key, 'BASE_JWT', 'baseline preserved (no env)');
  assert.equal(
    map.discord_client_secret,
    'BASE_DISCORD',
    'discord_client_secret preserved from baseline — must not blank out',
  );
});

test('buildTfvars: discord_client_secret managed by env when set', () => {
  const { map } = build({}, { DISCORD_CLIENT_SECRET: 'ENV_DISCORD' });
  assert.equal(map.discord_client_secret, 'ENV_DISCORD');
});

test('buildTfvars: preserves unmanaged baseline keys (e.g. SSM-recovered ones)', () => {
  const existing = {
    ga_measurement_id: 'G-123',
    rollbar_client_access_token: 'rb-client',
    giphy_api_key: 'giphy-key',
  };
  const result = buildTfvars(existing, {});
  assert.deepEqual(
    result.preserved.sort(),
    [
      'ga_measurement_id',
      'giphy_api_key',
      'rollbar_client_access_token',
    ].sort(),
  );
  const map = parseTfvarsText(result.output);
  assert.equal(map.ga_measurement_id, 'G-123');
  assert.equal(map.rollbar_client_access_token, 'rb-client');
  assert.equal(map.giphy_api_key, 'giphy-key');
});

test('buildTfvars: required var satisfied by baseline is not reported missing', () => {
  const existing = {
    google_oauth_client_secret: 'BASE',
    jwt_secret_key: 'BASE',
    oauth_proxy_cookie_secret: 'BASE',
    jira_credentials: 'BASE',
    rollbar_access_token: 'BASE',
    stripe_secret_key: 'BASE',
    stripe_webhook_secret: 'BASE',
  };
  const { missing } = buildTfvars(existing, {});
  assert.equal(
    missing.length,
    0,
    'baseline-provided required vars count as set',
  );
});

test('buildTfvars: reports required vars missing from both env and baseline', () => {
  const { missing } = buildTfvars({}, {});
  const keys = missing.map(([k]) => k);
  assert.ok(keys.includes('google_oauth_client_secret'));
  assert.ok(keys.includes('jira_credentials'));
});

test('buildTfvars: jira_credentials assembled from component env vars', () => {
  const { map } = build(
    {},
    {
      JIRA_CLIENT_ID: 'cid',
      JIRA_CLIENT_SECRET: 'csec',
      JIRA_CLOUD_ID: 'cloud',
      JIRA_SITE_URL: 'https://example.atlassian.net',
    },
  );
  assert.deepEqual(JSON.parse(map.jira_credentials), {
    client_id: 'cid',
    client_secret: 'csec',
    cloud_id: 'cloud',
    site_url: 'https://example.atlassian.net',
  });
});
