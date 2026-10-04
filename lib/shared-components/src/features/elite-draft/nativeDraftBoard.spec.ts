import {
  buildBoardCells,
  computeMyUpcomingPicks,
  describeBoardCell,
  formatClock,
  formatLastPickLine,
  initialsOf,
  isSnakeDraftOrder,
  MIN_BOARD_ROUNDS,
  pickInRoundForColumn,
  resolveBoardRounds,
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

describe('formatLastPickLine', () => {
  it('formats round.pick, player, position, and team', () => {
    const statsLookup = new Map([[1, makePlayer()]]);
    const line = formatLastPickLine(
      makePick({ round: 2, pickNumber: 5 }),
      statsLookup,
      'Bronx Bombers',
    );

    expect(line).toBe('2.5 — Bobby Witt Jr., SS (Bronx Bombers)');
  });

  it('falls back to the pick record player name and eligible position when the player is absent from statsLookup', () => {
    const line = formatLastPickLine(
      makePick({
        playerId: 99,
        player: {
          id: 99,
          firstName: 'Ace',
          lastName: 'Adams',
          eligiblePositions: ['SP'],
        },
      }),
      new Map(),
      'Dinger Dynasty',
    );

    expect(line).toBe('1.1 — Ace Adams, SP (Dinger Dynasty)');
  });

  it('falls back to a placeholder player name and position when neither source has data', () => {
    const line = formatLastPickLine(
      makePick({ playerId: 7 }),
      new Map(),
      'Dinger Dynasty',
    );

    expect(line).toBe('1.1 — Player #7, — (Dinger Dynasty)');
  });
});

describe('computeMyUpcomingPicks', () => {
  const currentPickInfo: CurrentDraftPickInfo = {
    draftId: 42,
    teamId: 1,
    round: 1,
    pickNumber: 1,
    overallPick: 1,
    isComplete: false,
  };

  it('returns my next two picks in snake order (round direction alternates)', () => {
    const picks = computeMyUpcomingPicks({
      currentPickInfo,
      teamCount: 4,
      myTeamIndex: 1,
      draftOrder: 'snake',
      count: 2,
    });

    expect(picks).toEqual([
      { round: 1, roundPickNumber: 2, overallPick: 2, picksUntil: 1 },
      { round: 2, roundPickNumber: 3, overallPick: 7, picksUntil: 6 },
    ]);
  });

  it('excludes the current pick even when it is mine', () => {
    const picks = computeMyUpcomingPicks({
      currentPickInfo: { ...currentPickInfo, teamId: 1, overallPick: 2 },
      teamCount: 4,
      myTeamIndex: 1,
      draftOrder: 'snake',
      count: 2,
    });

    expect(picks).toEqual([
      { round: 2, roundPickNumber: 3, overallPick: 7, picksUntil: 5 },
      { round: 3, roundPickNumber: 2, overallPick: 10, picksUntil: 8 },
    ]);
  });

  it('returns an empty list with no current pick, no teams, or an unresolved team index', () => {
    expect(
      computeMyUpcomingPicks({
        currentPickInfo: null,
        teamCount: 4,
        myTeamIndex: 1,
        draftOrder: 'snake',
      }),
    ).toEqual([]);
    expect(
      computeMyUpcomingPicks({
        currentPickInfo,
        teamCount: 0,
        myTeamIndex: 1,
        draftOrder: 'snake',
      }),
    ).toEqual([]);
    expect(
      computeMyUpcomingPicks({
        currentPickInfo,
        teamCount: 4,
        myTeamIndex: -1,
        draftOrder: 'snake',
      }),
    ).toEqual([]);
  });
});

describe('computeMyUpcomingPicks — draft order (LS-10569)', () => {
  const currentPickInfo: CurrentDraftPickInfo = {
    draftId: 42,
    teamId: 1,
    round: 1,
    pickNumber: 1,
    overallPick: 1,
    isComplete: false,
  };

  it('returns the real overall picks in a linear draft (same slot every round)', () => {
    const picks = computeMyUpcomingPicks({
      currentPickInfo,
      teamCount: 4,
      myTeamIndex: 1,
      draftOrder: 'linear',
      count: 3,
    });

    expect(picks).toEqual([
      { round: 1, roundPickNumber: 2, overallPick: 2, picksUntil: 1 },
      { round: 2, roundPickNumber: 2, overallPick: 6, picksUntil: 5 },
      { round: 3, roundPickNumber: 2, overallPick: 10, picksUntil: 9 },
    ]);
  });

  it.each(['snake', 'reverse_standings', null, undefined])(
    'keeps snake order for a %s draft',
    (draftOrder) => {
      const picks = computeMyUpcomingPicks({
        currentPickInfo,
        teamCount: 4,
        myTeamIndex: 1,
        draftOrder,
        count: 2,
      });

      expect(picks.map((p) => p.overallPick)).toEqual([2, 7]);
    },
  );
});

describe('pickInRoundForColumn', () => {
  const at = (round: number, columnIndex: number, draftOrder: string | null) =>
    pickInRoundForColumn({ round, columnIndex, teamCount: 8, draftOrder });

  it('runs left-to-right on odd rounds in either order', () => {
    expect(at(1, 0, 'snake')).toBe(1);
    expect(at(1, 7, 'snake')).toBe(8);
    expect(at(1, 0, 'linear')).toBe(1);
    expect(at(1, 7, 'linear')).toBe(8);
  });

  it('reverses on even rounds in a snake draft', () => {
    expect(at(2, 0, 'snake')).toBe(8);
    expect(at(2, 7, 'snake')).toBe(1);
  });

  it('never reverses in a linear draft (LS-10506)', () => {
    expect(at(2, 0, 'linear')).toBe(1);
    expect(at(2, 7, 'linear')).toBe(8);
    expect(at(4, 3, 'linear')).toBe(4);
  });

  it('snakes reverse-standings and unloaded orders, like the server', () => {
    expect(at(2, 0, 'reverse_standings')).toBe(8);
    expect(at(2, 0, null)).toBe(8);
  });
});

describe('isSnakeDraftOrder', () => {
  it('is false only for linear', () => {
    expect(isSnakeDraftOrder('linear')).toBe(false);
    expect(isSnakeDraftOrder('snake')).toBe(true);
    expect(isSnakeDraftOrder('reverse_standings')).toBe(true);
    expect(isSnakeDraftOrder(null)).toBe(true);
    expect(isSnakeDraftOrder(undefined)).toBe(true);
  });
});
