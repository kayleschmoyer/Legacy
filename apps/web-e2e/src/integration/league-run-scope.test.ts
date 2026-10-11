import test from 'node:test';
import assert from 'node:assert/strict';
import {
  belongsToRun,
  extractRunTag,
  generateLocalRunTag,
  INTEGRATION_RUN_ID_ENV,
  MAX_LEAGUE_NAME_LENGTH,
  resetRunTagCacheForTests,
  resolveJobKey,
  resolveRunTag,
  runTagFromRunId,
  testLeagueName,
} from './league-run-scope';

const FIXED_NOW = 1727683200000; // 2024-09-30T08:00:00Z (13 digits)

void test('runTagFromRunId prefixes a base36-encoded CI run id with "r"', () => {
  assert.equal(runTagFromRunId('38084841194'), 'rhhuqbje');
  assert.equal(runTagFromRunId('99999999999'), 'r19xtf1tr');
});

void test('runTagFromRunId appends the job key so sibling jobs never share a tag (LS-11054)', () => {
  const shard1 = runTagFromRunId('38084841194', 's1');
  const shard2 = runTagFromRunId('38084841194', 's2');
  const sharedLive = runTagFromRunId('38084841194', 'sl');
  assert.equal(shard2, 'rhhuqbjes2');
  assert.equal(new Set([shard1, shard2, sharedLive]).size, 3);
  // Re-running the same job (a `run_attempt` retry) reproduces its tag.
  assert.equal(runTagFromRunId('38084841194', 's2'), shard2);
});

void test('runTagFromRunId normalises and truncates arbitrary ids, keeping the job key', () => {
  assert.equal(runTagFromRunId('My-Run_42'), 'rmyrun42');
  assert.equal(runTagFromRunId('1234567890123456'), 'r12345678901');
  assert.equal(runTagFromRunId('1234567890123456', 'sl'), 'r123456789sl');
  assert.throws(() => runTagFromRunId('---'), /alphanumeric/);
});

void test('resolveJobKey prefers INTEGRATION_JOB_KEY, then the shard index', () => {
  assert.equal(resolveJobKey({ INTEGRATION_JOB_KEY: 'sl' }), 'sl');
  assert.equal(
    resolveJobKey({
      INTEGRATION_JOB_KEY: 'shared-live',
      INTEGRATION_SHARD_CURRENT: '2',
      INTEGRATION_SHARD_TOTAL: '3',
    }),
    'sha',
  );
  assert.equal(
    resolveJobKey({
      INTEGRATION_SHARD_CURRENT: '2',
      INTEGRATION_SHARD_TOTAL: '3',
    }),
    's2',
  );
  assert.equal(
    resolveJobKey({
      INTEGRATION_SHARD_CURRENT: '1',
      INTEGRATION_SHARD_TOTAL: '1',
    }),
    '',
  );
  assert.equal(resolveJobKey({}), '');
});

void test('generateLocalRunTag is short, "l"-prefixed base36', () => {
  const tag = generateLocalRunTag(FIXED_NOW);
  assert.match(tag, /^l[0-9a-z]{1,11}$/);
});

void test('resolveRunTag reads INTEGRATION_RUN_ID and publishes the tag back to env', () => {
  resetRunTagCacheForTests();
  const env: NodeJS.ProcessEnv = { [INTEGRATION_RUN_ID_ENV]: '38084841194' };
  assert.equal(resolveRunTag(env), 'rhhuqbje');
  assert.equal(env[INTEGRATION_RUN_ID_ENV], 'rhhuqbje');
  resetRunTagCacheForTests();
});

void test('resolveRunTag folds the shard index into the tag', () => {
  resetRunTagCacheForTests();
  const env: NodeJS.ProcessEnv = {
    [INTEGRATION_RUN_ID_ENV]: '38084841194',
    INTEGRATION_SHARD_CURRENT: '2',
    INTEGRATION_SHARD_TOTAL: '3',
  };
  assert.equal(resolveRunTag(env), 'rhhuqbjes2');
  // Workers re-read the published, already-formed tag unchanged.
  resetRunTagCacheForTests();
  assert.equal(resolveRunTag(env), 'rhhuqbjes2');
  resetRunTagCacheForTests();
});

void test('resolveRunTag accepts an already-formed tag unchanged', () => {
  resetRunTagCacheForTests();
  const env: NodeJS.ProcessEnv = { [INTEGRATION_RUN_ID_ENV]: 'rabc123' };
  assert.equal(resolveRunTag(env), 'rabc123');
  resetRunTagCacheForTests();
});

void test('resolveRunTag mints a local tag when env is empty and memoises it', () => {
  resetRunTagCacheForTests();
  const env: NodeJS.ProcessEnv = {};
  const first = resolveRunTag(env);
  assert.match(first, /^l[0-9a-z]+$/);
  assert.equal(env[INTEGRATION_RUN_ID_ENV], first);
  assert.equal(resolveRunTag({}), first, 'memoised across calls');
  resetRunTagCacheForTests();
});

void test('testLeagueName composes "<Label> E2E <runTag> <ms>"', () => {
  const name = testLeagueName('Settings', {
    now: FIXED_NOW,
    runTag: 'r36685892280',
  });
  assert.equal(name, `Settings E2E r36685892280 ${FIXED_NOW}`);
});

void test('testLeagueName trims the label and rejects an empty one', () => {
  assert.equal(
    testLeagueName('  Waiver  ', { now: FIXED_NOW, runTag: 'r1' }),
    `Waiver E2E r1 ${FIXED_NOW}`,
  );
  assert.throws(() => testLeagueName('   ', { runTag: 'r1' }), /non-empty/);
});

void test('testLeagueName throws before the server 50-char cap is exceeded', () => {
  const runTag = 'r36685892280';
  // 19 + 5 + 12 + 1 + 13 = 50 — exactly at the cap is allowed.
  const atCap = testLeagueName('Dual Scoring Editor', {
    now: FIXED_NOW,
    runTag,
  });
  assert.equal(atCap.length, MAX_LEAGUE_NAME_LENGTH);
  assert.throws(
    () => testLeagueName('Dual Scoring Editors', { now: FIXED_NOW, runTag }),
    /caps league names at 50/,
  );
});

void test('every label the suites use today fits under the cap with a real CI tag', () => {
  const runTag = 'r99999999999'; // 11-digit run id — widest tag CI can produce
  const labels = [
    'Announcements',
    'Settings',
    'A11y',
    'UI Season',
    'Season API',
    'Activity Feed',
    'QR Invite',
    'Scoring',
    'Live Draft',
    'Matchup Detail',
    'Roster Editor',
    'Roster Recap',
    'Playoff Bracket',
    'Roster Mgmt',
    'Season Lifecycle',
    'Season Renewal',
    'Trade Flow',
    'Waiver',
    'Dual QR Invite',
    'Dual Scoring',
    'Dual League',
    'Waiver Queue',
    'Active Matchup',
  ];
  for (const label of labels) {
    assert.doesNotThrow(
      () => testLeagueName(label, { now: FIXED_NOW, runTag }),
      label,
    );
  }
});

void test('extractRunTag reads the tag out of a composed name', () => {
  assert.equal(
    extractRunTag(`Live Draft E2E r36685892280 ${FIXED_NOW}`),
    'r36685892280',
  );
  assert.equal(
    extractRunTag(`Waiver E2E lm1abc2d3e ${FIXED_NOW}`),
    'lm1abc2d3e',
  );
});

void test('extractRunTag is undefined for legacy and user names', () => {
  assert.equal(extractRunTag(`Live Draft E2E ${FIXED_NOW}`), undefined);
  assert.equal(extractRunTag('Integration Season Test League'), undefined);
  assert.equal(extractRunTag('Mock Draft Practice'), undefined);
  assert.equal(extractRunTag('My Real League E2E r1 nope'), undefined);
});

void test('belongsToRun matches only the exact tag', () => {
  const name = `Settings E2E r36685892280 ${FIXED_NOW}`;
  assert.equal(belongsToRun(name, 'r36685892280'), true);
  assert.equal(belongsToRun(name, 'r3668589228'), false);
  assert.equal(
    belongsToRun(`Settings E2E ${FIXED_NOW}`, 'r36685892280'),
    false,
  );
});
