import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPlayersByLetter, mapPfrPosition } from './Players';
import * as PFRSession from './PFRSession';

jest.mock('./PFRSession');
const mockGetPlayersList = jest.mocked(PFRSession.getPlayersList);

// Real-shape PFR letter-index excerpt. Guards LS-7739: the list lives in
// #div_players (no trailing underscore) and position is parenthesized,
// e.g. "(OLB) 2019-2025", with active players wrapped in <b>.
const PLAYERS_A_HTML = readFileSync(
  join(__dirname, '__fixtures__', 'players-index-a.html'),
  'utf-8',
);

describe('mapPfrPosition', () => {
  it.each([
    ['DE', 'DL'],
    ['DT', 'DL'],
    ['ILB', 'LB'],
    ['OLB', 'LB'],
    ['MLB', 'LB'],
    ['LB', 'LB'],
    ['CB', 'DB'],
    ['S', 'DB'],
    ['FS', 'DB'],
    ['SS', 'DB'],
    ['DB', 'DB'],
    ['QB', 'QB'],
    ['RB', 'RB'],
    ['FB', 'RB'],
    ['WR', 'WR'],
    ['TE', 'TE'],
    ['K', 'K'],
  ] as const)('maps PFR position %s to %s', (raw, expected) => {
    expect(mapPfrPosition(raw)).toBe(expected);
  });

  it.each(['P', 'LS', 'OL', 'T', 'G', 'C'])(
    'returns null for non-fantasy position %s',
    (pos) => {
      expect(mapPfrPosition(pos)).toBeNull();
    },
  );

  it('maps nose tackle (NT) to DL', () => {
    expect(mapPfrPosition('NT')).toBe('DL');
  });

  it('returns null for unknown positions', () => {
    expect(mapPfrPosition('UNKNOWN')).toBeNull();
  });
});

describe('getPlayersByLetter — #div_players + parenthesized position', () => {
  beforeEach(() => {
    mockGetPlayersList.mockResolvedValue(PLAYERS_A_HTML);
  });

  it('parses every player entry in the list (non-empty)', async () => {
    const players = await getPlayersByLetter('A');
    expect(players).toHaveLength(7);
  });

  it('extracts pfrId, name, and parenthesized position', async () => {
    const players = await getPlayersByLetter('A');

    expect(players[0]).toEqual({
      pfrId: 'AaitIs00',
      name: 'Isaako Aaitui',
      rawPosition: 'NT',
      lastTeam: null,
    });
  });

  it('handles <b>-wrapped active players', async () => {
    const players = await getPlayersByLetter('A');
    const alShaair = players.find((p) => p.pfrId === 'AlShAz00');

    expect(alShaair).toEqual({
      pfrId: 'AlShAz00',
      name: 'Azeez Al-Shaair',
      rawPosition: 'OLB',
      lastTeam: null,
    });
  });

  it('keeps single-letter old positions like (E)', async () => {
    const players = await getPlayersByLetter('A');
    const adams = players.find((p) => p.pfrId === 'AdamGr20');

    expect(adams?.rawPosition).toBe('E');
  });

  it('preserves slash multi-positions like (DB/LB)', async () => {
    const players = await getPlayersByLetter('A');
    const adams = players.find((p) => p.pfrId === 'AdamMi99');

    expect(adams?.rawPosition).toBe('DB/LB');
  });

  it('does not mis-parse the trailing year range as a team', async () => {
    const players = await getPlayersByLetter('A');
    expect(players.every((p) => p.lastTeam === null)).toBe(true);
  });

  it('strips the Hall of Fame "+" marker so position still parses (LS-9968)', async () => {
    const players = await getPlayersByLetter('A');
    const aikman = players.find((p) => p.pfrId === 'AikmTr00');

    expect(aikman).toEqual({
      pfrId: 'AikmTr00',
      name: 'Troy Aikman',
      rawPosition: 'QB',
      lastTeam: null,
    });
  });

  it('returns an empty array when #div_players is absent', async () => {
    mockGetPlayersList.mockResolvedValue('<html><body></body></html>');
    const players = await getPlayersByLetter('A');
    expect(players).toEqual([]);
  });
});

describe('getPlayersByLetter — Hall of Fame "+" marker (LS-9968)', () => {
  // PFR marks Hall of Fame inductees with a trailing "+" directly after the
  // </a>, before the parenthesized position — e.g. "Joe Montana+ (QB)
  // 1979-1994". Previously this left rawPosition empty, mapPfrPosition
  // returned null, and processFootballLetter silently dropped the player.
  const buildHtml = (href: string, name: string, pos: string) => `
    <html>
      <body>
        <div id="div_players">
          <p>
            <a href="${href}">${name}</a>+ (${pos}) 1979-1994
          </p>
        </div>
      </body>
    </html>
  `;

  it('parses position for an HOF-marked entry with a space before the paren', async () => {
    mockGetPlayersList.mockResolvedValue(
      buildHtml('/players/M/MontJo00.htm', 'Joe Montana', 'QB'),
    );
    const players = await getPlayersByLetter('M');

    expect(players).toEqual([
      {
        pfrId: 'MontJo00',
        name: 'Joe Montana',
        rawPosition: 'QB',
        lastTeam: null,
      },
    ]);
  });

  it('parses position for an HOF-marked entry with no space before the paren', async () => {
    mockGetPlayersList.mockResolvedValue(`
      <html><body><div id="div_players">
        <p><a href="/players/R/RiceJe00.htm">Jerry Rice</a>+(WR) 1985-2004</p>
      </div></body></html>
    `);
    const players = await getPlayersByLetter('R');

    expect(players).toEqual([
      {
        pfrId: 'RiceJe00',
        name: 'Jerry Rice',
        rawPosition: 'WR',
        lastTeam: null,
      },
    ]);
  });
});

describe('getPlayersByLetter — dotted PFR IDs (LS-8416)', () => {
  // A.J./C.J./T.J./D.J.-prefixed given names produce dotted PFR IDs like
  // "BrowC.20" — the greedy capture group must still backtrack to leave the
  // trailing literal ".htm" unconsumed.
  const DOTTED_ID_HTML = `
    <html>
      <body>
        <div id="div_players">
          <p>
            <a href="/players/B/BrowC.20.htm">C.J. Brown</a> (WR) 2020-2020
          </p>
        </div>
      </body>
    </html>
  `;

  it('captures a dotted pfrId, leaving the trailing .htm unconsumed', async () => {
    mockGetPlayersList.mockResolvedValue(DOTTED_ID_HTML);
    const players = await getPlayersByLetter('B');

    expect(players).toEqual([
      {
        pfrId: 'BrowC.20',
        name: 'C.J. Brown',
        rawPosition: 'WR',
        lastTeam: null,
      },
    ]);
  });
});

describe('getPlayersByLetter — hyphenated/underscored/apostrophe PFR IDs (LS-8418)', () => {
  // Compound surnames (hyphen), PFR's own ID-generation quirks for
  // short/multi-part names (underscore), and apostrophe'd surnames like
  // O'Shea produce PFR IDs containing "-", "_", and "'" — the greedy
  // capture group must still backtrack to leave the trailing literal
  // ".htm" unconsumed for each.
  const buildHtml = (href: string, name: string, pos: string) => `
    <html>
      <body>
        <div id="div_players">
          <p>
            <a href="${href}">${name}</a> (${pos}) 2020-2020
          </p>
        </div>
      </body>
    </html>
  `;

  it('captures a hyphenated pfrId, leaving the trailing .htm unconsumed', async () => {
    mockGetPlayersList.mockResolvedValue(
      buildHtml('/players/E/El-MHi20.htm', 'Hitomi El-M', 'WR'),
    );
    const players = await getPlayersByLetter('E');

    expect(players).toEqual([
      {
        pfrId: 'El-MHi20',
        name: 'Hitomi El-M',
        rawPosition: 'WR',
        lastTeam: null,
      },
    ]);
  });

  it('captures an underscored pfrId, leaving the trailing .htm unconsumed', async () => {
    mockGetPlayersList.mockResolvedValue(
      buildHtml('/players/C/Cox_Mi20.htm', 'Mike Cox', 'RB'),
    );
    const players = await getPlayersByLetter('C');

    expect(players).toEqual([
      {
        pfrId: 'Cox_Mi20',
        name: 'Mike Cox',
        rawPosition: 'RB',
        lastTeam: null,
      },
    ]);
  });

  it("captures an apostrophe'd pfrId, leaving the trailing .htm unconsumed", async () => {
    mockGetPlayersList.mockResolvedValue(
      buildHtml("/players/O/O'ShJa00.htm", "James O'Shea", 'TE'),
    );
    const players = await getPlayersByLetter('O');

    expect(players).toEqual([
      {
        pfrId: "O'ShJa00",
        name: "James O'Shea",
        rawPosition: 'TE',
        lastTeam: null,
      },
    ]);
  });
});
