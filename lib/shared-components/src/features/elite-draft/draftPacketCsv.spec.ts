import { buildDraftPacketCsv, draftPacketFilename } from './draftPacketCsv';
import type { DraftPickRecord } from './types';

function pick(overrides: Partial<DraftPickRecord>): DraftPickRecord {
  return {
    id: '1',
    draftId: 1,
    round: 1,
    pickNumber: 1,
    overallPick: 1,
    pickedAt: '2026-01-01T00:00:00Z',
    teamId: 1,
    playerId: 1,
    player: { id: 1, firstName: 'Mike', lastName: 'Trout' },
    ...overrides,
  };
}

describe('buildDraftPacketCsv', () => {
  it('renders a header row and one row per pick, sorted by overall pick', () => {
    const picks = [
      pick({ id: '2', overallPick: 2, round: 1, pickNumber: 2, teamId: 2 }),
      pick({ id: '1', overallPick: 1, round: 1, pickNumber: 1, teamId: 1 }),
    ];
    const teamNameById = (id: number | null | undefined) =>
      id === 1 ? 'Dinger Dynasty' : 'Bronx Bombers';

    const csv = buildDraftPacketCsv(picks, teamNameById);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('Round,Pick,Overall,Team,Player');
    expect(lines[1]).toBe('1,1,1,Dinger Dynasty,Mike Trout');
    expect(lines[2]).toBe('1,2,2,Bronx Bombers,Mike Trout');
  });

  it('escapes commas and quotes in team/player names', () => {
    const picks = [
      pick({ player: { id: 1, firstName: 'Jose', lastName: 'Ramirez, Jr.' } }),
    ];
    const teamNameById = () => 'Team "Alpha"';

    const csv = buildDraftPacketCsv(picks, teamNameById);
    const dataLine = csv.split('\n')[1];

    expect(dataLine).toBe('1,1,1,"Team ""Alpha""","Jose Ramirez, Jr."');
  });

  it('falls back to an em dash when a pick has no player', () => {
    const picks = [pick({ player: null })];
    const csv = buildDraftPacketCsv(picks, () => 'Some Team');
    expect(csv.split('\n')[1]).toBe('1,1,1,Some Team,—');
  });
});

describe('draftPacketFilename', () => {
  it('sanitizes the league name into a filename', () => {
    expect(draftPacketFilename("Bob's League! 2026")).toBe(
      'Bob-s-League-2026-draft-packet.csv',
    );
  });

  it('falls back to "league" when no name is given', () => {
    expect(draftPacketFilename(null)).toBe('league-draft-packet.csv');
    expect(draftPacketFilename(undefined)).toBe('league-draft-packet.csv');
  });
});
