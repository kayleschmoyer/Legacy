import {
  buildBoardCells,
  buildSquadSlots,
  describeBoardCell,
  describeSquadNeed,
  formatClock,
  initialsOf,
  MIN_BOARD_ROUNDS,
  resolveBoardRounds,
  shortPlayerName,
  statLineFor,
} from './nativeDraftBoard';
import type {
  CurrentDraftPickInfo,
  DraftPickRecord,
  DraftPlayer,
  LeagueTeam,
} from './types';

function makePlayer(overrides: Partial<DraftPlayer> = {}): DraftPlayer {
  return {
    id: 1,
    name: 'Bobby Witt Jr.',
    position: 'SS',
    avg: 0.332,
    hr: 32,
    rbi: 96,
    runs: 100,
    sb: 30,
    games: 160,
    hits: 200,
    obp: 0.389,
    slg: 0.588,
    ...overrides,
  };
}

function makePick(overrides: Partial<DraftPickRecord> = {}): DraftPickRecord {
  return {
    id: 'p1',
    draftId: 42,
    round: 1,
    pickNumber: 1,
    overallPick: 1,
    pickedAt: '2026-07-28T00:00:00Z',
    teamId: 1,
    playerId: 1,
    ...overrides,
  };
}

const TEAMS: LeagueTeam[] = [
  { id: '1', name: 'Dinger Dynasty', leagueId: 1 },
  { id: '2', name: 'Bronx Bombers', leagueId: 1 },
];

describe('initialsOf', () => {
  it('takes the initial of each word', () => {
    expect(initialsOf('Dinger Dynasty')).toBe('DD');
    expect(initialsOf('Rocket City 9')).toBe('RC');
  });

  it('falls back to the first two characters of a single word', () => {
    expect(initialsOf('Thunder')).toBe('TH');
  });

  it('returns an empty string for a blank name', () => {
    expect(initialsOf('   ')).toBe('');
  });
});

describe('formatClock', () => {
  it('formats as m:ss with a zero-padded seconds field', () => {
    expect(formatClock(90)).toBe('1:30');
    expect(formatClock(5)).toBe('0:05');
    expect(formatClock(600)).toBe('10:00');
  });

  it('clamps negative time to 0:00', () => {
    expect(formatClock(-12)).toBe('0:00');
  });
});

describe('resolveBoardRounds', () => {
  it('never renders fewer than the minimum board height', () => {
    expect(
      resolveBoardRounds({
        teamCount: 8,
        pickCount: 0,
        currentRound: 1,
        maxPickRound: 0,
      }),
    ).toBe(MIN_BOARD_ROUNDS);
  });

  it('grows with the deepest round reached', () => {
    expect(
      resolveBoardRounds({
        teamCount: 8,
        pickCount: 70,
        currentRound: 9,
        maxPickRound: 9,
      }),
    ).toBe(10);
  });

  it('degrades safely when the team list has not loaded', () => {
    expect(
      resolveBoardRounds({
        teamCount: 0,
        pickCount: 0,
        currentRound: null,
        maxPickRound: 0,
      }),
    ).toBe(MIN_BOARD_ROUNDS);
  });
});

describe('buildBoardCells', () => {
  const statsLookup = new Map<number, DraftPlayer>([[1, makePlayer()]]);

  it('lays cells out row-major, one row per round', () => {
    const cells = buildBoardCells({
      teams: TEAMS,
      picks: [],
      currentPickInfo: null,
      myTeamId: null,
      statsLookup,
      rounds: 2,
    });

    expect(cells).toHaveLength(4);
    expect(cells.map((c) => c.key)).toEqual(['1-1', '1-2', '2-1', '2-2']);
  });

  it('places a pick by its own round and teamId rather than snake math', () => {
    // Round 2 of a snake draft reverses the order — the pick still belongs to
    // team 2's column because the record says so.
    const cells = buildBoardCells({
      teams: TEAMS,
      picks: [makePick({ round: 2, teamId: 2, overallPick: 3 })],
      currentPickInfo: null,
      myTeamId: null,
      statsLookup,
      rounds: 2,
    });

    const cell = cells.find((c) => c.key === '2-2');
    expect(cell?.pick?.overallPick).toBe(3);
    expect(cell?.position).toBe('SS');
    expect(cell?.playerName).toBe('Bobby Witt Jr.');
  });

  it('marks the on-the-clock cell and the viewer column', () => {
    const currentPickInfo: CurrentDraftPickInfo = {
      draftId: 42,
      teamId: 2,
      round: 1,
      pickNumber: 2,
      overallPick: 2,
      isComplete: false,
    };
    const cells = buildBoardCells({
      teams: TEAMS,
      picks: [],
      currentPickInfo,
      myTeamId: 1,
      statsLookup,
      rounds: 1,
    });

    expect(cells.find((c) => c.key === '1-2')?.isCurrent).toBe(true);
    expect(cells.find((c) => c.key === '1-1')?.isCurrent).toBe(false);
    expect(cells.find((c) => c.key === '1-1')?.isMine).toBe(true);
    expect(cells.find((c) => c.key === '1-2')?.isMine).toBe(false);
  });

  it('does not mark any cell current once the draft is complete', () => {
    const cells = buildBoardCells({
      teams: TEAMS,
      picks: [],
      currentPickInfo: {
        draftId: 42,
        teamId: 1,
        round: 1,
        pickNumber: 1,
        overallPick: 1,
        isComplete: true,
      },
      myTeamId: null,
      statsLookup,
      rounds: 1,
    });

    expect(cells.some((c) => c.isCurrent)).toBe(false);
  });

  it('falls back to the pick record for players missing from the stats map', () => {
    const cells = buildBoardCells({
      teams: TEAMS,
      picks: [
        makePick({
          playerId: 99,
          player: {
            id: 99,
            firstName: 'Paul',
            lastName: 'Skenes',
            eligiblePositions: ['SP'],
          },
        }),
      ],
      currentPickInfo: null,
      myTeamId: null,
      statsLookup,
      rounds: 1,
    });

    const cell = cells.find((c) => c.key === '1-1');
    expect(cell?.playerName).toBe('Paul Skenes');
    expect(cell?.position).toBe('SP');
  });
});

describe('describeBoardCell', () => {
  it('returns the hint when nothing is selected', () => {
    expect(describeBoardCell(null, '')).toContain('Tap a cell');
  });

  it('describes a filled cell', () => {
    const [cell] = buildBoardCells({
      teams: [TEAMS[0]],
      picks: [makePick()],
      currentPickInfo: null,
      myTeamId: null,
      statsLookup: new Map([[1, makePlayer()]]),
      rounds: 1,
    });

    expect(describeBoardCell(cell, 'Dinger Dynasty')).toBe(
      'R1 · Dinger Dynasty — Bobby Witt Jr. (SS)',
    );
  });

  it('distinguishes an on-the-clock cell from an upcoming one', () => {
    const cells = buildBoardCells({
      teams: TEAMS,
      picks: [],
      currentPickInfo: {
        draftId: 42,
        teamId: 1,
        round: 1,
        pickNumber: 1,
        overallPick: 1,
        isComplete: false,
      },
      myTeamId: null,
      statsLookup: new Map(),
      rounds: 1,
    });

    expect(describeBoardCell(cells[0], 'Dinger Dynasty')).toBe(
      'R1 · Dinger Dynasty — on the clock',
    );
    expect(describeBoardCell(cells[1], 'Bronx Bombers')).toBe(
      'R1 · Bronx Bombers — on deck',
    );
  });
});

describe('buildSquadSlots', () => {
  it('emits one slot per round, filled by the round the pick was made in', () => {
    const slots = buildSquadSlots({
      myPicks: [makePick({ round: 2, playerId: 1 })],
      statsLookup: new Map([[1, makePlayer()]]),
      rounds: 3,
    });

    expect(slots.map((s) => s.round)).toEqual([1, 2, 3]);
    expect(slots[0].player).toBeNull();
    expect(slots[1].player?.name).toBe('Bobby Witt Jr.');
    expect(slots[2].player).toBeNull();
  });

  it('leaves a slot empty when the drafted player is missing from the stats map', () => {
    const slots = buildSquadSlots({
      myPicks: [makePick({ playerId: 404 })],
      statsLookup: new Map(),
      rounds: 1,
    });

    expect(slots[0].player).toBeNull();
  });
});

describe('shortPlayerName', () => {
  it('returns the surname', () => {
    expect(shortPlayerName('Aaron Judge')).toBe('Judge');
  });

  it('skips generational suffixes', () => {
    expect(shortPlayerName('Bobby Witt Jr.')).toBe('Witt');
    expect(shortPlayerName('Ken Griffey III')).toBe('Griffey');
  });

  it('passes a single-word name through', () => {
    expect(shortPlayerName('Ichiro')).toBe('Ichiro');
  });
});

describe('describeSquadNeed', () => {
  it('prompts when no picks have been made', () => {
    expect(describeSquadNeed([])).toBe('Board is open — take best available');
  });

  it('summarises the roster by position, most-held first', () => {
    const summary = describeSquadNeed([
      makePlayer({ id: 1, position: 'OF' }),
      makePlayer({ id: 2, position: 'OF' }),
      makePlayer({ id: 3, position: 'SP', isPitcher: true }),
    ]);

    expect(summary).toBe('2×OF · 1×P');
  });
});

describe('statLineFor', () => {
  it('shows rate stats for hitters, with the leading zero dropped', () => {
    expect(statLineFor(makePlayer())).toBe('AVG .332 · HR 32 · RBI 96');
  });

  it('shows pitching stats for pitchers', () => {
    expect(
      statLineFor(
        makePlayer({
          isPitcher: true,
          era: 2.39,
          strikeouts: 228,
          wins: 18,
          losses: 4,
        }),
      ),
    ).toBe('ERA 2.39 · K 228 · W 18-4');
  });

  it('renders placeholders for a pitcher with no stat row', () => {
    expect(statLineFor(makePlayer({ isPitcher: true }))).toBe(
      'ERA — · K — · W 0-0',
    );
  });
});
