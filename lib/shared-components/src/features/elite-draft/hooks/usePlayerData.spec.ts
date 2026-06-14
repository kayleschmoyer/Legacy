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
