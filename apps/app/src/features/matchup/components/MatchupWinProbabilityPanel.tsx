import React, { useMemo } from 'react';
import { Card, Text, XStack, YStack } from 'tamagui';
import { Target, TrendingUp } from '@tamagui/lucide-icons';
import {
  calculateMatchupProjection,
  computeScoring,
} from '@legacy-sports/scoring';
import { calculateMatchupWinProbability } from '@legacy-sports/analytics';
import { LOGGER } from '@legacy-sports/logging';
import {
  type MatchupFragment,
  type MatchupPlayerFragment,
  MatchupStatus,
  useGetLeagueTeamsQuery,
  useGetMatchupPlayersQuery,
} from '../../../api/db/graphql.generated';
import { useLeagueScoringSettings } from '../../../common/scoring';
import {
  mapBattingStats,
  mapFieldingStats,
  mapMatchupPlayerToSeasonStats,
  mapPitchingStats,
} from '../../../common/scoring/mapGraphQLToScoringFormat';

// ── Brand colors ───────────────────────────────────────────────────────────────
// Mobile has no central colors module — components define brand constants inline
// (see help.tsx, PremiumGate.tsx). These mirror apps/web/src/constants/colors.ts
// so the panel matches the web matchup detail page.

const BRAND_NAVY_LIGHT = '#2C4A7C';
const BRAND_SEAM_RED = '#C41E3A';
const BRAND_GOLD_LIGHT = '#D4BB78';
const MUTED_ICON = '#8A94A6';

/** rgba() string from a #rrggbb hex and an alpha in [0, 1]. */
function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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

// ── Sub-components ────────────────────────────────────────────────────────────

function ProbabilityBar({
  team1Prob,
  team1Name,
  team2Name,
}: {
  team1Prob: number;
  team1Name: string;
  team2Name: string;
}) {
  const t1Pct = Math.round(team1Prob * 100);
  // Always complement so displayed values sum to exactly 100 (ties are excluded
  // from the win-probability display).
  const t2Pct = 100 - t1Pct;

  return (
    <YStack gap="$2">
      <XStack justifyContent="space-between" alignItems="flex-end">
        <YStack>
          <Text fontSize="$2" color="$gray11" fontWeight="500">
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
            color="$gray11"
            letterSpacing={1}
          >
            WIN PROBABILITY
          </Text>
        </YStack>

        <YStack alignItems="flex-end">
          <Text fontSize="$2" color="$gray11" fontWeight="500">
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
          color={team1Leading ? BRAND_NAVY_LIGHT : '$gray11'}
        >
          {team1Score.toFixed(1)}
        </Text>
        <Text fontSize="$1" fontWeight="600" color="$gray11" letterSpacing={1}>
          {label.toUpperCase()}
        </Text>
        <Text
          fontSize="$2"
          fontWeight="700"
          color={team2Leading ? BRAND_SEAM_RED : '$gray11'}
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
 * MatchupWinProbabilityPanel (mobile)
 *
 * Displays:
 * - Win probability percentage + split bar (Monte Carlo simulation)
 * - Projected final score for each team
 * - Category-by-category (batting / pitching / fielding) projected breakdown
 *
 * Mirrors the web MatchupWinProbabilityPanel. Reuses the GetMatchupPlayers query
 * (shared with the lineup editor) so Apollo can serve it from cache. Only rendered
 * for scheduled / in-progress matchups with available projections.
 */
export function MatchupWinProbabilityPanel({
  matchup,
}: MatchupWinProbabilityPanelProps) {
  const matchupIdNum = matchup?.id ? parseInt(matchup.id, 10) : 0;
  const leagueIdNum = matchup?.leagueId ?? undefined;

  // Apollo dedupes/caches these by query+variables. GetMatchupPlayers is shared
  // with the lineup-editor tab (MatchupRosterEditor), so it is frequently served
  // from cache rather than refetched.
  const { data: playersData } = useGetMatchupPlayersQuery({
    variables: { matchupId: matchupIdNum },
    skip: !matchupIdNum,
  });

  const { settings: scoringSettings } = useLeagueScoringSettings(leagueIdNum);

  const { data: teamsData } = useGetLeagueTeamsQuery({
    variables: { leagueId: leagueIdNum ?? 0 },
    skip: !leagueIdNum,
  });

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

  const { team1Category, team2Category, winProb } = useMemo(() => {
    const empty: CategoryScores = {
      batting: 0,
      pitching: 0,
      fielding: 0,
      total: 0,
    };

    if (!playersData?.getMatchupPlayers || !scoringSettings || !matchup) {
      return { team1Category: empty, team2Category: empty, winProb: null };
    }

    const players = playersData.getMatchupPlayers;
    const gamesPerMatchup = matchup.gamesPerMatchup ?? 0;

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

      const target = player.teamId === matchup.team1Id ? t1 : t2;
      target.batting += projBatting;
      target.pitching += projPitching;
      target.fielding += projFielding;
    });

    const team1Total = t1.batting + t1.pitching + t1.fielding;
    const team2Total = t2.batting + t2.pitching + t2.fielding;

    // Only run simulation when we have meaningful projections
    if (team1Total === 0 && team2Total === 0) {
      return { team1Category: empty, team2Category: empty, winProb: null };
    }

    const wp = calculateMatchupWinProbability(team1Total, team2Total);

    return {
      team1Category: { ...t1, total: team1Total },
      team2Category: { ...t2, total: team2Total },
      winProb: wp,
    };
  }, [playersData, scoringSettings, matchup]);

  // Only show for non-final matchups with available projections
  if (!matchup || matchup.status === MatchupStatus.Completed || !winProb) {
    return null;
  }

  return (
    <Card
      testID="win-probability-panel"
      overflow="hidden"
      borderRadius="$6"
      borderWidth={1}
      borderColor="$gray6"
      width="100%"
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
            <TrendingUp size={13} color={MUTED_ICON} />
            <Text
              fontSize="$2"
              fontWeight="600"
              color="$gray11"
              letterSpacing={0.5}
            >
              PROJECTED FINAL SCORES
            </Text>
          </XStack>

          <XStack justifyContent="space-between" alignItems="center">
            <Text fontSize="$6" fontWeight="900" color={BRAND_NAVY_LIGHT}>
              {winProb.team1ProjectedScore.toFixed(2)}
            </Text>
            <Text fontSize="$3" color="$gray11">
              vs
            </Text>
            <Text fontSize="$6" fontWeight="900" color={BRAND_SEAM_RED}>
              {winProb.team2ProjectedScore.toFixed(2)}
            </Text>
          </XStack>

          <XStack justifyContent="space-between">
            <Text fontSize="$1" color="$gray11">
              {team1Name}
            </Text>
            <Text fontSize="$1" color="$gray11">
              {team2Name}
            </Text>
          </XStack>
        </YStack>

        {/* Category-by-category breakdown */}
        <YStack gap="$3">
          <Text
            fontSize="$2"
            fontWeight="600"
            color="$gray11"
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

        <Text fontSize="$1" color="$gray11" alignSelf="center" opacity={0.7}>
          Based on {winProb.simulationCount.toLocaleString()} simulations ·
          Updates as games are revealed
        </Text>
      </YStack>
    </Card>
  );
}
