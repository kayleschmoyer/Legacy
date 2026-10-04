import { readFileSync } from 'fs';
import { join } from 'path';
import {
  extractKickerCandidates,
  parseBoxScore,
  parseGameIdentifierFromUrl,
} from './BoxScoreParser';

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

  it('extracts from a later-era folder number too (the folder digit is not fixed per era)', () => {
    expect(
      parseGameIdentifierFromUrl(
        'https://www.profootballarchives.com/nflboxscores2/1990nfl229.html',
      ),
    ).toEqual({ gameIdentifier: '1990nfl229', season: 1990 });
  });

  it('returns null for a non-box-score URL', () => {
    expect(
      parseGameIdentifierFromUrl(
        'https://www.profootballarchives.com/nflplayers-m.html',
      ),
    ).toBeNull();
  });
});

// Fixtures are real captured box-score pages (2026-09-17, live egress — see
// LS-9995), not synthetic — replaces the earlier hand-built versions this
// package shipped with before egress was available. Real markup turned out
// to differ materially from the earlier guesses (a combined caption+header
// row rather than a separate caption row, "Score By Quarters" not "Score By
// Quarter", the scoring-plays label embedded mid-row) — see HtmlParser.ts's
// updated doc comments.
describe('parseBoxScore — 1960 STL @ LARM (real page)', () => {
  const html = fixture('box-score-1960.html');
  const url =
    'https://www.profootballarchives.com/nflboxscores1/1960nfl001.html';
  const result = parseBoxScore(html, url);

  it('derives the game identifier and season from the URL', () => {
    expect(result.gameIdentifier).toBe('1960nfl001');
    expect(result.season).toBe(1960);
  });

  it('parses a rushing line keyed by pfaId, skipping the team-name divider row', () => {
    const player = result.players.find((p) => p.pfaId === 'hamm00400');
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
    const player = result.players.find((p) => p.pfaId === 'roac00200');
    expect(player?.passing?.lng).toBe(57);
    expect(player?.passing?.lngTd).toBe(true);
    // TS is blank on this 1960s row — the measured-population table shows
    // this field is patchy pre-1970, so null (not 0) is correct.
    expect(player?.passing?.ts).toBeNull();
    expect(player?.passing?.yl).toBe(17);
  });

  it('parses a receiving line with a touchdown long gain', () => {
    expect(
      result.players.find((p) => p.pfaId === 'crow00400')?.receiving,
    ).toEqual({
      no: 5,
      yds: 125,
      avg: 25.0,
      lng: 52,
      lngTd: true,
      td: 2,
    });
  });

  it('parses quarter-by-quarter score (away then home), matching the season index totals', () => {
    // Season index: St. Louis (visitor/away) 43, Los Angeles Rams (home) 21.
    expect(result.quarterScores).toEqual({
      away: [0, 10, 19, 14],
      home: [7, 7, 0, 7],
    });
  });

  it('parses scoring plays with quarter numbers, not swallowing the header row', () => {
    expect(result.scoringPlays).toHaveLength(11);
    expect(result.scoringPlays[0]).toEqual({
      quarter: 1,
      text: 'Clendon Thomas 13 pass from Billy Wade (Danny Villanueva kick)',
    });
  });

  it('never populates kicking or defense-idp stats — those routes are out of scope for this parser', () => {
    for (const player of result.players) {
      expect(player).not.toHaveProperty('kicking');
      expect(player).not.toHaveProperty('defenseIdp');
    }
  });
});

describe('extractKickerCandidates', () => {
  it('identifies both kickers from real PAT and FG scoring-play text', () => {
    const html = fixture('box-score-1960.html');
    // "(Danny Villanueva kick)" and "Bobby Joe Conrad 12 FG" both appear in
    // this game's real scoring plays.
    expect(extractKickerCandidates(html)).toEqual(['vill00800', 'conr00200']);
  });

  it('returns an empty array when there is no scoring-plays table', () => {
    expect(extractKickerCandidates('<html><body></body></html>')).toEqual([]);
  });
});

describe('parseBoxScore — 1990 SF @ WAS (real page, fully populated columns)', () => {
  const html = fixture('box-score-1990.html');
  const url =
    'https://www.profootballarchives.com/nflboxscores2/1990nfl229.html';
  const result = parseBoxScore(html, url);

  it('parses TS/YL/RTG when populated (patchy pre-1970, complete by 1990)', () => {
    const player = result.players.find((p) => p.pfaId === 'mont00800');
    expect(player?.name).toBe('Joe Montana');
    expect(player?.passing).toEqual({
      att: 31,
      com: 22,
      pct: 71.0,
      int: 1,
      yds: 274,
      avg: 8.8,
      lng: 47,
      lngTd: false,
      td: 2,
      ts: 2,
      yl: 10,
      rtg: 106.1,
    });
  });

  it('parses a populated FC cell on punt returns', () => {
    const player = result.players.find((p) => p.pfaId === 'john17300');
    expect(player?.puntReturns).toEqual({
      no: 2,
      fc: 2,
      yds: 15,
      avg: 7.5,
      lng: 9,
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
