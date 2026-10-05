/**
 * usePlayerData — projectedMatchupPoints → ppg mapping (LS-7976)
 *
 * Verifies that enrichedPlayers[].ppg is sourced from
 * ap.projectedMatchupPoints (not the old per-game hitter/pitcher split)
 * for the four key scenarios: hitter, pitcher, null, and zero.
 */

import { renderHook } from '@testing-library/react';
import { usePlayerData } from './usePlayerData';
import type {
  AvailableDraftPlayer,
  DraftPickRecord,
  PlayerFootballStatsEntry,
  PlayerStatsEntry,
} from '../types';

type PitchingStats = {
  wins: number;
  losses: number;
  era: number;
  strikeouts: number;
  saves: number;
  games: number;
  gamesStarted: number;
  whip: number;
  winPct: number;
};

function makeAvailablePlayer(
  overrides: Partial<AvailableDraftPlayer> = {},
): AvailableDraftPlayer {
  return {
    id: 1,
    firstName: 'Test',
    lastName: 'Player',
    brefId: 'testpl01',
    eligiblePositions: ['1B'],
    hitterAvgPointsPerGame: 2.0,
    pitchingAvgPointsPerGame: null,
    projectedMatchupPoints: null,
    ...overrides,
  };
}

const emptyPickHistory: DraftPickRecord[] = [];
const emptyStatsMap = new Map<number, PlayerStatsEntry>();
const emptyPitchingMap = new Map<number, PitchingStats>();

function renderPlayerData(availablePlayers: AvailableDraftPlayer[]) {
  return renderHook(() =>
    usePlayerData({
      availablePlayers,
      pickHistory: emptyPickHistory,
      playerStatsMap: emptyStatsMap,
      pitchingStatsMap: emptyPitchingMap,
      myTeamId: null,
    }),
  );
}

describe('usePlayerData — ppg sourced from projectedMatchupPoints', () => {
  it('sets ppg to projectedMatchupPoints for a hitter', () => {
    const { result } = renderPlayerData([
      makeAvailablePlayer({ projectedMatchupPoints: 12.5 }),
    ]);
    expect(result.current.enrichedPlayers[0].ppg).toBe(12.5);
  });

  it('sets ppg to projectedMatchupPoints for a pitcher (SP)', () => {
    const { result } = renderPlayerData([
      makeAvailablePlayer({
        eligiblePositions: ['SP'],
        hitterAvgPointsPerGame: null,
        pitchingAvgPointsPerGame: 3.0,
        projectedMatchupPoints: 3.0,
      }),
    ]);
    expect(result.current.enrichedPlayers[0].ppg).toBe(3.0);
  });

  it('sets ppg to null when projectedMatchupPoints is null', () => {
    const { result } = renderPlayerData([
      makeAvailablePlayer({ projectedMatchupPoints: null }),
    ]);
    expect(result.current.enrichedPlayers[0].ppg).toBeNull();
  });

  it('sets ppg to 0 when projectedMatchupPoints is 0', () => {
    const { result } = renderPlayerData([
      makeAvailablePlayer({ projectedMatchupPoints: 0 }),
    ]);
    // 0 ?? null === 0 (nullish coalescing does not replace 0)
    expect(result.current.enrichedPlayers[0].ppg).toBe(0);
  });

  it('does not use hitterAvgPointsPerGame or pitchingAvgPointsPerGame directly', () => {
    // Both legacy fields set to non-null values; projectedMatchupPoints wins
    const { result } = renderPlayerData([
      makeAvailablePlayer({
        hitterAvgPointsPerGame: 5.0,
        pitchingAvgPointsPerGame: 4.0,
        projectedMatchupPoints: 20.0,
      }),
    ]);
    expect(result.current.enrichedPlayers[0].ppg).toBe(20.0);
  });
});

/**
 * usePlayerData — ppg survives a player being drafted (LS-10473)
 *
 * The server removes a player from availablePlayers as soon as they are
 * drafted, and availablePlayers is the only source of projectedMatchupPoints.
 * The draft recap's PROJ PTS card sums myTeam[].ppg, so if the projection is
 * dropped along with the player, the total reads 0.0 once the draft is done.
 */
describe('usePlayerData — ppg retained for drafted players (LS-10473)', () => {
  const MY_TEAM_ID = 7;

  function makePick(
    playerId: number,
    overallPick: number,
    teamId = MY_TEAM_ID,
  ): DraftPickRecord {
    return {
      id: `pick-${overallPick}`,
      draftId: 1,
      round: 1,
      pickNumber: overallPick,
      overallPick,
      pickedAt: '2026-10-03T20:00:00.000Z',
      teamId,
      playerId,
      player: {
        id: playerId,
        firstName: 'Drafted',
        lastName: `Player${playerId}`,
        eligiblePositions: ['SS'],
      },
    };
  }

  function renderDraft(initial: {
    availablePlayers: AvailableDraftPlayer[];
    pickHistory: DraftPickRecord[];
  }) {
    return renderHook(
      (props: {
        availablePlayers: AvailableDraftPlayer[];
        pickHistory: DraftPickRecord[];
      }) =>
        usePlayerData({
          ...props,
          playerStatsMap: emptyStatsMap,
          pitchingStatsMap: emptyPitchingMap,
          myTeamId: MY_TEAM_ID,
        }),
      { initialProps: initial },
    );
  }

  it("keeps a drafted player's projection after they leave availablePlayers", () => {
    const shortstop = makeAvailablePlayer({
      id: 10,
      eligiblePositions: ['SS'],
      projectedMatchupPoints: 14.5,
    });
    const pitcher = makeAvailablePlayer({
      id: 11,
      eligiblePositions: ['SP'],
      projectedMatchupPoints: 6.25,
    });
    const { result, rerender } = renderDraft({
      availablePlayers: [shortstop, pitcher],
      pickHistory: [],
    });

    // Both drafted: the server list no longer contains either of them.
    rerender({
      availablePlayers: [],
      pickHistory: [makePick(10, 1), makePick(11, 2)],
    });

    expect(result.current.myTeam.map((p) => p.ppg)).toEqual([14.5, 6.25]);
    expect(result.current.statsLookup.get(10)?.ppg).toBe(14.5);
    // The recap's PROJ PTS total (DraftRoomRecap sums myTeam[].ppg).
    const projPts = result.current.myTeam.reduce(
      (sum, p) => sum + (p.ppg ?? 0),
      0,
    );
    expect(projPts).toBeCloseTo(20.75);
  });

  it('retains the projection for players loaded on an earlier page or filter', () => {
    const { result, rerender } = renderDraft({
      availablePlayers: [
        makeAvailablePlayer({ id: 20, projectedMatchupPoints: 9 }),
      ],
      pickHistory: [],
    });
    // A different page/filter replaces the list without player 20...
    rerender({
      availablePlayers: [
        makeAvailablePlayer({ id: 21, projectedMatchupPoints: 3 }),
      ],
      pickHistory: [],
    });
    // ...and then player 20 is drafted.
    rerender({
      availablePlayers: [
        makeAvailablePlayer({ id: 21, projectedMatchupPoints: 3 }),
      ],
      pickHistory: [makePick(20, 1)],
    });
    expect(result.current.myTeam[0].ppg).toBe(9);
  });

  it('leaves ppg undefined for a drafted player whose projection was never loaded', () => {
    // No fabricated 0 — the player simply has no projection on file here.
    const { result } = renderDraft({
      availablePlayers: [],
      pickHistory: [makePick(30, 1)],
    });
    expect(result.current.myTeam[0].ppg).toBeUndefined();
  });

  it("uses the pick's server projection for players drafted before the client loaded (LS-10595)", () => {
    // Cold load mid-draft: the player was never in availablePlayers this
    // session, so the only source of his projection is the pick itself.
    const { result } = renderDraft({
      availablePlayers: [],
      pickHistory: [
        { ...makePick(40, 1), projectedMatchupPoints: 12.4 },
        { ...makePick(41, 2), projectedMatchupPoints: null },
      ],
    });
    expect(result.current.statsLookup.get(40)?.ppg).toBe(12.4);
    // A null server projection stays absent rather than becoming 0.
    expect(result.current.statsLookup.get(41)?.ppg).toBeUndefined();
  });

  it('prefers the projection last seen on the board over the pick value', () => {
    const { result, rerender } = renderDraft({
      availablePlayers: [
        makeAvailablePlayer({ id: 50, projectedMatchupPoints: 8 }),
      ],
      pickHistory: [],
    });
    rerender({
      availablePlayers: [],
      pickHistory: [{ ...makePick(50, 1), projectedMatchupPoints: 8.5 }],
    });
    expect(result.current.statsLookup.get(50)?.ppg).toBe(8);
  });
});

/**
 * usePlayerData — football stat fields (LS-9478)
 *
 * The bug this ticket exists to avoid repeating (LS-9473): `?? 0` on an
 * unmeasured stat renders as a fabricated measurement (e.g. a QB reading
 * `AVG .000`). These tests assert the football fields stay `undefined` —
 * never default to 0 — whenever the player has no row in footballStatsMap,
 * and are exclusively populated (never leak into a baseball board's
 * players even if the map happens to have an entry for that id).
 */
describe('usePlayerData — football stat fields (LS-9478)', () => {
  function renderFootball(
    availablePlayers: AvailableDraftPlayer[],
    footballStatsMap: Map<number, PlayerFootballStatsEntry>,
    sport: 'baseball' | 'football' = 'football',
  ) {
    return renderHook(() =>
      usePlayerData({
        availablePlayers,
        pickHistory: emptyPickHistory,
        playerStatsMap: emptyStatsMap,
        pitchingStatsMap: emptyPitchingMap,
        myTeamId: null,
        sport,
        footballStatsMap,
      }),
    );
  }

  it('populates passYds/rushYds/rec/fg from footballStatsMap for a football player', () => {
    const map = new Map<number, PlayerFootballStatsEntry>([
      [
        1,
        {
          playerId: 1,
          passYds: 4300,
          passTd: 32,
          rushYds: 210,
          rushTd: 2,
          rec: undefined,
          recTd: undefined,
          fg: undefined,
        },
      ],
    ]);
    const { result } = renderFootball([makeAvailablePlayer()], map);
    const player = result.current.enrichedPlayers[0];
    expect(player.passYds).toBe(4300);
    expect(player.passTd).toBe(32);
    expect(player.rushYds).toBe(210);
    expect(player.rec).toBeUndefined();
    expect(player.fg).toBeUndefined();
  });

  it('sums td as rushTd + recTd, excluding passTd', () => {
    const map = new Map<number, PlayerFootballStatsEntry>([
      [1, { playerId: 1, passTd: 30, rushTd: 3, recTd: 1 }],
    ]);
    const { result } = renderFootball([makeAvailablePlayer()], map);
    // 3 + 1 = 4, NOT 3 + 1 + 30 — passing TDs are already implied by
    // passYds for QBs and are intentionally excluded from the board's
    // generic TD column (LS-9478 field-mapping decision).
    expect(result.current.enrichedPlayers[0].td).toBe(4);
  });

  it('leaves td undefined (not 0) when the player has neither a rushing nor a receiving row', () => {
    const map = new Map<number, PlayerFootballStatsEntry>([
      [1, { playerId: 1, passYds: 4300, passTd: 32 }],
    ]);
    const { result } = renderFootball([makeAvailablePlayer()], map);
    expect(result.current.enrichedPlayers[0].td).toBeUndefined();
  });

  it('sums td to a real 0 when both rushTd and recTd are a measured 0 (not undefined)', () => {
    // Distinguishes "measured zero touchdowns" from "never measured" — the
    // player has real rushing/receiving rows, just with 0 TDs on them.
    const map = new Map<number, PlayerFootballStatsEntry>([
      [1, { playerId: 1, rushYds: 40, rushTd: 0, rec: 3, recTd: 0 }],
    ]);
    const { result } = renderFootball([makeAvailablePlayer()], map);
    expect(result.current.enrichedPlayers[0].td).toBe(0);
  });

  it('leaves every football field undefined for a player absent from footballStatsMap', () => {
    const emptyFootballMap = new Map<number, PlayerFootballStatsEntry>();
    const { result } = renderFootball(
      [makeAvailablePlayer({ id: 99 })],
      emptyFootballMap,
    );
    const player = result.current.enrichedPlayers[0];
    expect(player.passYds).toBeUndefined();
    expect(player.rushYds).toBeUndefined();
    expect(player.rec).toBeUndefined();
    expect(player.td).toBeUndefined();
    expect(player.fg).toBeUndefined();
  });

  it('never populates football fields on a baseball board, even if footballStatsMap has a matching entry', () => {
    // Exclusive assertion: sport is the gate, not merely "is this id in the
    // map". A stale/leftover footballStatsMap entry must not leak through
    // once the board is rendering baseball.
    const map = new Map<number, PlayerFootballStatsEntry>([
      [1, { playerId: 1, passYds: 4300, rushTd: 2, recTd: 1 }],
    ]);
    const { result } = renderFootball([makeAvailablePlayer()], map, 'baseball');
    const player = result.current.enrichedPlayers[0];
    expect(player.passYds).toBeUndefined();
    expect(player.td).toBeUndefined();
  });
});

/**
 * usePlayerData — completed-draft pitcher cards (LS-10508)
 *
 * Once a draft completes every drafted player has left availablePlayers, so
 * the "Your Roster" result cards come from statsLookup's playerStatsMap seed
 * and pick-history add/patch paths. Those paths must flag pitchers
 * (isPitcher) and carry the same pitching line the live card showed, or
 * BaseballCard renders an all-zero batting summary for e.g. Greg Maddux.
 */
describe('usePlayerData — completed-draft pitcher cards (LS-10508)', () => {
  const MY_TEAM_ID = 3;

  const STAT_FIELDS = [
    'position',
    'avg',
    'hr',
    'rbi',
    'runs',
    'sb',
    'games',
    'hits',
    'obp',
    'slg',
    'isPitcher',
    'wins',
    'losses',
    'era',
    'strikeouts',
    'saves',
    'whip',
    'winPct',
    'gamesStarted',
  ] as const;

  function statFields(player: object | undefined) {
    const record = (player ?? {}) as Record<string, unknown>;
    return Object.fromEntries(STAT_FIELDS.map((k) => [k, record[k]]));
  }

  function makeStats(
    playerId: number,
    overrides: Partial<PlayerStatsEntry> = {},
  ): PlayerStatsEntry {
    // playerStatsMap entries arrive with position hard-coded to 'UTIL'.
    return {
      playerId,
      firstName: 'Stat',
      lastName: `Row${playerId}`,
      position: 'UTIL',
      games: 100,
      hits: 50,
      hr: 5,
      rbi: 30,
      runs: 40,
      sb: 3,
      avg: 0.25,
      obp: 0.31,
      slg: 0.4,
      war: 1,
      ...overrides,
    };
  }

  function makePitching(overrides: Partial<PitchingStats> = {}): PitchingStats {
    return {
      wins: 378,
      losses: 227,
      era: 3.23,
      strikeouts: 3586,
      saves: 0,
      games: 744,
      gamesStarted: 740,
      whip: 1.148,
      winPct: 0.61,
      ...overrides,
    };
  }

  function makePick(
    playerId: number,
    overallPick: number,
    eligiblePositions: string[] | null,
  ): DraftPickRecord {
    return {
      id: `pick-${overallPick}`,
      draftId: 1,
      round: 1,
      pickNumber: overallPick,
      overallPick,
      pickedAt: '2026-10-04T05:00:00.000Z',
      teamId: MY_TEAM_ID,
      playerId,
      player: {
        id: playerId,
        firstName: 'Drafted',
        lastName: `Player${playerId}`,
        eligiblePositions,
      },
    };
  }

  type Props = {
    availablePlayers: AvailableDraftPlayer[];
    pickHistory: DraftPickRecord[];
  };

  function renderDraft(
    initial: Props,
    maps: {
      playerStatsMap?: Map<number, PlayerStatsEntry>;
      pitchingStatsMap?: Map<number, PitchingStats>;
      sport?: 'baseball' | 'football';
    } = {},
  ) {
    const playerStatsMap = maps.playerStatsMap ?? emptyStatsMap;
    const pitchingStatsMap = maps.pitchingStatsMap ?? emptyPitchingMap;
    return renderHook(
      (props: Props) =>
        usePlayerData({
          ...props,
          playerStatsMap,
          pitchingStatsMap,
          myTeamId: MY_TEAM_ID,
          sport: maps.sport,
        }),
      { initialProps: initial },
    );
  }

  it('patch path: a drafted SP with a career batting row gets the live pitcher card', () => {
    // Greg Maddux: has both a batting row (seeded as 'UTIL') and a pitching row.
    const maddux = makeAvailablePlayer({ id: 31, eligiblePositions: ['SP'] });
    const playerStatsMap = new Map([
      [31, makeStats(31, { avg: 0.171, hr: 5, rbi: 84, sb: 0 })],
    ]);
    const pitchingStatsMap = new Map([[31, makePitching()]]);
    const { result, rerender } = renderDraft(
      { availablePlayers: [maddux], pickHistory: [] },
      { playerStatsMap, pitchingStatsMap },
    );
    const liveCard = statFields(result.current.enrichedPlayers[0]);

    rerender({ availablePlayers: [], pickHistory: [makePick(31, 8, ['SP'])] });

    const resultCard = result.current.myTeam[0];
    expect(resultCard.isPitcher).toBe(true);
    expect(resultCard).toMatchObject({
      era: 3.23,
      wins: 378,
      strikeouts: 3586,
      whip: 1.148,
    });
    expect(statFields(resultCard)).toEqual(liveCard);
  });

  it('add path: a drafted SP with no batting row gets the live pitcher card, including WHIP', () => {
    const ace = makeAvailablePlayer({ id: 40, eligiblePositions: ['SP'] });
    const pitchingStatsMap = new Map([[40, makePitching()]]);
    const { result, rerender } = renderDraft(
      { availablePlayers: [ace], pickHistory: [] },
      { pitchingStatsMap },
    );
    const liveCard = statFields(result.current.enrichedPlayers[0]);

    rerender({ availablePlayers: [], pickHistory: [makePick(40, 1, ['SP'])] });

    const resultCard = result.current.myTeam[0];
    expect(resultCard.isPitcher).toBe(true);
    expect(resultCard.whip).toBe(1.148);
    expect(statFields(resultCard)).toEqual(liveCard);
  });

  it('add path: an RP with no eligible positions is derived from games started and gets the pitcher card', () => {
    const pitchingStatsMap = new Map([
      [
        41,
        makePitching({
          era: 2.21,
          wins: 82,
          strikeouts: 1173,
          saves: 652,
          games: 1115,
          gamesStarted: 0,
          whip: 1.0,
        }),
      ],
    ]);
    const { result } = renderDraft(
      { availablePlayers: [], pickHistory: [makePick(41, 2, null)] },
      { pitchingStatsMap },
    );

    expect(result.current.myTeam[0]).toMatchObject({
      position: 'RP',
      isPitcher: true,
      era: 2.21,
      wins: 82,
      strikeouts: 1173,
      saves: 652,
      whip: 1.0,
      games: 1115,
    });
  });

  it('patch path: a drafted hitter keeps the batting card and stats', () => {
    const shortstop = makeAvailablePlayer({
      id: 50,
      eligiblePositions: ['SS'],
    });
    const playerStatsMap = new Map([[50, makeStats(50, { avg: 0.312 })]]);
    const { result, rerender } = renderDraft(
      { availablePlayers: [shortstop], pickHistory: [] },
      { playerStatsMap },
    );
    const liveCard = statFields(result.current.enrichedPlayers[0]);

    rerender({ availablePlayers: [], pickHistory: [makePick(50, 3, ['SS'])] });

    const resultCard = result.current.myTeam[0];
    expect(resultCard).toMatchObject({
      position: 'SS',
      isPitcher: false,
      avg: 0.312,
      hr: 5,
      rbi: 30,
      sb: 3,
    });
    expect(resultCard.era).toBeUndefined();
    expect(statFields(resultCard)).toEqual(liveCard);
  });

  it('seed path: an undrafted playerStatsMap hitter is unchanged', () => {
    const playerStatsMap = new Map([[60, makeStats(60)]]);
    const { result } = renderDraft(
      { availablePlayers: [], pickHistory: [] },
      { playerStatsMap },
    );

    expect(result.current.statsLookup.get(60)).toMatchObject({
      position: 'UTIL',
      isPitcher: false,
      avg: 0.25,
      games: 100,
    });
    expect(result.current.statsLookup.get(60)?.era).toBeUndefined();
  });

  it('never gives a drafted football punter (P) the pitcher card', () => {
    const { result } = renderDraft(
      { availablePlayers: [], pickHistory: [makePick(70, 4, ['P'])] },
      { sport: 'football' },
    );

    expect(result.current.myTeam[0].position).toBe('P');
    expect(result.current.myTeam[0].isPitcher).toBe(false);
  });
});
