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
