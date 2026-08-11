import React, { useEffect, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type GameRoomResumeGame,
  GameRoomScreen,
  type MinigameId,
} from '@legacy-sports/shared-components';
import {
  SeasonDraftGameStatus,
  useGetDisclosureGameBestScoreQuery,
  useGetSeasonDraftGamesQuery,
} from '@legacy-sports/graphql';
import { LOGGER } from '@legacy-sports/logging';
import { trackMinigameTap } from '../../../utils/analytics';

/**
 * The Games tab renders `GameRoomScreen` from `lib/shared-components` — the
 * "Quick-play Ledger" layout (LS-8800) — wired to mobile's GraphQL data layer
 * and expo-router navigation. The shared component is presentational, so all
 * query wiring, analytics and routing live here (the split LS-8795 used for
 * the Leagues tab).
 *
 * Two of the design's stats have no backing query yet — the 20 Questions token
 * balance (LS-8802) and the "Your Numbers" strip (LS-8803). They pass `null`,
 * which the shared component renders as `—`, matching the existing hub's
 * loading convention.
 */

const ROUTES: Record<MinigameId, string> = {
  'season-draft': '/season-draft',
  disclosure: '/disclosure-game',
  'twenty-questions': '/games/twenty-questions',
};

export default function GamesTab() {
  const router = useRouter();
  const { top: topInset } = useSafeAreaInsets();

  const {
    data: sdGamesData,
    loading: sdLoading,
    error: sdError,
  } = useGetSeasonDraftGamesQuery();
  const {
    data: bestScoreData,
    loading: bestScoreLoading,
    error: bestScoreError,
  } = useGetDisclosureGameBestScoreQuery();

  // Errors are non-fatal — every stat falls back to '—' — but log them so a
  // broken query doesn't silently disappear from Rollbar/Discord.
  useEffect(() => {
    if (sdError) {
      LOGGER.error('GamesTab: seasonDraftGames query failed:', sdError);
    }
  }, [sdError]);
  useEffect(() => {
    if (bestScoreError) {
      LOGGER.error(
        'GamesTab: disclosureGameBestScore query failed:',
        bestScoreError,
      );
    }
  }, [bestScoreError]);

  const games = useMemo(
    () => sdGamesData?.seasonDraftGames ?? [],
    [sdGamesData?.seasonDraftGames],
  );

  // Show '—' while loading or if the query errored; show '0' for a successful
  // empty result so the user can tell "still loading" from "no games".
  const activeGamesCount =
    sdLoading || sdError
      ? null
      : games.filter(
          (g) =>
            g.status === SeasonDraftGameStatus.Setup ||
            g.status === SeasonDraftGameStatus.Drafting,
        ).length;

  const bestScore =
    bestScoreLoading || bestScoreError
      ? null
      : (bestScoreData?.disclosureGameBestScore ?? null);

  // The banner is for the one game actually waiting on the user. A game in
  // Setup has no turn to take, so only Drafting qualifies.
  const resumeGame = useMemo<GameRoomResumeGame | null>(() => {
    const game = games.find(
      (g) => g.isMyTurn === true && g.status === SeasonDraftGameStatus.Drafting,
    );
    if (game === undefined || game.id === null || game.id === undefined) {
      return null;
    }

    const playerCount = game.playerCount ?? null;
    const picksMade = game.picksMade ?? null;
    const totalPicks = game.totalPicks ?? null;

    // Every manager fills the same number of roster slots, so a round is one
    // pick per manager. Guard the division: a game with no players or no
    // slots yields no round line rather than NaN.
    let round: number | null = null;
    let totalRounds: number | null = null;
    if (
      playerCount !== null &&
      playerCount > 0 &&
      picksMade !== null &&
      totalPicks !== null &&
      totalPicks > 0
    ) {
      totalRounds = Math.ceil(totalPicks / playerCount);
      round = Math.min(Math.floor(picksMade / playerCount) + 1, totalRounds);
    }

    return {
      gameId: game.id,
      gameName: game.name ?? 'Season Draft',
      round,
      totalRounds,
      playerCount,
      players: game.players ?? null,
      myPlayerId: game.myPlayerId ?? null,
    };
  }, [games]);

  function handleSelectGame(id: MinigameId) {
    trackMinigameTap(id);
    router.push(ROUTES[id]);
  }

  function handleResumeGame(game: GameRoomResumeGame) {
    trackMinigameTap('season-draft');
    router.push({
      pathname: '/season-draft/[gameId]',
      params: { gameId: String(game.gameId) },
    });
  }

  return (
    <GameRoomScreen
      activeGamesCount={activeGamesCount}
      bestScore={bestScore}
      // No query exposes a 20 Questions token balance yet (LS-8802).
      tokens={null}
      resumeGame={resumeGame}
      // No query exposes per-user minigame totals yet (LS-8803).
      personalStats={{ draftsWon: null, dayStreak: null, gamesPlayed: null }}
      onSelectGame={handleSelectGame}
      onResumeGame={handleResumeGame}
      topInset={topInset}
    />
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';
