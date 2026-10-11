/**
 * Tests for scripts/db/lahman-season-awards.mjs (LS-10674).
 *
 * Run via: pnpm run test:scripts
 * Or:      node --test scripts/__tests__/lahman-season-awards.test.mjs
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  buildAwardRows,
  parseCsv,
  toSqlValues,
} from '../db/lahman-season-awards.mjs';

test('parseCsv handles quoted fields, embedded commas and CRLF', () => {
  const rows = parseCsv('a,b,c\r\n1,"x, ""y""",3\r\n\r\n4,,6\n');
  assert.deepEqual(rows, [
    { a: '1', b: 'x, "y"', c: '3' },
    { a: '4', b: '', c: '6' },
  ]);
});

test('buildAwardRows maps to B-Ref ids and keeps only chart awards', () => {
  const people = [
    { playerID: 'bondsba01', bbrefID: 'bondsba01' },
    { playerID: 'lahmanid01', bbrefID: 'brefid01' },
    { playerID: 'nobref01', bbrefID: '' },
  ];
  const awards = [
    {
      playerID: 'bondsba01',
      awardID: 'Most Valuable Player',
      yearID: '2001',
      lgID: 'NL',
    },
    {
      playerID: 'bondsba01',
      awardID: 'Silver Slugger',
      yearID: '2001',
      lgID: 'NL',
    },
    {
      playerID: 'bondsba01',
      awardID: 'Player of the Week',
      yearID: '2001',
      lgID: 'NL',
    },
    {
      playerID: 'lahmanid01',
      awardID: 'Cy Young Award',
      yearID: '1960',
      lgID: 'ML',
    },
    { playerID: 'nobref01', awardID: 'Gold Glove', yearID: '1999', lgID: 'AL' },
    {
      playerID: 'bondsba01',
      awardID: 'Most Valuable Player',
      yearID: '2001',
      lgID: 'NL',
    },
  ];

  assert.deepEqual(buildAwardRows(awards, people), [
    { brefId: 'bondsba01', season: 2001, award: 'MVP', league: 'NL' },
    { brefId: 'bondsba01', season: 2001, award: 'SS', league: 'NL' },
    { brefId: 'brefid01', season: 1960, award: 'CYA', league: 'ML' },
  ]);
});

test('toSqlValues escapes quotes', () => {
  assert.equal(
    toSqlValues([
      { brefId: "o'x01", season: 2001, award: 'MVP', league: 'NL' },
    ]),
    "('o''x01',2001,'MVP','NL')",
  );
});
