import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseKickerGameLog,
  parsePfaIdFromGameLogUrl,
} from './KickerGameLogParser';

function fixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', name), 'utf-8');
}

describe('parsePfaIdFromGameLogUrl', () => {
  it('extracts the pfaId from a kicker game-log URL', () => {
    expect(
      parsePfaIdFromGameLogUrl(
        'https://www.profootballarchives.com/gamelogs/s/sten00200.html',
      ),
    ).toBe('sten00200');
  });

  it('returns null for a non-gamelog URL', () => {
    expect(
      parsePfaIdFromGameLogUrl(
        'https://www.profootballarchives.com/nflplayers-s.html',
      ),
    ).toBeNull();
  });
});

// Fixture is Jan Stenerud's real, full captured career game log
// (2026-09-17, live egress — see LS-9995) — replaces the earlier
// hand-built single-row version this package shipped with before egress
// was available. Real markup differs from the earlier guess: THREE
// single-cell marker rows precede the real column header ("SCORING", then
// "REGULAR SEASON"/"PLAYOFFS", then the header row itself), and the DATE
// cell links to the box score rather than being plain text.
describe('parseKickerGameLog', () => {
  const html = fixture('kicker-gamelog-sten00200.html');
  const rows = parseKickerGameLog(html);

  it('parses only REGULAR SEASON rows, matching the Jan Stenerud worked example from LS-9948 comment 20612', () => {
    expect(rows[0]).toEqual({
      date: '9/9/1967',
      gameIdentifier: '1967afl003',
      season: 1967,
      team: '1967 Kansas City Chiefs (AFL)',
      homeAway: 'A',
      opponent: 'HOU',
      score: '25-20',
      result: 'W',
      td: 0,
      xpMade: 2,
      xpAtt: 2,
      twoPtMade: 0,
      twoPtAtt: 0,
      fgMade: 1,
      fgAtt: 2,
      safeties: 0,
      points: 5,
    });
  });

  it('derives gameIdentifier/season from the DATE cell link, spanning AFL and NFL folders across a career', () => {
    // Same physical URL folder ("nflboxscores1") holds both leagues' early
    // games; the filename alone encodes league.
    expect(rows[0].gameIdentifier).toBe('1967afl003');
    const lastRow = rows[rows.length - 1];
    expect(lastRow.gameIdentifier).toBe('1985nfl219');
    expect(lastRow.season).toBe(1985);
  });

  it('never emits a duplicated team name from the responsive desktop/mobile span pair', () => {
    for (const row of rows) {
      expect(row.team).not.toMatch(/\)\d/); // "...(AFL)1967 KC AFL" duplication pattern
    }
  });

  it('parses a real career-length game log with no non-regular-season rows leaking through', () => {
    expect(rows.length).toBeGreaterThan(200);
  });

  it('returns an empty array when no SCORING table is present', () => {
    expect(parseKickerGameLog('<html><body></body></html>')).toEqual([]);
  });
});
