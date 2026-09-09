import { readFileSync } from 'fs';
import { join } from 'path';
import { parseBoxScore, parseGameIdentifierFromUrl } from './BoxScoreParser';

function fixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', name), 'utf-8');
}

describe('parseGameIdentifierFromUrl', () => {
  it('extracts the game identifier and season from a box-score URL', () => {
    expect(
      parseGameIdentifierFromUrl(
        'https://www.profootballarchives.com/nflboxscores1/1960nfl001.html',
      ),
    ).toEqual({ gameIdentifier: '1960nfl001', season: 1960 });
  });

  it('returns null for a non-box-score URL', () => {
    expect(
      parseGameIdentifierFromUrl(
        'https://www.profootballarchives.com/nflplayers-m.html',
      ),
    ).toBeNull();
  });
});

describe('parseBoxScore — 1960s era', () => {
  const html = fixture('box-score-1960.html');
  const url =
    'https://www.profootballarchives.com/nflboxscores1/1960nfl001.html';
  const result = parseBoxScore(html, url);

  it('derives the game identifier and season from the URL', () => {
    expect(result.gameIdentifier).toBe('1960nfl001');
    expect(result.season).toBe(1960);
  });

  it('parses a rushing line keyed by pfaId', () => {
    const player = result.players.find((p) => p.pfaId === 'hamm00100');
    expect(player?.name).toBe('Mal Hammack');
    expect(player?.rushing).toEqual({
      att: 13,
      yds: 65,
      avg: 5.0,
      lng: 13,
      lngTd: false,
      td: 0,
    });
  });

  it('strips the trailing "t" touchdown marker from LG and sets lngTd', () => {
    const player = result.players.find((p) => p.pfaId === 'gabr00200');
    expect(player?.passing?.lng).toBe(57);
    expect(player?.passing?.lngTd).toBe(true);
    // TS/YL blank in this 1960s row — the measured-population table shows
    // these fields are patchy pre-1970, so null (not 0) is correct.
    expect(player?.passing?.ts).toBeNull();
    expect(player?.passing?.yl).toBeNull();
  });

  it('parses receiving, interceptions, and punting lines', () => {
    expect(
      result.players.find((p) => p.pfaId === 'tayl00300')?.receiving,
    ).toEqual({ no: 5, yds: 90, avg: 18.0, lng: 34, lngTd: false, td: 1 });
    expect(
      result.players.find((p) => p.pfaId === 'blou00400')?.interceptions,
    ).toEqual({ no: 1, yds: 12, avg: 12.0, lng: 12, lngTd: false, td: 0 });
    expect(
      result.players.find((p) => p.pfaId === 'west00500')?.punting,
    ).toEqual({ no: 4, yds: 160, avg: 40.0, lng: 52, lngTd: false, bl: 0 });
  });

  it('rejects a PUNT RETURNS row missing its FC cell instead of misaligning columns', () => {
    const player = result.players.find((p) => p.pfaId === 'west00500');
    // The fixture's punt-return row has 6 cells against a 7-cell header
    // (FC dropped entirely) — this must be skipped, not silently shifted.
    expect(player?.puntReturns).toBeNull();
  });

  it('parses a KICKOFF RETURNS row with a blank (not missing) FC cell as null, not misaligned', () => {
    const player = result.players.find((p) => p.pfaId === 'west00500');
    expect(player?.kickoffReturns).toEqual({
      no: 2,
      fc: null,
      yds: 45,
      avg: 22.5,
      lng: 30,
      lngTd: false,
      td: 0,
    });
  });

  it('parses quarter-by-quarter score', () => {
    expect(result.quarterScores).toEqual({
      away: [0, 7, 0, 0],
      home: [7, 0, 0, 0],
    });
  });

  it('parses scoring plays without swallowing the header row as a play', () => {
    expect(result.scoringPlays).toHaveLength(1);
    expect(result.scoringPlays[0].text).toContain('Otis Taylor');
    expect(result.scoringPlays[0].quarter).toBe(1);
  });

  it('never populates kicking or defense-idp stats — those routes are out of scope for this parser', () => {
    for (const player of result.players) {
      expect(player).not.toHaveProperty('kicking');
      expect(player).not.toHaveProperty('defenseIdp');
    }
  });
});

describe('parseBoxScore — 1990s era (fully populated columns)', () => {
  const html = fixture('box-score-1990.html');
  const url =
    'https://www.profootballarchives.com/nflboxscores1/1990nfl001.html';
  const result = parseBoxScore(html, url);

  it('parses TS/YL/RTG when populated', () => {
    const player = result.players.find((p) => p.pfaId === 'aikm00700');
    expect(player?.passing).toEqual({
      att: 30,
      com: 21,
      pct: 70.0,
      int: 0,
      yds: 256,
      avg: 8.5,
      lng: 41,
      lngTd: false,
      td: 2,
      ts: 2,
      yl: 14,
      rtg: 112.3,
    });
  });

  it('parses a populated FC cell on punt returns', () => {
    const player = result.players.find((p) => p.pfaId === 'kell00900');
    expect(player?.puntReturns).toEqual({
      no: 3,
      fc: 1,
      yds: 28,
      avg: 9.3,
      lng: 15,
      lngTd: false,
      td: 0,
    });
  });
});

describe('parseBoxScore — error handling', () => {
  it('throws when the source URL is not a recognized box-score URL', () => {
    expect(() =>
      parseBoxScore('<html></html>', 'https://example.com/not-a-box-score'),
    ).toThrow();
  });
});
