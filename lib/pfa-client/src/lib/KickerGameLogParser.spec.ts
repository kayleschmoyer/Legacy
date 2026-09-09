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

describe('parseKickerGameLog', () => {
  it('parses the SCORING table, matching the Jan Stenerud worked example from LS-9948 comment 20612', () => {
    const html = fixture('kicker-gamelog-sten00200.html');
    const rows = parseKickerGameLog(html);

    expect(rows).toEqual([
      {
        date: '9/24/1967',
        team: 'KAN',
        homeAway: 'A',
        opponent: 'MIA',
        score: '24-0',
        result: 'W',
        td: 0,
        xpMade: 3,
        xpAtt: 3,
        twoPtMade: 0,
        twoPtAtt: 0,
        fgMade: 1,
        fgAtt: 4,
        safeties: 0,
        points: 6,
      },
    ]);
  });

  it('returns an empty array when no SCORING table is present', () => {
    expect(parseKickerGameLog('<html><body></body></html>')).toEqual([]);
  });
});
