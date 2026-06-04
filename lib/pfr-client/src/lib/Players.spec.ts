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
    expect(players).toHaveLength(6);
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

  it('returns an empty array when #div_players is absent', async () => {
    mockGetPlayersList.mockResolvedValue('<html><body></body></html>');
    const players = await getPlayersByLetter('A');
    expect(players).toEqual([]);
  });
});
