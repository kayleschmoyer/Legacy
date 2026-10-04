import {
  buildTimelineRounds,
  defaultOpenRound,
  timelinePickMeta,
} from './draftTimeline';
import type {
  CurrentDraftPickInfo,
  DraftPickRecord,
  DraftPlayer,
  LeagueTeam,
} from './types';

const team = (id: string, name: string): LeagueTeam => ({
  id,
  name,
  leagueId: 1,
});

const TEAMS: LeagueTeam[] = [
  team('1', 'Bronx Bombers'),
  team('2', 'Sandlot Swingers'),
  team('3', 'Chi Town'),
];

const pick = (overrides: Partial<DraftPickRecord> = {}): DraftPickRecord => ({
  id: '1',
  draftId: 1,
  round: 1,
  pickNumber: 1,
  overallPick: 1,
  pickedAt: '2026-01-01T00:00:00.000Z',
  teamId: 1,
  playerId: 1,
  ...overrides,
});

const player = (id: number, name: string, position: string): DraftPlayer =>
  ({ id, name, position }) as DraftPlayer;

const onClock = (
  overrides: Partial<CurrentDraftPickInfo> = {},
): CurrentDraftPickInfo => ({
  draftId: 1,
  teamId: 1,
  round: 1,
  pickNumber: 1,
  overallPick: 1,
  isComplete: false,
  ...overrides,
});

describe('buildTimelineRounds — time ordering (LS-10003)', () => {
  it('orders rounds newest first and picks within a round forwards', () => {
    const rounds = buildTimelineRounds({
      teams: TEAMS,
      picks: [pick({ round: 2, teamId: 3, overallPick: 4, playerId: 1 })],
      currentPickInfo: onClock({ round: 2, teamId: 2, pickNumber: 2 }),
      myTeamId: null,
      draftOrder: 'snake',
      statsLookup: new Map(),
    });

    expect(rounds.map((r) => r.round)).toEqual([2, 1]);
    // Round 1 is odd: teams left to right.
    expect(rounds[1].picks.map((p) => p.teamId)).toEqual(['1', '2', '3']);
    // Round 2 snakes back.
    expect(rounds[0].picks.map((p) => p.teamId)).toEqual(['3', '2', '1']);
    expect(rounds[0].picks.map((p) => p.pickInRound)).toEqual([1, 2, 3]);
  });

  it('does not render future rounds past the one on the clock', () => {
    const rounds = buildTimelineRounds({
      teams: TEAMS,
      picks: [],
      currentPickInfo: onClock({ round: 2, pickNumber: 1 }),
      myTeamId: null,
      draftOrder: 'snake',
      statsLookup: new Map(),
    });

    expect(rounds.map((r) => r.round)).toEqual([2, 1]);
  });

  it('still renders round 1 for a draft with no picks and no clock', () => {
    const rounds = buildTimelineRounds({
      teams: TEAMS,
      picks: [],
      currentPickInfo: null,
      myTeamId: null,
      draftOrder: 'snake',
      statsLookup: new Map(),
    });

    expect(rounds).toHaveLength(1);
    expect(rounds[0].round).toBe(1);
    expect(rounds[0].madeCount).toBe(0);
    expect(rounds[0].picks.every((p) => p.state === 'up')).toBe(true);
  });

  it('returns nothing when the league has no teams', () => {
    expect(
      buildTimelineRounds({
        teams: [],
        picks: [pick()],
        currentPickInfo: null,
        myTeamId: null,
        draftOrder: 'snake',
        statsLookup: new Map(),
      }),
    ).toEqual([]);
  });
});

describe('buildTimelineRounds — pick states (LS-10003)', () => {
  const rounds = buildTimelineRounds({
    teams: TEAMS,
    picks: [pick({ round: 1, teamId: 1, overallPick: 1, playerId: 7 })],
    currentPickInfo: onClock({ teamId: 2, pickNumber: 2, overallPick: 2 }),
    myTeamId: 2,
    draftOrder: 'snake',
    statsLookup: new Map([[7, player(7, 'Rod Carew', '2B')]]),
  });
  const [made, now, up] = rounds[0].picks;

  it('marks a completed pick `made` and carries its player and position', () => {
    expect(made.state).toBe('made');
    expect(made.playerName).toBe('Rod Carew');
    expect(made.position).toBe('2B');
  });

  it('marks the team on the clock `now`, distinct from upcoming picks', () => {
    expect(now.state).toBe('now');
    expect(now.teamId).toBe('2');
    expect(up.state).toBe('up');
    expect(now.state).not.toBe(up.state);
  });

  it('flags the viewer’s own slots', () => {
    expect(now.isMine).toBe(true);
    expect(made.isMine).toBe(false);
  });

  it('counts made picks against the round total', () => {
    expect(rounds[0].madeCount).toBe(1);
    expect(rounds[0].totalCount).toBe(3);
  });

  it('carries the team monogram for the row rail', () => {
    expect(made.monogram).toBe('BB');
  });
});

describe('buildTimelineRounds — data fidelity (LS-10003)', () => {
  it('keeps a traded slot on the team that actually made the pick', () => {
    // Team 3 picks in round 1 slot 2 — the slot team 2 would hold by snake
    // order. Matching on round+teamId (not recomputed snake math) must not
    // drop the pick.
    const rounds = buildTimelineRounds({
      teams: TEAMS,
      picks: [pick({ round: 1, teamId: 3, overallPick: 2, playerId: 9 })],
      currentPickInfo: null,
      myTeamId: null,
      draftOrder: 'snake',
      statsLookup: new Map([[9, player(9, 'Tony Gwynn', 'OF')]]),
    });

    const traded = rounds[0].picks.find((p) => p.teamId === '3');
    expect(traded?.playerName).toBe('Tony Gwynn');
    // The record's own overall number wins over the computed slot number.
    expect(traded?.overallPick).toBe(2);
  });

  it('falls back to the pick record’s player name when stats are missing', () => {
    const rounds = buildTimelineRounds({
      teams: TEAMS,
      picks: [
        pick({
          round: 1,
          teamId: 1,
          playerId: 5,
          player: {
            id: 5,
            firstName: 'Wade',
            lastName: 'Boggs',
            eligiblePositions: ['3B'],
          },
        }),
      ],
      currentPickInfo: null,
      myTeamId: null,
      draftOrder: 'snake',
      statsLookup: new Map(),
    });

    expect(rounds[0].picks[0].playerName).toBe('Wade Boggs');
    expect(rounds[0].picks[0].position).toBe('3B');
  });

  it('computes an overall pick number for slots nobody has taken', () => {
    const rounds = buildTimelineRounds({
      teams: TEAMS,
      picks: [],
      currentPickInfo: onClock({ round: 2, pickNumber: 1 }),
      myTeamId: null,
      draftOrder: 'snake',
      statsLookup: new Map(),
    });

    // Round 2 slot 1 is overall pick 4 on a 3-team board.
    expect(rounds[0].picks[0].overallPick).toBe(4);
  });

  it('treats a completed draft as having no pick on the clock', () => {
    const rounds = buildTimelineRounds({
      teams: TEAMS,
      picks: [pick({ round: 1, teamId: 1, playerId: 1 })],
      currentPickInfo: onClock({ isComplete: true }),
      myTeamId: null,
      draftOrder: 'snake',
      statsLookup: new Map(),
    });

    expect(rounds.some((r) => r.isCurrent)).toBe(false);
    expect(rounds[0].picks.some((p) => p.state === 'now')).toBe(false);
  });
});

describe('buildTimelineRounds — draft order (LS-10569)', () => {
  const build = (draftOrder: string | null) =>
    buildTimelineRounds({
      teams: TEAMS,
      picks: [pick({ round: 2, teamId: 1, overallPick: 4, playerId: 1 })],
      currentPickInfo: onClock({ round: 2, teamId: 2, pickNumber: 2 }),
      myTeamId: null,
      statsLookup: new Map(),
      draftOrder,
    });

  it('lists a linear draft’s even rounds in board order', () => {
    const [round2, round1] = build('linear');

    expect(round1.picks.map((p) => p.teamId)).toEqual(['1', '2', '3']);
    expect(round2.picks.map((p) => p.teamId)).toEqual(['1', '2', '3']);
    expect(round2.picks.map((p) => p.pickInRound)).toEqual([1, 2, 3]);
    // Round 2 on a 3-team linear board is overall picks 4–6, team 1 first.
    expect(round2.picks.map((p) => p.overallPick)).toEqual([4, 5, 6]);
    expect(round2.picks.map((p) => p.state)).toEqual(['made', 'now', 'up']);
  });

  it.each(['snake', 'reverse_standings', null])(
    'reverses even rounds for a %s draft',
    (draftOrder) => {
      const [round2] = build(draftOrder);

      expect(round2.picks.map((p) => p.teamId)).toEqual(['3', '2', '1']);
      expect(round2.picks.map((p) => p.pickInRound)).toEqual([1, 2, 3]);
    },
  );
});

describe('defaultOpenRound (LS-10003)', () => {
  it('opens the round on the clock', () => {
    const rounds = buildTimelineRounds({
      teams: TEAMS,
      picks: [],
      currentPickInfo: onClock({ round: 2, pickNumber: 1 }),
      myTeamId: null,
      draftOrder: 'snake',
      statsLookup: new Map(),
    });

    expect(defaultOpenRound(rounds)).toBe(2);
  });

  it('opens the newest round when the draft is over', () => {
    const rounds = buildTimelineRounds({
      teams: TEAMS,
      picks: [pick({ round: 2, teamId: 1, playerId: 1 })],
      currentPickInfo: onClock({ isComplete: true }),
      myTeamId: null,
      draftOrder: 'snake',
      statsLookup: new Map(),
    });

    expect(defaultOpenRound(rounds)).toBe(2);
  });

  it('returns null when there is nothing to open', () => {
    expect(defaultOpenRound([])).toBeNull();
  });
});

describe('timelinePickMeta (LS-10003)', () => {
  const base = buildTimelineRounds({
    teams: TEAMS,
    picks: [pick({ round: 1, teamId: 1, playerId: 7 })],
    currentPickInfo: null,
    myTeamId: null,
    draftOrder: 'snake',
    statsLookup: new Map([[7, player(7, 'Rod Carew', '2B')]]),
  })[0].picks;

  it('reads `POS · Team` for a completed pick', () => {
    expect(timelinePickMeta(base[0])).toBe('2B · Bronx Bombers');
  });

  it('omits the position rather than printing a placeholder', () => {
    expect(timelinePickMeta(base[1])).toBe('Sandlot Swingers');
  });
});
