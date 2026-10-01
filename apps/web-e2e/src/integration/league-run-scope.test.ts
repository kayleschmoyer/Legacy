import test from 'node:test';
import assert from 'node:assert/strict';
import {
  belongsToRun,
  extractRunTag,
  generateLocalRunTag,
  INTEGRATION_RUN_ID_ENV,
  MAX_LEAGUE_NAME_LENGTH,
  resetRunTagCacheForTests,
  resolveRunTag,
  runTagFromRunId,
  testLeagueName,
} from './league-run-scope';

const FIXED_NOW = 1727683200000; // 2024-09-30T08:00:00Z (13 digits)

void test('runTagFromRunId prefixes a CI run id with "r"', () => {
  assert.equal(runTagFromRunId('36685892280'), 'r36685892280');
});

void test('runTagFromRunId normalises and truncates arbitrary ids', () => {
  assert.equal(runTagFromRunId('My-Run_42'), 'rmyrun42');
  assert.equal(runTagFromRunId('1234567890123456'), 'r12345678901');
  assert.throws(() => runTagFromRunId('---'), /alphanumeric/);
});

void test('generateLocalRunTag is short, "l"-prefixed base36', () => {
  const tag = generateLocalRunTag(FIXED_NOW);
  assert.match(tag, /^l[0-9a-z]{1,11}$/);
});

void test('resolveRunTag reads INTEGRATION_RUN_ID and publishes the tag back to env', () => {
  resetRunTagCacheForTests();
  const env: NodeJS.ProcessEnv = { [INTEGRATION_RUN_ID_ENV]: '36685892280' };
  assert.equal(resolveRunTag(env), 'r36685892280');
  assert.equal(env[INTEGRATION_RUN_ID_ENV], 'r36685892280');
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
