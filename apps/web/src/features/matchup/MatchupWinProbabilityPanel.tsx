import React, { useMemo, useRef } from 'react';
import { Card, Text, XStack, YStack } from 'tamagui';
import { Target } from '@tamagui/lucide-icons/icons/Target';
import { TrendingUp } from '@tamagui/lucide-icons/icons/TrendingUp';
import { LOGGER } from '@legacy-sports/logging';
import {
  calculateMatchupProjection,
  computeScoring,
} from '@legacy-sports/scoring';
import {
  type MatchupFragment,
  type MatchupPlayerFragment,
  MatchupStatus,
  useGetLeagueTeamsQuery,
  useGetMatchupPlayersQuery,
  useGetMatchupWinProbabilityQuery,
} from '@legacy-sports/graphql';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  withAlpha,
} from '../../constants/colors';
import { useLeagueScoringSettings } from '../../lib/scoring';
import {
  mapBattingStats,
  mapFieldingStats,
  mapMatchupPlayerToSeasonStats,
  mapPitchingStats,
} from '../../lib/scoring/mapGraphQLToScoringFormat';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CategoryScores {
  batting: number;
  pitching: number;
  fielding: number;
  total: number;
}

export interface MatchupWinProbabilityPanelProps {
  matchup: MatchupFragment | null | undefined;
}

interface ProjectionInputs {
  players: MatchupPlayerFragment[];
  scoringSettings: NonNullable<
    ReturnType<typeof useLeagueScoringSettings>['settings']
  >;
  gamesPerMatchup: number;
  team1Id: number | null | undefined;
  team2Id: number | null | undefined;
}

// Only the fields the Monte Carlo projection actually reads – used to build a
// content signature so an Apollo refetch that leaves these unchanged (e.g. an
// unrelated cache update elsewhere on the page) doesn't re-trigger the 10,000
// -iteration simulation below.
function buildProjectionSignature(inputs: ProjectionInputs | null): string {
  if (!inputs) return '';
  return JSON.stringify({
    players: inputs.players.map((p) => ({
      id: p.id,
      positionId: p.positionId,
      teamId: p.teamId,
      numberOfGames: p.numberOfGames,
      games: p.games,
      seasonBatting: p.seasonBatting,
      seasonPitching: p.seasonPitching,
      seasonFielding: p.seasonFielding,
    })),
    scoringSettings: inputs.scoringSettings,
    gamesPerMatchup: inputs.gamesPerMatchup,
    team1Id: inputs.team1Id,
    team2Id: inputs.team2Id,
  });
}

/**
 * Returns `inputs` as-is on the first call and on any call whose content
 * signature differs from the last one seen; otherwise returns the previously
 * returned reference so identity-only changes (e.g. Apollo returning a new
 * object for unchanged data) don't invalidate a downstream `useMemo`.
 */
function useStableProjectionInputs(
  inputs: ProjectionInputs | null,
): ProjectionInputs | null {
  const signature = buildProjectionSignature(inputs);
  const cache = useRef<{ signature: string; inputs: ProjectionInputs | null }>({
    signature,
    inputs,
  });

  if (cache.current.signature !== signature) {
    cache.current = { signature, inputs };
  }

  return cache.current.inputs;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProbabilityBar({
  team1Prob,
  team2Prob,
  tieProb,
  team1Name,
  team2Name,
}: {
  team1Prob: number;
  team2Prob: number;
  tieProb: number;
  team1Name: string;
  team2Name: string;
}) {
  const t1Pct = Math.round(team1Prob * 100);
  const t2Pct = Math.round(team2Prob * 100);
  const tiePct = Math.round(tieProb * 100);
  const showTieHint = tieProb > 0.01;

  return (
    <YStack gap="$2">
      <XStack justifyContent="space-between" alignItems="flex-end">
        <YStack>
          <Text fontSize="$2" color="$textMuted" fontWeight="500">
            {team1Name}
          </Text>
          <Text
            fontSize={40}
            fontWeight="900"
            color={BRAND_NAVY_LIGHT}
            lineHeight={44}
          >
            {t1Pct}%
          </Text>
        </YStack>

        <YStack alignItems="center" paddingBottom="$1">
          <Text
            fontSize="$1"
            fontWeight="700"
            color="$textMuted"
            letterSpacing={1}
          >
            WIN PROBABILITY
          </Text>
          {showTieHint && (
            <Text fontSize="$1" color="$textMuted" opacity={0.8}>
              {tiePct}% tie
            </Text>
          )}
        </YStack>

        <YStack alignItems="flex-end">
          <Text fontSize="$2" color="$textMuted" fontWeight="500">
            {team2Name}
          </Text>
          <Text
            fontSize={40}
            fontWeight="900"
            color={BRAND_SEAM_RED}
            lineHeight={44}
          >
            {t2Pct}%
          </Text>
        </YStack>
      </XStack>

      {/* Split probability bar */}
      <XStack
        height={12}
        borderRadius="$10"
        overflow="hidden"
        backgroundColor="$gray4"
      >
        <YStack
          height="100%"
          width={`${t1Pct}%`}
          backgroundColor={BRAND_NAVY_LIGHT}
          animation="quick"
        />
        <YStack
          height="100%"
          flex={1}
          backgroundColor={BRAND_SEAM_RED}
          animation="quick"
        />
      </XStack>
    </YStack>
  );
}

function CategoryRow({
  label,
  team1Score,
  team2Score,
}: {
  label: string;
  team1Score: number;
  team2Score: number;
}) {
  const total = team1Score + team2Score;
  const team1Pct = total > 0 ? team1Score / total : 0.5;
  const team1Leading = team1Score > team2Score;
  const team2Leading = team2Score > team1Score;

  return (
    <YStack gap="$1">
      <XStack justifyContent="space-between" alignItems="center">
        <Text
          fontSize="$2"
          fontWeight="700"
          color={team1Leading ? BRAND_NAVY_LIGHT : '$textMuted'}
        >
          {team1Score.toFixed(1)}
        </Text>
        <Text
          fontSize="$1"
          fontWeight="600"
          color="$textMuted"
          letterSpacing={1}
        >
          {label.toUpperCase()}
        </Text>
        <Text
          fontSize="$2"
          fontWeight="700"
          color={team2Leading ? BRAND_SEAM_RED : '$textMuted'}
        >
          {team2Score.toFixed(1)}
        </Text>
      </XStack>

      <XStack
        height={4}
        borderRadius="$10"
        overflow="hidden"
        backgroundColor="$gray4"
      >
        <YStack
          height="100%"
          width={`${team1Pct * 100}%`}
          backgroundColor={
            team1Leading ? withAlpha(BRAND_NAVY_LIGHT, 0.8) : '$gray6'
          }
          animation="quick"
        />
        <YStack
          height="100%"
          flex={1}
          backgroundColor={
            team2Leading ? withAlpha(BRAND_SEAM_RED, 0.8) : '$gray6'
          }
          animation="quick"
        />
      </XStack>
    </YStack>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * MatchupWinProbabilityPanel
 *
 * Displays:
 * - Win probability percentage + split bar (Monte Carlo simulation, computed
 *   server-side and gated by ENTITLEMENTS.matchup_projections — LS-5907)
 * - Projected final score for each team
 * - Category-by-category (batting / pitching / fielding) projected breakdown
 *
 * The player/scoring queries are the same Apollo-cached queries as
 * MatchupScoreboard so there is no extra network round-trip for those. Only
 * rendered for scheduled / in-progress matchups with an entitled result.
 */
export function MatchupWinProbabilityPanel({
  matchup,
}: MatchupWinProbabilityPanelProps) {
  const matchupIdNum = matchup?.id ? parseInt(matchup.id, 10) : 0;
  const leagueIdNum = matchup?.leagueId ?? undefined;

  // These queries are already cached by MatchupScoreboard – no extra requests.
  const { data: playersData } = useGetMatchupPlayersQuery({
    variables: { matchupId: matchupIdNum },
    skip: !matchupIdNum,
  });

  const { settings: scoringSettings } = useLeagueScoringSettings(leagueIdNum);

  const { data: teamsData } = useGetLeagueTeamsQuery({
    variables: { leagueId: leagueIdNum ?? 0 },
    skip: !leagueIdNum,
  });

  // Win probability is computed server-side, gated by entitlement
  // (ENTITLEMENTS.matchup_projections) — the client never sees it unless the
  // caller is entitled, and never computes it itself (LS-5907).
  const { data: winProbabilityData } = useGetMatchupWinProbabilityQuery({
    variables: { id: matchupIdNum },
    skip: !matchupIdNum,
    fetchPolicy: 'cache-and-network',
  });
  const winProb = winProbabilityData?.getMatchupById?.winProbability ?? null;

  // Resolve display names
  const team1Name = useMemo(() => {
    if (!matchup?.team1Id || !teamsData?.leagueTeams) return 'Team 1';
    return (
      teamsData.leagueTeams.find((t) => t.id === matchup.team1Id)?.name ??
      'Team 1'
    );
  }, [matchup?.team1Id, teamsData]);

  const team2Name = useMemo(() => {
    if (!matchup?.team2Id || !teamsData?.leagueTeams) return 'Team 2';
    return (
      teamsData.leagueTeams.find((t) => t.id === matchup.team2Id)?.name ??
      'Team 2'
    );
  }, [matchup?.team2Id, teamsData]);

  const rawProjectionInputs: ProjectionInputs | null =
    playersData?.getMatchupPlayers && scoringSettings && matchup
      ? {
          players: playersData.getMatchupPlayers,
          scoringSettings,
          gamesPerMatchup: matchup.gamesPerMatchup ?? 0,
          team1Id: matchup.team1Id,
          team2Id: matchup.team2Id,
        }
      : null;
  const projectionInputs = useStableProjectionInputs(rawProjectionInputs);

  const { team1Category, team2Category, isPreSeasonEmpty } = useMemo(() => {
    const empty: CategoryScores = {
      batting: 0,
      pitching: 0,
      fielding: 0,
      total: 0,
    };

    if (!projectionInputs) {
      return {
        team1Category: empty,
        team2Category: empty,
        isPreSeasonEmpty: false,
      };
    }

    const { players, scoringSettings, gamesPerMatchup, team1Id } =
      projectionInputs;

    // Per-category actual scores for a single game
    const gameCategoryScores = (
      game: NonNullable<MatchupPlayerFragment['games']>[number],
    ) => ({
      batting: game.battingGame
        ? computeScoring(
            mapBattingStats(game.battingGame),
            scoringSettings.batting ?? {},
          )
        : 0,
      pitching: game.pitchingGame
        ? computeScoring(
            mapPitchingStats(game.pitchingGame),
            scoringSettings.pitching ?? {},
          )
        : 0,
      fielding: game.fieldingGame
        ? computeScoring(
            mapFieldingStats(game.fieldingGame),
            scoringSettings.fielding ?? {},
          )
        : 0,
    });

    type Cat = { batting: number; pitching: number; fielding: number };
    const t1: Cat = { batting: 0, pitching: 0, fielding: 0 };
    const t2: Cat = { batting: 0, pitching: 0, fielding: 0 };

    players.forEach((player) => {
      // Skip benched players
      if (player.positionId === null) return;

      const totalGames = player.numberOfGames ?? gamesPerMatchup;
      const gamesPlayed = player.games?.length ?? 0;
      const remaining = Math.max(0, totalGames - gamesPlayed);

      // Sum actual per-category scores from played games
      const actual: Cat = { batting: 0, pitching: 0, fielding: 0 };
      (player.games ?? []).forEach((game) => {
        const gs = gameCategoryScores(game);
        actual.batting += gs.batting;
        actual.pitching += gs.pitching;
        actual.fielding += gs.fielding;
      });

      // Project per-game rates from season stats for remaining games
      let perGame: {
        battingPerGame: number;
        pitchingPerGame: number;
        fieldingPerGame: number;
      } | null = null;

      if (remaining > 0) {
        const seasonStats = mapMatchupPlayerToSeasonStats(player);
        if (seasonStats) {
          try {
            const proj = calculateMatchupProjection(
              seasonStats,
              scoringSettings,
            );
            perGame = {
              battingPerGame: proj.battingPerGame,
              pitchingPerGame: proj.pitchingPerGame,
              fieldingPerGame: proj.fieldingPerGame,
            };
          } catch (err) {
            // Fall through – perGame remains null; actual scores only. Surface
            // the failure so a broken projection isn't silently hidden.
            LOGGER.error(
              `Win probability projection failed for player ${player.playerId}:`,
              err instanceof Error ? err : new Error(String(err)),
            );
          }
        }
      }

      const projBatting =
        actual.batting + (perGame?.battingPerGame ?? 0) * remaining;
      const projPitching =
        actual.pitching + (perGame?.pitchingPerGame ?? 0) * remaining;
      const projFielding =
        actual.fielding + (perGame?.fieldingPerGame ?? 0) * remaining;

      const target = player.teamId === team1Id ? t1 : t2;
      target.batting += projBatting;
      target.pitching += projPitching;
      target.fielding += projFielding;
    });

    const team1Total = t1.batting + t1.pitching + t1.fielding;
    const team2Total = t2.batting + t2.pitching + t2.fielding;

    if (team1Total === 0 && team2Total === 0) {
      return {
        team1Category: empty,
        team2Category: empty,
        isPreSeasonEmpty: true,
      };
    }

    return {
      team1Category: { ...t1, total: team1Total },
      team2Category: { ...t2, total: team2Total },
      isPreSeasonEmpty: false,
    };
  }, [projectionInputs]);

  // Only show for non-final matchups
  if (!matchup || matchup.status === MatchupStatus.Completed) {
    return null;
  }

  // Pre-season fallback: no games played yet and no projections available
  // (e.g. no stats history for any rostered player) — show an explicit
  // placeholder instead of silently rendering nothing (LS-5909). Win
  // probability itself is still only ever server-sourced (LS-5907); this
  // branch never computes it client-side.
  if (!winProb) {
    if (isPreSeasonEmpty && matchup.status === MatchupStatus.Scheduled) {
      return (
        <Card
          data-testid="win-probability-panel-pre-season"
          overflow="hidden"
          borderRadius="$6"
          borderWidth={1}
          borderColor="$surfacePanelBorder"
          width="100%"
          maxWidth={800}
        >
          <XStack
            alignItems="center"
            gap="$2"
            paddingHorizontal="$5"
            paddingVertical="$3"
            backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
            borderBottomWidth={1}
            borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.35)}
          >
            <Target size={16} color={BRAND_GOLD_LIGHT} />
            <Text fontSize="$4" fontWeight="700" color={BRAND_GOLD_LIGHT}>
              Win Probability
            </Text>
          </XStack>
          <YStack padding="$5">
            <Text fontSize="$3" color="$textMuted" textAlign="center">
              Win probability will appear once games are scheduled.
            </Text>
          </YStack>
        </Card>
      );
    }
    return null;
  }

  return (
    <Card
      data-testid="win-probability-panel"
      overflow="hidden"
      borderRadius="$6"
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      width="100%"
      maxWidth={800}
    >
      {/* Header */}
      <XStack
        alignItems="center"
        gap="$2"
        paddingHorizontal="$5"
        paddingVertical="$3"
        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
        borderBottomWidth={1}
        borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.35)}
      >
        <Target size={16} color={BRAND_GOLD_LIGHT} />
        <Text fontSize="$4" fontWeight="700" color={BRAND_GOLD_LIGHT}>
          Win Probability
        </Text>
      </XStack>

      <YStack padding="$5" gap="$5">
        {/* Split probability bar */}
        <ProbabilityBar
          team1Prob={winProb.team1WinProbability}
          team2Prob={winProb.team2WinProbability}
          tieProb={winProb.tiesProbability}
          team1Name={team1Name}
          team2Name={team2Name}
        />

        {/* Projected final scores */}
        <YStack
          padding="$3"
          borderRadius="$4"
          backgroundColor="$gray2"
          gap="$1"
        >
          <XStack alignItems="center" gap="$1.5" marginBottom="$1">
            <TrendingUp size={13} color="var(--textMuted)" />
            <Text
              fontSize="$2"
              fontWeight="600"
              color="$textMuted"
              letterSpacing={0.5}
            >
              PROJECTED FINAL SCORES
            </Text>
          </XStack>

          <XStack justifyContent="space-between" alignItems="center">
            <Text fontSize="$6" fontWeight="900" color={BRAND_NAVY_LIGHT}>
              {winProb.team1ProjectedScore.toFixed(2)}
            </Text>
            <Text fontSize="$3" color="$textMuted">
              vs
            </Text>
            <Text fontSize="$6" fontWeight="900" color={BRAND_SEAM_RED}>
              {winProb.team2ProjectedScore.toFixed(2)}
            </Text>
          </XStack>

          <XStack justifyContent="space-between">
            <Text fontSize="$1" color="$textMuted">
              {team1Name}
            </Text>
            <Text fontSize="$1" color="$textMuted">
              {team2Name}
            </Text>
          </XStack>
        </YStack>

        {/* Category-by-category breakdown */}
        <YStack gap="$3">
          <Text
            fontSize="$2"
            fontWeight="600"
            color="$textMuted"
            letterSpacing={0.5}
          >
            CATEGORY BREAKDOWN (PROJECTED)
          </Text>

          <CategoryRow
            label="Batting"
            team1Score={team1Category.batting}
            team2Score={team2Category.batting}
          />
          <CategoryRow
            label="Pitching"
            team1Score={team1Category.pitching}
            team2Score={team2Category.pitching}
          />
          <CategoryRow
            label="Fielding"
            team1Score={team1Category.fielding}
            team2Score={team2Category.fielding}
          />
        </YStack>

        <Text fontSize="$1" color="$textMuted" alignSelf="center" opacity={0.7}>
          Based on {winProb.simulationCount.toLocaleString()} simulations ·
          Updates as games are revealed
        </Text>
      </YStack>
    </Card>
  );
}
