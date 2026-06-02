/**
 * Tests for scripts/rebuild-tfvars-from-aws.mjs (LS-5975).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/rebuild-tfvars-from-aws.test.mjs
 *
 * The script reconstructs secrets.auto.tfvars from AWS. AWS access is injected
 * (collectValues takes a readers pair), so these tests exercise the secret-id /
 * parameter-name construction, the recovered/missing bookkeeping, the render
 * round-trip, and the env/profile input validation that guards `aws` argv from
 * argument injection — all without touching AWS.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  SECRETS_MANAGER,
  SSM_GITHUB_SECRETS,
  collectValues,
  renderTfvars,
  hcl,
  validateIdentifier,
  ENV_PATTERN,
  PROFILE_PATTERN,
} from '../rebuild-tfvars-from-aws.mjs';

/** Reader spy that records every id/name requested and returns from a table. */
function makeReaders(secretTable = {}, paramTable = {}) {
  const calls = { secrets: [], params: [] };
  return {
    calls,
    readSecretString(secretId) {
      calls.secrets.push(secretId);
      return secretId in secretTable ? secretTable[secretId] : null;
    },
    readSsmParameter(name, decrypt) {
      calls.params.push({ name, decrypt });
      return name in paramTable ? paramTable[name] : null;
    },
  };
}

test('collectValues: constructs ${env}/<suffix> secret ids and recovers values', () => {
  const readers = makeReaders({
    'dev/discord-client-secret': 'discord-secret-val',
    'dev/jwt-secret-key': 'jwt-val',
  });
  const { values, recovered } = collectValues('dev', readers);

  assert.ok(readers.calls.secrets.includes('dev/discord-client-secret'));
  assert.ok(readers.calls.secrets.includes('dev/oauth-proxy/cookie-secret'));
  assert.equal(values.discord_client_secret, 'discord-secret-val');
  assert.equal(values.jwt_secret_key, 'jwt-val');
  assert.ok(recovered.includes('discord_client_secret'));
});

test('collectValues: constructs the SSM github-secrets parameter paths with decrypt flag', () => {
  const readers = makeReaders(
    {},
    {
      '/legacy-sports/dev/github-secrets/giphy-api-key': 'giphy-val',
      '/legacy-sports/dev/github-secrets/ga-measurement-id': 'G-1',
    },
  );
  const { values } = collectValues('dev', readers);

  const giphy = readers.calls.params.find((c) =>
    c.name.endsWith('/giphy-api-key'),
  );
  const ga = readers.calls.params.find((c) =>
    c.name.endsWith('/ga-measurement-id'),
  );
  assert.equal(giphy.decrypt, true, 'SecureString param read with decryption');
  assert.equal(ga.decrypt, false, 'String param read without decryption');
  assert.equal(values.giphy_api_key, 'giphy-val');
  assert.equal(values.ga_measurement_id, 'G-1');
});

test('collectValues: honors a non-dev env prefix', () => {
  const readers = makeReaders();
  collectValues('prod', readers);
  assert.ok(readers.calls.secrets.every((s) => s.startsWith('prod/')));
  assert.ok(
    readers.calls.params.every((p) =>
      p.name.startsWith('/legacy-sports/prod/github-secrets/'),
    ),
  );
});

test('collectValues: missing values are recorded and written empty', () => {
  const { values, missing } = collectValues('dev', makeReaders());
  // Nothing in the tables → everything missing.
  assert.equal(
    missing.length,
    SECRETS_MANAGER.length + SSM_GITHUB_SECRETS.length,
  );
  assert.equal(values.discord_client_secret, '');
  assert.equal(values.giphy_api_key, '');
});

test('renderTfvars: round-trips recovered values and writes all mapped keys', () => {
  const readers = makeReaders({ 'dev/jira-credentials': '{"client_id":"x"}' });
  const { values } = collectValues('dev', readers);
  const text = renderTfvars('dev', values);

  // jira_credentials JSON survives hcl() escaping round-trip.
  assert.match(text, /jira_credentials = "\{\\"client_id\\":\\"x\\"\}"/);
  // Every mapped key is present in the output.
  for (const { tfvar } of [...SECRETS_MANAGER, ...SSM_GITHUB_SECRETS]) {
    assert.match(text, new RegExp(`^${tfvar} = `, 'm'), `${tfvar} written`);
  }
});

test('hcl: escapes backslashes and quotes', () => {
  assert.equal(hcl('a"b'), '"a\\"b"');
  assert.equal(hcl('a\\b'), '"a\\\\b"');
});

// --- input validation (argument-injection guard) ---------------------------

test('validateIdentifier: accepts safe env/profile values', () => {
  assert.equal(validateIdentifier('env', 'dev', ENV_PATTERN), 'dev');
  assert.equal(validateIdentifier('env', 'prod-2', ENV_PATTERN), 'prod-2');
  assert.equal(
    validateIdentifier('profile', 'my.aws_profile-1', PROFILE_PATTERN),
    'my.aws_profile-1',
  );
});

test('validateIdentifier: rejects argument-injection attempts', () => {
  assert.throws(() =>
    validateIdentifier('profile', 'foo --debug', PROFILE_PATTERN),
  );
  assert.throws(() =>
    validateIdentifier('profile', '--profile', PROFILE_PATTERN),
  );
  assert.throws(() => validateIdentifier('env', 'dev prod', ENV_PATTERN));
  assert.throws(() => validateIdentifier('env', 'a/b', ENV_PATTERN));
});
