import type { BoardCell } from './nativeDraftBoard';
import {
  buildRoundSummary,
  buildRoundTiles,
  cellsForRound,
  describeRoundTile,
  resolveInitialRound,
  resolveRoundTabState,
  type RoundTile,
} from './roundBoard';
import type { DraftPickRecord, DraftPlayer, LeagueTeam } from './types';

const teams: LeagueTeam[] = [
  { id: '1', name: 'Dinger Dynasty', leagueId: 1 },
  { id: '2', name: 'Bronx Bombers', leagueId: 1 },
  { id: '3', name: 'Bay Bashers', leagueId: 1 },
];

function makePick(overrides: Partial<DraftPickRecord> = {}): DraftPickRecord {
  return {
    id: '1',
    draftId: 1,
    round: 1,
    pickNumber: 1,
    overallPick: 1,
    pickedAt: '2026-01-01T00:00:00.000Z',
    teamId: 1,
    playerId: 1,
    ...overrides,
  };
}

function cell(overrides: Partial<BoardCell> = {}): BoardCell {
  return {
    key: '1-1',
    round: 1,
    teamId: '1',
    pick: null,
    position: null,
    playerName: null,
    isCurrent: false,
    isMine: false,
    ...overrides,
  };
}

describe('cellsForRound', () => {
  const cells = [
    cell({ key: '1-1', round: 1, teamId: '1' }),
    cell({ key: '1-2', round: 1, teamId: '2' }),
    cell({ key: '1-3', round: 1, teamId: '3' }),
    cell({ key: '2-1', round: 2, teamId: '1' }),
    cell({ key: '2-2', round: 2, teamId: '2' }),
    cell({ key: '2-3', round: 2, teamId: '3' }),
  ];

  it('slices the row-major cell list down to one round', () => {
    expect(cellsForRound({ cells, round: 2, teamCount: 3 }).map((c) => c.key)) //
      .toEqual(['2-1', '2-2', '2-3']);
  });

  it('returns an empty list for a round beyond the built range', () => {
    expect(cellsForRound({ cells, round: 3, teamCount: 3 })).toEqual([]);
  });

  it('returns an empty list when there are no teams', () => {
    expect(cellsForRound({ cells, round: 1, teamCount: 0 })).toEqual([]);
  });
});

describe('buildRoundTiles', () => {
  const statsLookup = new Map<number, DraftPlayer>();

  function tilesFor(cells: BoardCell[], round = 1) {
    return buildRoundTiles({ cells, teams, round, statsLookup });
  }

  it('marks a completed pick by another team as drafted', () => {
    const [tile] = tilesFor([
      cell({
        pick: makePick({ pickNumber: 2 }),
        position: 'OF',
        playerName: 'Willie Mays',
      }),
    ]);

    expect(tile.state).toBe('drafted');
    expect(tile.playerName).toBe('Willie Mays');
    expect(tile.position).toBe('OF');
    expect(tile.pickLabel).toBe('1.02');
    expect(tile.isMine).toBe(false);
  });

  it("marks the viewer's own completed pick as mine", () => {
    const [tile] = tilesFor([
      cell({
        pick: makePick(),
        position: 'SS',
        playerName: 'Ozzie Smith',
        isMine: true,
      }),
    ]);

    expect(tile.state).toBe('mine');
    expect(tile.isMine).toBe(true);
  });

  it('marks the pick on the clock as on-the-clock, over mine', () => {
    const [tile] = tilesFor([cell({ isCurrent: true, isMine: true })]);

    expect(tile.state).toBe('on-the-clock');
    // Ownership survives the state collapse — it still drives the ★ prefix.
    expect(tile.isMine).toBe(true);
    expect(tile.playerName).toBeNull();
  });

  it('marks an unfilled, unclocked slot as upcoming', () => {
    const [tile] = tilesFor([cell()]);

    expect(tile.state).toBe('upcoming');
    expect(tile.playerName).toBeNull();
    expect(tile.position).toBeNull();
  });

  it('numbers unfilled tiles by snake order — odd rounds ascend', () => {
    const cells = teams.map((team) =>
      cell({ key: `1-${team.id}`, teamId: team.id, round: 1 }),
    );

    expect(tilesFor(cells, 1).map((t) => t.pickLabel)) //
      .toEqual(['1.01', '1.02', '1.03']);
  });

  it('numbers unfilled tiles by snake order — even rounds reverse', () => {
    const cells = teams.map((team) =>
      cell({ key: `2-${team.id}`, teamId: team.id, round: 2 }),
    );

    expect(tilesFor(cells, 2).map((t) => t.pickLabel)) //
      .toEqual(['2.03', '2.02', '2.01']);
  });

  it('resolves the team name from the roster, not the raw id', () => {
    const [tile] = tilesFor([cell({ teamId: '2' })]);
    expect(tile.teamName).toBe('Bronx Bombers');
  });

  it('prefers the stats-lookup club and falls back to the pick record', () => {
    const lookup = new Map<number, DraftPlayer>([
      [7, { club: 'NYY' } as unknown as DraftPlayer],
    ]);

    const [fromLookup] = buildRoundTiles({
      cells: [
        cell({ pick: makePick({ playerId: 7 }), playerName: 'Babe Ruth' }),
      ],
      teams,
      round: 1,
      statsLookup: lookup,
    });
    expect(fromLookup.club).toBe('NYY');

    const [fromRecord] = buildRoundTiles({
      cells: [
        cell({
          pick: makePick({
            playerId: 99,
            player: {
              id: 99,
              firstName: 'Hank',
              lastName: 'Aaron',
              club: 'ATL',
            },
          }),
          playerName: 'Hank Aaron',
        }),
      ],
      teams,
      round: 1,
      statsLookup: lookup,
    });
    expect(fromRecord.club).toBe('ATL');
  });

  it('leaves club null rather than fabricating one when none is on file', () => {
    const [tile] = tilesFor([
      cell({ pick: makePick(), playerName: 'Nobody Known' }),
    ]);
    expect(tile.club).toBeNull();
  });
});

describe('buildRoundSummary', () => {
  it('counts progress and the overall-pick range', () => {
    const summary = buildRoundSummary({
      cells: [
        cell({ pick: makePick(), position: 'OF' }),
        cell({ pick: makePick(), position: 'OF' }),
        cell(),
      ],
      round: 3,
      teamCount: 3,
      currentRound: 3,
    });

    expect(summary.picksMade).toBe(2);
    expect(summary.totalPicks).toBe(3);
    expect(summary.rangeLabel).toBe('#7–9');
  });

  it('orders the position mix most-drafted first, ties alphabetical', () => {
    const summary = buildRoundSummary({
      cells: [
        cell({ pick: makePick(), position: 'SS' }),
        cell({ pick: makePick(), position: 'OF' }),
        cell({ pick: makePick(), position: 'OF' }),
        cell({ pick: makePick(), position: 'C' }),
      ],
      round: 1,
      teamCount: 4,
      currentRound: 1,
    });

    expect(summary.mix).toEqual([
      { position: 'OF', count: 2 },
      { position: 'C', count: 1 },
      { position: 'SS', count: 1 },
    ]);
  });

  it('reports snake direction — odd left to right, even right to left', () => {
    const args = { cells: [], teamCount: 3, currentRound: 9 };
    expect(buildRoundSummary({ ...args, round: 1 }).snakeDirection).toBe(
      'left-to-right',
    );
    expect(buildRoundSummary({ ...args, round: 2 }).snakeDirection).toBe(
      'right-to-left',
    );
  });

  it('treats the round on the clock as started even with no picks in yet', () => {
    const summary = buildRoundSummary({
      cells: [cell({ isCurrent: true })],
      round: 4,
      teamCount: 3,
      currentRound: 4,
    });

    expect(summary.hasStarted).toBe(true);
    expect(summary.unlocksAfterRound).toBeNull();
  });

  it('reports a future, empty round as not started and names its predecessor', () => {
    const summary = buildRoundSummary({
      cells: [cell(), cell(), cell()],
      round: 6,
      teamCount: 3,
      currentRound: 4,
    });

    expect(summary.hasStarted).toBe(false);
    expect(summary.unlocksAfterRound).toBe(5);
    expect(summary.mix).toEqual([]);
  });

  it('never reports a predecessor for round 1', () => {
    const summary = buildRoundSummary({
      cells: [cell()],
      round: 1,
      teamCount: 3,
      currentRound: null,
    });
    expect(summary.unlocksAfterRound).toBeNull();
  });

  it('treats a round carrying picks as started even once the clock has passed it', () => {
    const summary = buildRoundSummary({
      cells: [cell({ pick: makePick(), position: 'P' })],
      round: 2,
      teamCount: 3,
      currentRound: null,
    });
    expect(summary.hasStarted).toBe(true);
  });
});

describe('resolveRoundTabState', () => {
  it('marks the selected round active', () => {
    expect(
      resolveRoundTabState({
        round: 4,
        activeRound: 4,
        picksMade: 0,
        teamCount: 12,
      }),
    ).toBe('active');
  });

  it('marks a fully-drafted round done', () => {
    expect(
      resolveRoundTabState({
        round: 1,
        activeRound: 4,
        picksMade: 12,
        teamCount: 12,
      }),
    ).toBe('done');
  });

  it('leaves a partially-drafted earlier round upcoming, not done', () => {
    expect(
      resolveRoundTabState({
        round: 1,
        activeRound: 4,
        picksMade: 11,
        teamCount: 12,
      }),
    ).toBe('upcoming');
  });
});

describe('resolveInitialRound', () => {
  it('opens on the round currently on the clock', () => {
    expect(
      resolveInitialRound({ currentRound: 7, maxPickRound: 6, rounds: 12 }),
    ).toBe(7);
  });

  it('falls back to the last round carrying a pick when the draft is over', () => {
    expect(
      resolveInitialRound({ currentRound: null, maxPickRound: 12, rounds: 12 }),
    ).toBe(12);
  });

  it('falls back to round 1 for a draft that has not started', () => {
    expect(
      resolveInitialRound({ currentRound: null, maxPickRound: 0, rounds: 12 }),
    ).toBe(1);
  });

  it('clamps a current round beyond the rendered range', () => {
    expect(
      resolveInitialRound({ currentRound: 40, maxPickRound: 0, rounds: 12 }),
    ).toBe(12);
  });
});

describe('describeRoundTile', () => {
  function tile(overrides: Partial<RoundTile> = {}): RoundTile {
    return {
      key: '1-1',
      teamId: '1',
      teamName: 'Bronx Bombers',
      isMine: false,
      state: 'upcoming',
      pickLabel: '1.02',
      playerName: null,
      position: null,
      club: null,
      ...overrides,
    };
  }

  it('describes a drafted tile with its player and position', () => {
    expect(
      describeRoundTile(
        tile({ state: 'drafted', playerName: 'Willie Mays', position: 'OF' }),
      ),
    ).toBe('Bronx Bombers, pick 1.02, Willie Mays, OF');
  });

  it("flags the viewer's own completed pick", () => {
    expect(
      describeRoundTile(
        tile({ state: 'mine', playerName: 'Ozzie Smith', position: 'SS' }),
      ),
    ).toBe('Bronx Bombers, pick 1.02, Ozzie Smith, SS — your pick');
  });

  it('distinguishes the viewer being on the clock from another team', () => {
    expect(
      describeRoundTile(tile({ state: 'on-the-clock', isMine: true })),
    ).toBe('Bronx Bombers, pick 1.02, your pick — on the clock');
    expect(describeRoundTile(tile({ state: 'on-the-clock' }))).toBe(
      'Bronx Bombers, pick 1.02, on the clock',
    );
  });

  it('describes an upcoming tile', () => {
    expect(describeRoundTile(tile())).toBe(
      'Bronx Bombers, pick 1.02, upcoming',
    );
  });

  it('omits the position clause when none is known', () => {
    expect(
      describeRoundTile(tile({ state: 'drafted', playerName: 'Cy Young' })),
    ).toBe('Bronx Bombers, pick 1.02, Cy Young');
  });
});
