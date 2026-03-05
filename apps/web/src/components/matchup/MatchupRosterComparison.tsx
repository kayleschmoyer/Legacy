/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents -- Complex type mapping for scoring calculations */
import React, { useMemo, useState } from 'react';
import { Card, H4, H5, Separator, Text, XStack, YStack } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import {
  calculateMatchupProjection,
  computeScoring,
  type SeasonStats,
} from '@legacy-sports/scoring';
import { PlayerSeasonStatsModal } from './PlayerSeasonStatsModal';
import { PlayerMatchupStatsModal } from './PlayerMatchupStatsModal';
import {
  type MatchupFragment,
  type MatchupPlayerFragment,
  useGetLeagueTeamsQuery,
  useGetMatchupPlayersQuery,
  useGetPositionsForLeagueQuery,
} from '../../api/db/graphql.generated';
import { useLeagueScoringSettings } from '../../lib/scoring';
import {
  mapBattingStats,
  mapFieldingStats,
  mapPitchingStats,
} from '../../lib/scoring/mapGraphQLToScoringFormat';

export interface MatchupRosterComparisonProps {
  matchup: MatchupFragment;
}

// ── Position Badge Color Helper ───────────────────────────────────────────────
const getPositionColors = (
  position: string | null | undefined,
): { bg: string; text: string } => {
  if (!position) return { bg: '$gray4', text: '$gray11' };
  const pos = position.toUpperCase();
  if (pos === 'C') return { bg: '$amber3', text: '$amber11' };
  if (['1B', '2B', '3B', 'SS', 'IF'].includes(pos))
    return { bg: '$blue3', text: '$blue11' };
  if (['LF', 'CF', 'RF', 'OF'].includes(pos))
    return { bg: '$green3', text: '$green11' };
  if (pos === 'SP') return { bg: '$amber6', text: '$amber12' };
  if (pos === 'RP') return { bg: '$red3', text: '$red11' };
  if (['DH', 'XDH', 'UT', 'UTIL'].includes(pos))
    return { bg: '$red7', text: '$red12' };
  return { bg: '$gray4', text: '$gray11' };
};

// ── Skeleton loading components ─────────────────────────────────────────────
const skeletonKeyframes = `
@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`;

const skeletonPulseStyle = {
  backgroundColor: 'var(--gray4)',
  borderRadius: 4,
  animationName: 'skeleton-pulse',
  animationDuration: '1.5s',
  animationIterationCount: 'infinite',
  animationTimingFunction: 'ease-in-out',
} as React.CSSProperties;

function SkeletonRow({ isEven = false }: { isEven?: boolean }) {
  return (
    <XStack
      paddingVertical="$2.5"
      paddingHorizontal="$3"
      backgroundColor={isEven ? undefined : '$gray2'}
      borderBottomWidth={1}
      borderBottomColor="$gray4"
      justifyContent="space-between"
      alignItems="center"
    >
      {/* Team 1 side */}
      <XStack width="47%" alignItems="center" gap="$2">
        <XStack flex={1} gap="$2" alignItems="center" minWidth={0}>
          <YStack
            width={32}
            height={32}
            borderRadius={16}
            style={skeletonPulseStyle}
          />
          <YStack gap="$1" flex={1} minWidth={0}>
            <YStack height={13} width="75%" style={skeletonPulseStyle} />
            <YStack
              height={9}
              width="55%"
              style={{ ...skeletonPulseStyle, backgroundColor: 'var(--gray3)' }}
            />
            <YStack
              height={9}
              width="40%"
              style={{ ...skeletonPulseStyle, backgroundColor: 'var(--blue3)' }}
            />
          </YStack>
        </XStack>
        <YStack width={60} flexShrink={0} alignItems="center">
          <YStack width={32} height={13} style={skeletonPulseStyle} />
        </YStack>
        <YStack width={60} flexShrink={0} alignItems="center">
          <YStack width={38} height={16} style={skeletonPulseStyle} />
        </YStack>
      </XStack>
      <Separator vertical height="100%" borderColor="$gray8" borderWidth={2} />
      {/* Team 2 side */}
      <XStack width="47%" alignItems="center" gap="$2">
        <YStack width={60} flexShrink={0} alignItems="center">
          <YStack width={38} height={16} style={skeletonPulseStyle} />
        </YStack>
        <YStack width={60} flexShrink={0} alignItems="center">
          <YStack width={32} height={13} style={skeletonPulseStyle} />
        </YStack>
        <XStack
          flex={1}
          gap="$2"
          alignItems="center"
          justifyContent="flex-end"
          minWidth={0}
        >
          <YStack gap="$1" flex={1} alignItems="flex-end" minWidth={0}>
            <YStack
              height={13}
              width="75%"
              alignSelf="flex-end"
              style={skeletonPulseStyle}
            />
            <YStack
              height={9}
              width="55%"
              alignSelf="flex-end"
              style={{ ...skeletonPulseStyle, backgroundColor: 'var(--gray3)' }}
            />
            <YStack
              height={9}
              width="40%"
              alignSelf="flex-end"
              style={{ ...skeletonPulseStyle, backgroundColor: 'var(--blue3)' }}
            />
          </YStack>
          <YStack
            width={32}
            height={32}
            borderRadius={16}
            style={skeletonPulseStyle}
          />
        </XStack>
      </XStack>
    </XStack>
  );
}

function SkeletonTotalsRow() {
  return (
    <XStack
      paddingVertical="$3"
      paddingHorizontal="$3"
      backgroundColor="$gray3"
      borderTopWidth={2}
      borderTopColor="$gray7"
      justifyContent="space-between"
      alignItems="center"
    >
      <XStack width="47%" alignItems="center" gap="$2">
        <YStack flex={1} minWidth={0}>
          <YStack width={100} height={16} style={skeletonPulseStyle} />
        </YStack>
        <YStack width={60} flexShrink={0} alignItems="center">
          <YStack width={36} height={13} style={skeletonPulseStyle} />
        </YStack>
        <YStack width={60} flexShrink={0} alignItems="center">
          <YStack width={42} height={18} style={skeletonPulseStyle} />
        </YStack>
      </XStack>
      <Separator vertical height="100%" borderColor="$gray8" borderWidth={2} />
      <XStack width="47%" alignItems="center" gap="$2">
        <YStack width={60} flexShrink={0} alignItems="center">
          <YStack width={42} height={18} style={skeletonPulseStyle} />
        </YStack>
        <YStack width={60} flexShrink={0} alignItems="center">
          <YStack width={36} height={13} style={skeletonPulseStyle} />
        </YStack>
        <YStack flex={1} alignItems="flex-end" minWidth={0}>
          <YStack width={100} height={16} style={skeletonPulseStyle} />
        </YStack>
      </XStack>
    </XStack>
  );
}

function SkeletonLoading({
  team1Name = 'Team 1',
  team2Name = 'Team 2',
}: {
  team1Name?: string;
  team2Name?: string;
}) {
  return (
    <Card
      overflow="hidden"
      borderRadius="$6"
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      backgroundColor="$background"
    >
      <style dangerouslySetInnerHTML={{ __html: skeletonKeyframes }} />

      {/* Card Header - real labels */}
      <XStack
        padding="$4"
        justifyContent="space-between"
        alignItems="center"
        borderBottomWidth={1}
        borderBottomColor="$surfacePanelBorder"
      >
        <XStack alignItems="center" gap="$2">
          <H4 color="$color">Player Matchups</H4>
        </XStack>
        <YStack
          width={60}
          height={24}
          borderRadius={12}
          style={skeletonPulseStyle}
        />
      </XStack>

      {/* Hitters Section */}
      <YStack
        overflow="hidden"
        borderRadius="$4"
        borderWidth={1}
        borderColor="$surfacePanelBorder"
        backgroundColor="$background"
      >
        {/* Section Header - real label */}
        <XStack
          padding="$2.5"
          paddingHorizontal="$4"
          backgroundColor="$blue2"
          gap="$2"
          alignItems="center"
        >
          <YStack
            width={4}
            height={16}
            borderRadius={2}
            backgroundColor="$blue9"
          />
          <Text
            fontSize="$3"
            fontWeight="700"
            color="$blue11"
            letterSpacing={0.3}
          >
            STARTING LINEUP
          </Text>
        </XStack>

        {/* Column Headers - real labels */}
        <XStack
          paddingVertical="$2"
          paddingHorizontal="$3"
          backgroundColor="$surfacePanel"
          borderBottomWidth={1}
          borderBottomColor="$surfacePanelBorder"
          justifyContent="space-between"
          alignItems="center"
        >
          <XStack width="47%" alignItems="center" gap="$2">
            <YStack width={40} flexShrink={0}>
              <Text
                fontSize="$1"
                fontWeight="700"
                color="$textMuted"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                Pos
              </Text>
            </YStack>
            <YStack flex={1} minWidth={0}>
              <Text
                fontSize="$1"
                fontWeight="700"
                color="$textMuted"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                {team1Name}
              </Text>
            </YStack>
            <YStack width={60} flexShrink={0} alignItems="center">
              <Text
                fontSize="$1"
                fontWeight="700"
                color="$textMuted"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                Proj
              </Text>
            </YStack>
            <YStack width={60} flexShrink={0} alignItems="center">
              <Text
                fontSize="$1"
                fontWeight="700"
                color="$blue11"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                Actual
              </Text>
            </YStack>
          </XStack>
          <Separator vertical height="100%" borderColor="$surfacePanelBorder" />
          <XStack width="47%" alignItems="center" gap="$2">
            <YStack width={60} flexShrink={0} alignItems="center">
              <Text
                fontSize="$1"
                fontWeight="700"
                color="$blue11"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                Actual
              </Text>
            </YStack>
            <YStack width={60} flexShrink={0} alignItems="center">
              <Text
                fontSize="$1"
                fontWeight="700"
                color="$textMuted"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                Proj
              </Text>
            </YStack>
            <YStack flex={1} alignItems="flex-end" minWidth={0}>
              <Text
                fontSize="$1"
                fontWeight="700"
                color="$textMuted"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                {team2Name}
              </Text>
            </YStack>
            <YStack width={40} flexShrink={0} alignItems="flex-end">
              <Text
                fontSize="$1"
                fontWeight="700"
                color="$textMuted"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                Pos
              </Text>
            </YStack>
          </XStack>
        </XStack>

        {/* Batters sub-header */}
        <XStack
          padding="$2.5"
          paddingHorizontal="$4"
          backgroundColor="$green2"
          gap="$2"
          alignItems="center"
        >
          <YStack
            width={4}
            height={16}
            borderRadius={2}
            backgroundColor="$green9"
          />
          <Text
            fontSize="$2"
            fontWeight="700"
            color="$green11"
            letterSpacing={0.3}
          >
            BATTERS
          </Text>
        </XStack>

        {/* Skeleton batter rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonRow key={`batter-${i}`} isEven={i % 2 === 0} />
        ))}

        {/* Totals skeleton */}
        <SkeletonTotalsRow />
      </YStack>

      {/* Pitchers Section */}
      <YStack
        overflow="hidden"
        borderRadius="$4"
        borderWidth={1}
        borderColor="$surfacePanelBorder"
        backgroundColor="$background"
        marginTop="$4"
      >
        <XStack
          padding="$2.5"
          paddingHorizontal="$4"
          backgroundColor="$green2"
          gap="$2"
          alignItems="center"
        >
          <YStack
            width={4}
            height={16}
            borderRadius={2}
            backgroundColor="$green9"
          />
          <Text
            fontSize="$2"
            fontWeight="700"
            color="$green11"
            letterSpacing={0.3}
          >
            PITCHERS
          </Text>
        </XStack>

        {/* Column Headers - real labels */}
        <XStack
          paddingVertical="$2"
          paddingHorizontal="$3"
          backgroundColor="$surfacePanel"
          borderBottomWidth={1}
          borderBottomColor="$surfacePanelBorder"
          justifyContent="space-between"
          alignItems="center"
        >
          <XStack width="47%" alignItems="center" gap="$2">
            <YStack width={40} flexShrink={0}>
              <Text
                fontSize="$1"
                fontWeight="700"
                color="$textMuted"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                Pos
              </Text>
            </YStack>
            <YStack flex={1} minWidth={0}>
              <Text
                fontSize="$1"
                fontWeight="700"
                color="$textMuted"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                {team1Name}
              </Text>
            </YStack>
            <YStack width={60} flexShrink={0} alignItems="center">
              <Text
                fontSize="$1"
                fontWeight="700"
                color="$textMuted"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                Proj
              </Text>
            </YStack>
            <YStack width={60} flexShrink={0} alignItems="center">
              <Text
                fontSize="$1"
                fontWeight="700"
                color="$blue11"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                Actual
              </Text>
            </YStack>
          </XStack>
          <Separator vertical height="100%" borderColor="$surfacePanelBorder" />
          <XStack width="47%" alignItems="center" gap="$2">
            <YStack width={60} flexShrink={0} alignItems="center">
              <Text
                fontSize="$1"
                fontWeight="700"
                color="$blue11"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                Actual
              </Text>
            </YStack>
            <YStack width={60} flexShrink={0} alignItems="center">
              <Text
                fontSize="$1"
                fontWeight="700"
                color="$textMuted"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                Proj
              </Text>
            </YStack>
            <YStack flex={1} alignItems="flex-end" minWidth={0}>
              <Text
                fontSize="$1"
                fontWeight="700"
                color="$textMuted"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                {team2Name}
              </Text>
            </YStack>
            <YStack width={40} flexShrink={0} alignItems="flex-end">
              <Text
                fontSize="$1"
                fontWeight="700"
                color="$textMuted"
                textTransform="uppercase"
                letterSpacing={0.5}
              >
                Pos
              </Text>
            </YStack>
          </XStack>
        </XStack>

        {/* Skeleton pitcher rows */}
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonRow key={`pitcher-${i}`} isEven={i % 2 === 0} />
        ))}

        {/* Totals skeleton */}
        <SkeletonTotalsRow />
      </YStack>
    </Card>
  );
}

/**
 * MatchupRosterComparison - Detailed player-by-player comparison
 * Shows starting lineups and bench with projections vs actual scores
 */
export function MatchupRosterComparison({
  matchup,
}: MatchupRosterComparisonProps) {
  // Bench toggle state
  const [showBench, setShowBench] = useState(false);

  // Modal state for season stats
  const [seasonStatsModalOpen, setSeasonStatsModalOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{
    id: number;
    name: string;
  } | null>(null);

  // Modal state for matchup stats breakdown
  const [matchupStatsModalOpen, setMatchupStatsModalOpen] = useState(false);
  const [selectedMatchupPlayer, setSelectedMatchupPlayer] =
    useState<MatchupPlayerFragment | null>(null);
  const [selectedMatchupPlayerName, setSelectedMatchupPlayerName] =
    useState<string>('');

  const team1Id = matchup.team1Id;
  const team2Id = matchup.team2Id;
  const leagueId = matchup.leagueId ?? 0;
  const gamesPerMatchup = matchup.gamesPerMatchup ?? 3;

  // Debug logging
  LOGGER.info('[MatchupRosterComparison] Debug Info:', {
    matchupId: matchup.id,
    leagueId,
    gamesPerMatchup,
  });

  // Fetch league scoring settings for accurate projections
  const { settings: scoringSettings, loading: scoringLoading } =
    useLeagueScoringSettings(leagueId);

  // Fetch matchup players with their selected seasons, games, AND season stats
  const matchupId =
    typeof matchup.id === 'string'
      ? parseInt(matchup.id, 10)
      : (matchup.id ?? 0);
  const { data, loading, error } = useGetMatchupPlayersQuery({
    variables: { matchupId },
    skip: !matchupId,
  });

  // Fetch league positions to get position labels
  const { data: positionsData } = useGetPositionsForLeagueQuery({
    variables: { leagueId },
    skip: !leagueId,
  });

  // Fetch team names
  const { data: teamsData } = useGetLeagueTeamsQuery({
    variables: { leagueId },
    skip: !leagueId,
  });

  const team1Name = useMemo(() => {
    if (!team1Id || !teamsData?.leagueTeams) return 'Team 1';
    return (
      teamsData.leagueTeams.find((t) => t.id === team1Id)?.name ?? 'Team 1'
    );
  }, [team1Id, teamsData]);

  const team2Name = useMemo(() => {
    if (!team2Id || !teamsData?.leagueTeams) return 'Team 2';
    return (
      teamsData.leagueTeams.find((t) => t.id === team2Id)?.name ?? 'Team 2'
    );
  }, [team2Id, teamsData]);

  // Build season stats map directly from the matchup players data (no separate queries needed!)
  const seasonStatsMap = useMemo(() => {
    const map = new Map<number, SeasonStats>();

    if (!data?.getMatchupPlayers) {
      LOGGER.info('[MatchupRosterComparison] No matchup players data yet');
      return map;
    }

    LOGGER.info(
      '[MatchupRosterComparison] Building seasonStatsMap from',
      data.getMatchupPlayers.length,
      'players',
    );

    data.getMatchupPlayers.forEach((matchupPlayer: MatchupPlayerFragment) => {
      const playerId = matchupPlayer.playerId;
      const season = matchupPlayer.season;
      const batting = matchupPlayer.seasonBatting;
      const pitching = matchupPlayer.seasonPitching;
      const fielding = matchupPlayer.seasonFielding;

      if (!playerId || !season) return;

      map.set(playerId, {
        playerId,
        season,
        battingStats: batting
          ? {
              g: batting.games ?? null,
              pa: batting.plateAppearances ?? null,
              ab: batting.atBats ?? null,
              r: batting.runs ?? null,
              h: batting.hits ?? null,
              doubles: batting.doubles ?? null,
              triples: batting.triples ?? null,
              hr: batting.homeRuns ?? null,
              rbi: batting.rbi ?? null,
              sb: batting.stolenBases ?? null,
              cs: batting.caughtStealing ?? null,
              bb: batting.baseOnBalls ?? null,
              so: batting.strikeouts ?? null,
              gidp: batting.groundedIntoDoublePlays ?? null,
              hbp: batting.hitByPitch ?? null,
              sh: batting.sacrificeHits ?? null,
              sf: null,
              ibb: batting.intentionalBaseOnBalls ?? null,
            }
          : undefined,
        pitchingStats: pitching
          ? {
              g: pitching.games ?? null,
              w: pitching.wins ?? null,
              l: pitching.losses ?? null,
              gs: pitching.gamesStarted ?? null,
              gf: pitching.gamesFinished ?? null,
              cg: pitching.completeGames ?? null,
              sho: pitching.shutouts ?? null,
              sv: pitching.saves ?? null,
              ip: pitching.inningsPitched ?? null,
              h: pitching.hits ?? null,
              r: pitching.runs ?? null,
              er: pitching.earnedRuns ?? null,
              hr: pitching.homeRuns ?? null,
              bb: pitching.baseOnBalls ?? null,
              ibb: pitching.intentionalBaseOnBalls ?? null,
              so: pitching.strikeouts ?? null,
              hbp: pitching.hitByPitch ?? null,
              battersFaced: pitching.battersFaced ?? null,
              outsRecorded: pitching.outsRecorded ?? null,
            }
          : undefined,
        fieldingStats: fielding
          ? {
              g: fielding.games ?? null,
              innDef: fielding.inningsDefended ?? null,
              chances: fielding.chances ?? null,
              po: fielding.putouts ?? null,
              a: fielding.assists ?? null,
              eDef: fielding.errors ?? null,
              dpDef: fielding.doublePlays ?? null,
            }
          : undefined,
      });
    });

    LOGGER.info(
      '[MatchupRosterComparison] seasonStatsMap built with',
      map.size,
      'players',
    );
    if (map.size > 0) {
      const firstEntries = Array.from(map.entries()).slice(0, 2);
      LOGGER.info(
        '[MatchupRosterComparison] Sample SeasonStats:',
        firstEntries,
      );
    }

    return map;
  }, [data]);

  // Create position lookup map
  const positionMap = useMemo(() => {
    const map = new Map<number, string>();
    positionsData?.leaguePositions?.forEach(
      (pos: { id?: string | number | null; positionType?: string | null }) => {
        if (pos.id && pos.positionType) {
          map.set(
            typeof pos.id === 'string' ? parseInt(pos.id, 10) : pos.id,
            pos.positionType,
          );
        }
      },
    );
    return map;
  }, [positionsData]);

  // Separate and organize players by team and roster status (starter vs bench)
  const {
    team1Starters,
    team1Bench,
    team2Starters,
    team2Bench,
    team1Bullpen,
    team1BenchFielders,
    team2Bullpen,
    team2BenchFielders,
    team1Batters,
    team1Pitchers,
    team2Batters,
    team2Pitchers,
    team1BatterTotals,
    team1PitcherTotals,
    team2BatterTotals,
    team2PitcherTotals,
    calculatePlayerProjection,
    calculateGameScore,
  } = useMemo(() => {
    // Helper: Calculate score for a single game from raw stats
    const calculateGameScore = (
      game: NonNullable<MatchupPlayerFragment['games']>[number],
    ): number => {
      if (!scoringSettings) return 0;

      let total = 0;

      // Calculate batting score - map GraphQL field names (runs, hits) to DB names (r, h)
      if (game.battingGame) {
        const mappedBatting = mapBattingStats(game.battingGame);
        total += computeScoring(mappedBatting, scoringSettings.batting || {});
      }

      // Calculate pitching score - map GraphQL field names to DB names
      if (game.pitchingGame) {
        const mappedPitching = mapPitchingStats(game.pitchingGame);
        total += computeScoring(mappedPitching, scoringSettings.pitching || {});
      }

      // Calculate fielding score - map GraphQL field names to DB names
      if (game.fieldingGame) {
        const mappedFielding = mapFieldingStats(game.fieldingGame);
        total += computeScoring(mappedFielding, scoringSettings.fielding || {});
      }

      return total;
    };

    // Helper: Calculate projection for a player using real season stats and scoring settings
    const calculatePlayerProjection = (
      player: MatchupPlayerFragment,
    ): number => {
      const gamesPlayed = player.games?.length ?? 0;
      const actualScore =
        player.games?.reduce((sum, g) => sum + calculateGameScore(g), 0) ?? 0;
      // Use player-specific numberOfGames (SP gets spStartsPerMatchup, others get gamesPerMatchup)
      const playerTotalGames = player.numberOfGames ?? gamesPerMatchup;
      const gamesRemaining = playerTotalGames - gamesPlayed;

      // If all games played, no projection needed
      if (gamesRemaining <= 0) {
        return actualScore;
      }

      // Get season stats for this player
      const playerId = player.playerId;
      if (!playerId) {
        // Player ID missing, use fallback
        if (gamesPlayed > 0) {
          const avgPerGame = actualScore / gamesPlayed;
          return actualScore + avgPerGame * gamesRemaining;
        }
        return actualScore;
      }

      const seasonStats = seasonStatsMap.get(playerId);

      LOGGER.info('[calculatePlayerProjection] Player', playerId, ':', {
        hasSeasonStats: !!seasonStats,
        hasScoringSettings: !!scoringSettings,
        gamesPlayed,
        gamesRemaining,
        actualScore,
      });

      if (seasonStats && scoringSettings) {
        // Use real projection function with season stats
        try {
          const projection = calculateMatchupProjection(
            seasonStats,
            scoringSettings,
          );
          const projectedRemainingScore =
            projection.totalPerGame * gamesRemaining;
          LOGGER.info('[calculatePlayerProjection] Projection calculated:', {
            playerId,
            totalPerGame: projection.totalPerGame,
            projectedRemainingScore,
            finalTotal: actualScore + projectedRemainingScore,
          });
          return actualScore + projectedRemainingScore;
        } catch (error) {
          LOGGER.warn(
            'Error calculating projection for player',
            player.playerId,
            String(error),
          );
        }
      }

      // Fallback: Use average from games already played
      if (gamesPlayed > 0) {
        const avgPerGame = actualScore / gamesPlayed;
        return actualScore + avgPerGame * gamesRemaining;
      }

      // No data to project from
      return actualScore;
    };

    if (!data?.getMatchupPlayers) {
      return {
        team1Starters: [],
        team1Bench: [],
        team1Bullpen: [],
        team1BenchFielders: [],
        team2Starters: [],
        team2Bench: [],
        team2Bullpen: [],
        team2BenchFielders: [],
        team1Batters: [],
        team1Pitchers: [],
        team2Batters: [],
        team2Pitchers: [],
        team1Totals: { projected: 0, actual: 0 },
        team2Totals: { projected: 0, actual: 0 },
        team1BatterTotals: { projected: 0, actual: 0 },
        team1PitcherTotals: { projected: 0, actual: 0 },
        team2BatterTotals: { projected: 0, actual: 0 },
        team2PitcherTotals: { projected: 0, actual: 0 },
        team1ExpectedForGamesPlayed: 0,
        team2ExpectedForGamesPlayed: 0,
        calculatePlayerProjection,
        calculateGameScore,
      };
    }

    const team1All = data.getMatchupPlayers.filter(
      (mp: MatchupPlayerFragment) => mp.teamId === team1Id,
    );
    const team2All = data.getMatchupPlayers.filter(
      (mp: MatchupPlayerFragment) => mp.teamId === team2Id,
    );

    // Helper to check if a position is a pitcher position
    const isPitcherPosition = (
      positionId: number | null | undefined,
    ): boolean => {
      if (!positionId) return false;
      const posType = positionMap.get(positionId);
      return posType === 'SP' || posType === 'RP';
    };

    // Separate starters (have positionId) from bench (positionId is null)
    const team1Starters = team1All.filter(
      (p: MatchupPlayerFragment) => p.positionId !== null,
    );
    const team1Bench = team1All.filter(
      (p: MatchupPlayerFragment) => p.positionId === null,
    );
    const team2Starters = team2All.filter(
      (p: MatchupPlayerFragment) => p.positionId !== null,
    );
    const team2Bench = team2All.filter(
      (p: MatchupPlayerFragment) => p.positionId === null,
    );

    // Helper to check if a bench player is a pitcher based on eligiblePositions
    const PITCHING_POSITIONS = new Set(['SP', 'RP']);
    const isBenchPitcher = (p: MatchupPlayerFragment): boolean => {
      const positions = p.player?.eligiblePositions;
      if (!positions || positions.length === 0) return false;
      return positions.some((pos) => PITCHING_POSITIONS.has(pos));
    };
    const isBenchFielder = (p: MatchupPlayerFragment): boolean => {
      const positions = p.player?.eligiblePositions;
      if (!positions || positions.length === 0) return true; // default to bench if unknown
      return positions.some((pos) => !PITCHING_POSITIONS.has(pos));
    };

    // Split bench into bullpen (pitchers) and bench (fielders)
    const team1Bullpen = team1Bench.filter(isBenchPitcher);
    const team1BenchFielders = team1Bench.filter(isBenchFielder);
    const team2Bullpen = team2Bench.filter(isBenchPitcher);
    const team2BenchFielders = team2Bench.filter(isBenchFielder);

    // Further separate starters into batters and pitchers
    const team1Batters = team1Starters.filter(
      (p: MatchupPlayerFragment) => !isPitcherPosition(p.positionId),
    );
    const team1Pitchers = team1Starters.filter((p: MatchupPlayerFragment) =>
      isPitcherPosition(p.positionId),
    );
    const team2Batters = team2Starters.filter(
      (p: MatchupPlayerFragment) => !isPitcherPosition(p.positionId),
    );
    const team2Pitchers = team2Starters.filter((p: MatchupPlayerFragment) =>
      isPitcherPosition(p.positionId),
    );

    // Calculate separate totals for batters and pitchers
    const team1BatterTotals = {
      actual: team1Batters.reduce((sum: any, p: MatchupPlayerFragment) => {
        const gameSum =
          p.games?.reduce((s: any, g: any) => s + calculateGameScore(g), 0) ??
          0;
        return sum + gameSum;
      }, 0),
      projected: team1Batters.reduce(
        (sum: any, p: MatchupPlayerFragment) =>
          sum + calculatePlayerProjection(p),
        0,
      ),
    };

    const team1PitcherTotals = {
      actual: team1Pitchers.reduce((sum: any, p: MatchupPlayerFragment) => {
        const gameSum =
          p.games?.reduce((s: any, g: any) => s + calculateGameScore(g), 0) ??
          0;
        return sum + gameSum;
      }, 0),
      projected: team1Pitchers.reduce(
        (sum: any, p: MatchupPlayerFragment) =>
          sum + calculatePlayerProjection(p),
        0,
      ),
    };

    const team2BatterTotals = {
      actual: team2Batters.reduce((sum: any, p: MatchupPlayerFragment) => {
        const gameSum =
          p.games?.reduce((s: any, g: any) => s + calculateGameScore(g), 0) ??
          0;
        return sum + gameSum;
      }, 0),
      projected: team2Batters.reduce(
        (sum: any, p: MatchupPlayerFragment) =>
          sum + calculatePlayerProjection(p),
        0,
      ),
    };

    const team2PitcherTotals = {
      actual: team2Pitchers.reduce((sum: any, p: MatchupPlayerFragment) => {
        const gameSum =
          p.games?.reduce((s: any, g: any) => s + calculateGameScore(g), 0) ??
          0;
        return sum + gameSum;
      }, 0),
      projected: team2Pitchers.reduce(
        (sum: any, p: MatchupPlayerFragment) =>
          sum + calculatePlayerProjection(p),
        0,
      ),
    };

    return {
      team1Starters,
      team1Bench,
      team2Starters,
      team2Bench,
      team1Bullpen,
      team1BenchFielders,
      team2Bullpen,
      team2BenchFielders,
      team1Batters,
      team1Pitchers,
      team2Batters,
      team2Pitchers,
      team1BatterTotals,
      team1PitcherTotals,
      team2BatterTotals,
      team2PitcherTotals,
      calculatePlayerProjection,
      calculateGameScore,
    };
  }, [
    data,
    team1Id,
    team2Id,
    gamesPerMatchup,
    seasonStatsMap,
    scoringSettings,
    positionMap,
  ]);

  if (!team1Id || !team2Id) {
    return (
      <Card backgroundColor="$gray2" borderColor="$gray6" padding="$4">
        <Text color="$gray11">Teams not assigned to this matchup yet.</Text>
      </Card>
    );
  }

  if (loading) {
    return <SkeletonLoading team1Name={team1Name} team2Name={team2Name} />;
  }

  if (error) {
    return (
      <Card backgroundColor="$red2" borderColor="$red6" padding="$4">
        <Text color="$red11">
          Error loading matchup players: {error.message}
        </Text>
      </Card>
    );
  }

  const maxBullpenRows = Math.max(team1Bullpen.length, team2Bullpen.length);
  const maxBenchFielderRows = Math.max(
    team1BenchFielders.length,
    team2BenchFielders.length,
  );
  const maxBatterRows = Math.max(team1Batters.length, team2Batters.length);
  const maxPitcherRows = Math.max(team1Pitchers.length, team2Pitchers.length);

  // Helper to render player row with position
  // Helper to format accumulated stats for display (only shows stats that contributed to this player's actual score)
  const formatAccumulatedStats = (
    player: MatchupPlayerFragment | undefined,
  ): string => {
    if (
      !player ||
      !player.games ||
      player.games.length === 0 ||
      !scoringSettings
    ) {
      return '';
    }

    const stats: string[] = [];

    // Map of stat field names to their display labels and extraction functions
    type BattingStatsType = NonNullable<
      NonNullable<MatchupPlayerFragment['games']>[number]['battingGame']
    >;
    type PitchingStatsType = NonNullable<
      NonNullable<MatchupPlayerFragment['games']>[number]['pitchingGame']
    >;
    type FieldingStatsType = NonNullable<
      NonNullable<MatchupPlayerFragment['games']>[number]['fieldingGame']
    >;
    type StatExtractor<T> = (stats: T) => number;
    interface StatConfig<T> {
      label: string;
      extract: StatExtractor<T>;
      scoringKey: string;
    }

    // Aggregate batting stats (only show stats that actually contributed points for this player)
    const battingGames = player.games.filter((g) => g.battingGame);
    if (battingGames.length > 0) {
      const battingStats: StatConfig<BattingStatsType>[] = [
        {
          label: 'R',
          extract: (s: BattingStatsType) => s?.runs ?? 0,
          scoringKey: 'r',
        },
        {
          label: 'H',
          extract: (s: BattingStatsType) => s?.hits ?? 0,
          scoringKey: 'h',
        },
        {
          label: '2B',
          extract: (s: BattingStatsType) => s?.doubles ?? 0,
          scoringKey: 'doubles',
        },
        {
          label: '3B',
          extract: (s: BattingStatsType) => s?.triples ?? 0,
          scoringKey: 'triples',
        },
        {
          label: 'HR',
          extract: (s: BattingStatsType) => s?.homeRuns ?? 0,
          scoringKey: 'hr',
        },
        {
          label: 'RBI',
          extract: (s: BattingStatsType) => s?.rbi ?? 0,
          scoringKey: 'rbi',
        },
        {
          label: 'SB',
          extract: (s: BattingStatsType) => s?.stolenBases ?? 0,
          scoringKey: 'sb',
        },
        {
          label: 'CS',
          extract: (s: BattingStatsType) => s?.caughtStealing ?? 0,
          scoringKey: 'cs',
        },
        {
          label: 'BB',
          extract: (s: BattingStatsType) => s?.baseOnBalls ?? 0,
          scoringKey: 'bb',
        },
        {
          label: 'SO',
          extract: (s: BattingStatsType) => s?.strikeouts ?? 0,
          scoringKey: 'so',
        },
        {
          label: 'HBP',
          extract: (s: BattingStatsType) => s?.hitByPitch ?? 0,
          scoringKey: 'hbp',
        },
      ];

      const battingParts: string[] = [];

      // Show batting line (H-for-AB) for non-pitcher positions
      const posType = player.positionId
        ? positionMap.get(player.positionId)
        : null;
      const isPitcher = posType === 'SP' || posType === 'RP';
      if (!isPitcher) {
        const totalHits = battingGames.reduce((sum, g) => {
          if (!g.battingGame) return sum;
          return sum + (g.battingGame.hits ?? 0);
        }, 0);
        const totalAB = battingGames.reduce((sum, g) => {
          if (!g.battingGame) return sum;
          return sum + (g.battingGame.atBats ?? 0);
        }, 0);
        battingParts.push(`${totalHits}-${totalAB}`);
      }

      for (const stat of battingStats) {
        // Check if this stat has a scoring value configured
        const scoringValue = scoringSettings.batting[stat.scoringKey];
        if (scoringValue !== undefined && scoringValue !== 0) {
          // Calculate the total for this stat across all games
          const total = battingGames.reduce((sum, g) => {
            if (!g.battingGame) return sum;
            return sum + stat.extract(g.battingGame);
          }, 0);

          // Only show if this player actually has non-zero value for this stat
          if (total !== 0) {
            battingParts.push(`${total}${stat.label}`);
          }
        }
      }

      if (battingParts.length > 0) {
        stats.push(battingParts.join(', '));
      }
    }

    // Aggregate pitching stats (only show stats that actually contributed points for this player)
    const pitchingGames = player.games.filter((g) => g.pitchingGame);
    if (pitchingGames.length > 0) {
      const pitchingStats: StatConfig<PitchingStatsType>[] = [
        {
          label: 'W',
          extract: (s: PitchingStatsType) => s?.wins ?? 0,
          scoringKey: 'w',
        },
        {
          label: 'L',
          extract: (s: PitchingStatsType) => s?.losses ?? 0,
          scoringKey: 'l',
        },
        {
          label: 'SV',
          extract: (s: PitchingStatsType) => s?.saves ?? 0,
          scoringKey: 'sv',
        },
        {
          label: 'H',
          extract: (s: PitchingStatsType) => s?.hits ?? 0,
          scoringKey: 'h',
        },
        {
          label: 'ER',
          extract: (s: PitchingStatsType) => s?.earnedRuns ?? 0,
          scoringKey: 'er',
        },
        {
          label: 'BB',
          extract: (s: PitchingStatsType) => s?.baseOnBalls ?? 0,
          scoringKey: 'bb',
        },
        {
          label: 'SO',
          extract: (s: PitchingStatsType) => s?.strikeouts ?? 0,
          scoringKey: 'so',
        },
      ];

      const pitchingParts: string[] = [];

      // Handle IP separately (calculated from outsRecorded)
      const outsRecordedScoring = scoringSettings.pitching.outsRecorded;
      if (outsRecordedScoring !== undefined && outsRecordedScoring !== 0) {
        const totalOuts = pitchingGames.reduce(
          (sum, g) => sum + (g.pitchingGame?.outsRecorded ?? 0),
          0,
        );
        if (totalOuts > 0) {
          const totalIP = totalOuts / 3;
          pitchingParts.push(`${totalIP.toFixed(1)}IP`);
        }
      }

      for (const stat of pitchingStats) {
        const scoringValue = scoringSettings.pitching[stat.scoringKey];
        if (scoringValue !== undefined && scoringValue !== 0) {
          const total = pitchingGames.reduce((sum, g) => {
            if (!g.pitchingGame) return sum;
            return sum + stat.extract(g.pitchingGame);
          }, 0);

          // Only show if this player actually has non-zero value for this stat
          if (total !== 0) {
            pitchingParts.push(`${total}${stat.label}`);
          }
        }
      }

      if (pitchingParts.length > 0) {
        stats.push(pitchingParts.join(', '));
      }
    }

    // Aggregate fielding stats (only show stats that actually contributed points for this player)
    const fieldingGames = player.games.filter((g) => g.fieldingGame);
    if (fieldingGames.length > 0) {
      const fieldingStats: StatConfig<FieldingStatsType>[] = [
        {
          label: 'E',
          extract: (s: FieldingStatsType) => s?.errors ?? 0,
          scoringKey: 'eDef',
        },
      ];

      const fieldingParts: string[] = [];
      for (const stat of fieldingStats) {
        const scoringValue = scoringSettings.fielding[stat.scoringKey];
        if (scoringValue !== undefined && scoringValue !== 0) {
          const total = fieldingGames.reduce((sum, g) => {
            if (!g.fieldingGame) return sum;
            return sum + stat.extract(g.fieldingGame);
          }, 0);

          // Only show if this player actually has non-zero value for this stat
          if (total !== 0) {
            fieldingParts.push(`${total}${stat.label}`);
          }
        }
      }

      if (fieldingParts.length > 0) {
        stats.push(fieldingParts.join(', '));
      }
    }

    return stats.join(' • ');
  };

  const renderPlayerRow = (
    team1Player: MatchupPlayerFragment | undefined,
    team2Player: MatchupPlayerFragment | undefined,
    index: number | string,
    rowIndex = 0,
  ) => {
    const team1Actual =
      team1Player?.games?.reduce(
        (sum, game) => sum + (calculateGameScore?.(game) ?? 0),
        0,
      ) ?? 0;
    const team2Actual =
      team2Player?.games?.reduce(
        (sum, game) => sum + (calculateGameScore?.(game) ?? 0),
        0,
      ) ?? 0;
    const team1Proj = team1Player ? calculatePlayerProjection(team1Player) : 0;
    const team2Proj = team2Player ? calculatePlayerProjection(team2Player) : 0;

    // Check if any games have been played
    const team1HasPlayed = (team1Player?.games?.length ?? 0) > 0;
    const team2HasPlayed = (team2Player?.games?.length ?? 0) > 0;

    // Calculate expected score based on games played (for color coding)
    const team1GamesPlayed = team1Player?.games?.length ?? 0;
    const team2GamesPlayed = team2Player?.games?.length ?? 0;
    const team1ExpectedForGamesPlayed =
      team1GamesPlayed > 0
        ? (team1Proj / gamesPerMatchup) * team1GamesPlayed
        : 0;
    const team2ExpectedForGamesPlayed =
      team2GamesPlayed > 0
        ? (team2Proj / gamesPerMatchup) * team2GamesPlayed
        : 0;

    // Determine color based on performance vs projection
    const team1ScoreColor = !team1HasPlayed
      ? '$gray9'
      : team1Actual >= team1ExpectedForGamesPlayed
        ? '$green10'
        : '$red10';
    const team2ScoreColor = !team2HasPlayed
      ? '$gray9'
      : team2Actual >= team2ExpectedForGamesPlayed
        ? '$green10'
        : '$red10';

    const team1Position = team1Player?.positionId
      ? positionMap.get(team1Player.positionId)
      : (team1Player?.player?.eligiblePositions?.[0] ?? null);
    const team2Position = team2Player?.positionId
      ? positionMap.get(team2Player.positionId)
      : (team2Player?.player?.eligiblePositions?.[0] ?? null);

    // Get accumulated stats breakdown
    const team1Stats = formatAccumulatedStats(team1Player);
    const team2Stats = formatAccumulatedStats(team2Player);

    // Position colors for badges
    const team1PosBadge = getPositionColors(team1Position);
    const team2PosBadge = getPositionColors(team2Position);

    // Zebra stripe
    const isEvenRow = rowIndex % 2 === 0;

    return (
      <XStack
        key={index}
        width="100%"
        paddingVertical="$2.5"
        paddingLeft="$3"
        paddingRight="$3"
        borderBottomWidth={1}
        borderBottomColor="$gray4"
        backgroundColor={isEvenRow ? undefined : '$gray2'}
        hoverStyle={{ backgroundColor: '$gray3' }}
        justifyContent="space-between"
        alignItems="center"
      >
        {/* Team 1 Side - 47% */}
        <XStack width="47%" alignItems="center" gap="$2">
          {/* Team 1 Player - Flexible width */}
          <XStack flex={1} gap="$2" alignItems="center" minWidth={0}>
            {/* Player Avatar */}
            {team1Player && (
              <YStack
                width={32}
                height={32}
                borderRadius={16}
                backgroundColor={team1PosBadge.bg}
                justifyContent="center"
                alignItems="center"
                flexShrink={0}
              >
                <Text fontSize="$1" fontWeight="800" color={team1PosBadge.text}>
                  {team1Position || '?'}
                </Text>
              </YStack>
            )}
            <YStack
              flex={1}
              justifyContent="center"
              minWidth={0}
              overflow="hidden"
            >
              {team1Player ? (
                <>
                  <Text
                    fontSize="$3"
                    fontWeight="600"
                    color="$gray12"
                    cursor="pointer"
                    hoverStyle={{
                      color: '$blue11',
                      textDecoration: 'underline',
                    }}
                    onPress={() => {
                      if (team1Player?.playerId && team1Player?.player) {
                        setSelectedPlayer({
                          id: team1Player.playerId,
                          name: `${team1Player.player.firstName} ${team1Player.player.lastName}`,
                        });
                        setSeasonStatsModalOpen(true);
                      }
                    }}
                  >
                    {team1Player.player?.firstName}{' '}
                    {team1Player.player?.lastName}
                  </Text>
                  <Text fontSize="$1" color="$gray10">
                    Season {team1Player.season}
                    {team1Player.games && team1Player.games.length > 0 ? (
                      <>
                        <Text color="$green10">
                          {' '}
                          • {team1Player.games.length}/
                          {team1Player.numberOfGames ?? gamesPerMatchup} games
                        </Text>
                        {(() => {
                          const loadingCount = team1Player.games.filter(
                            (g) =>
                              g.statsLoadingStatus === 'loading' ||
                              g.statsLoadingStatus === 'pending',
                          ).length;
                          const failedCount = team1Player.games.filter(
                            (g) => g.statsLoadingStatus === 'failed',
                          ).length;

                          if (loadingCount > 0) {
                            return (
                              <Text color="$blue10">
                                {' '}
                                • Loading stats ({loadingCount})
                              </Text>
                            );
                          }
                          if (failedCount > 0) {
                            return (
                              <Text color="$red10">
                                {' '}
                                • Failed ({failedCount})
                              </Text>
                            );
                          }
                          return null;
                        })()}
                      </>
                    ) : (
                      <Text color="$gray8"> • Yet to play</Text>
                    )}
                  </Text>
                  {team1Stats && (
                    <Text fontSize="$1" color="$blue10" marginTop="$1">
                      {team1Stats}
                    </Text>
                  )}
                </>
              ) : (
                <Text fontSize="$3" color="$gray8">
                  —
                </Text>
              )}
            </YStack>
          </XStack>

          {/* Team 1 Projected Score */}
          <YStack
            width={60}
            flexShrink={0}
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize="$2" fontWeight="500" color="$gray10">
              {team1Player ? team1Proj.toFixed(1) : '—'}
            </Text>
          </YStack>

          {/* Team 1 Actual Score */}
          <YStack
            width={60}
            flexShrink={0}
            alignItems="center"
            justifyContent="center"
          >
            <Text
              fontSize="$4"
              fontWeight="600"
              color={team1ScoreColor}
              cursor={team1HasPlayed && team1Player ? 'pointer' : 'default'}
              hoverStyle={
                team1HasPlayed && team1Player
                  ? { textDecoration: 'underline', opacity: 0.8 }
                  : {}
              }
              onPress={() => {
                if (team1HasPlayed && team1Player && team1Player.player) {
                  setSelectedMatchupPlayer(team1Player);
                  setSelectedMatchupPlayerName(
                    `${team1Player.player.firstName} ${team1Player.player.lastName}`,
                  );
                  setMatchupStatsModalOpen(true);
                }
              }}
            >
              {team1Player
                ? team1HasPlayed
                  ? team1Actual.toFixed(1)
                  : '—'
                : '—'}
            </Text>
          </YStack>
        </XStack>

        {/* Center Separator - Fixed position */}
        <Separator
          vertical
          height="100%"
          borderColor="$gray8"
          borderWidth={2}
        />

        {/* Team 2 Side - 47% */}
        <XStack width="47%" alignItems="center" gap="$2">
          {/* Team 2 Actual Score */}
          <YStack
            width={60}
            flexShrink={0}
            alignItems="center"
            justifyContent="center"
          >
            <Text
              fontSize="$4"
              fontWeight="600"
              color={team2ScoreColor}
              cursor={team2HasPlayed && team2Player ? 'pointer' : 'default'}
              hoverStyle={
                team2HasPlayed && team2Player
                  ? { textDecoration: 'underline', opacity: 0.8 }
                  : {}
              }
              onPress={() => {
                if (team2HasPlayed && team2Player && team2Player.player) {
                  setSelectedMatchupPlayer(team2Player);
                  setSelectedMatchupPlayerName(
                    `${team2Player.player.firstName} ${team2Player.player.lastName}`,
                  );
                  setMatchupStatsModalOpen(true);
                }
              }}
            >
              {team2Player
                ? team2HasPlayed
                  ? team2Actual.toFixed(1)
                  : '—'
                : '—'}
            </Text>
          </YStack>

          {/* Team 2 Projected Score */}
          <YStack
            width={60}
            flexShrink={0}
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize="$2" fontWeight="500" color="$gray10">
              {team2Player ? team2Proj.toFixed(1) : '—'}
            </Text>
          </YStack>

          {/* Team 2 Player - Flexible width */}
          <XStack
            flex={1}
            gap="$2"
            alignItems="center"
            justifyContent="flex-end"
            minWidth={0}
          >
            <YStack
              flex={1}
              alignItems="flex-end"
              justifyContent="center"
              minWidth={0}
              overflow="hidden"
            >
              {team2Player ? (
                <>
                  <Text
                    fontSize="$3"
                    fontWeight="600"
                    color="$gray12"
                    textAlign="right"
                    cursor="pointer"
                    hoverStyle={{
                      color: '$blue11',
                      textDecoration: 'underline',
                    }}
                    onPress={() => {
                      if (team2Player?.playerId && team2Player?.player) {
                        setSelectedPlayer({
                          id: team2Player.playerId,
                          name: `${team2Player.player.firstName} ${team2Player.player.lastName}`,
                        });
                        setSeasonStatsModalOpen(true);
                      }
                    }}
                  >
                    {team2Player.player?.firstName}{' '}
                    {team2Player.player?.lastName}
                  </Text>
                  <Text fontSize="$1" color="$gray10" textAlign="right">
                    Season {team2Player.season}
                    {team2Player.games && team2Player.games.length > 0 ? (
                      <>
                        <Text color="$green10">
                          {' '}
                          • {team2Player.games.length}/
                          {team2Player.numberOfGames ?? gamesPerMatchup} games
                        </Text>
                        {(() => {
                          const loadingCount = team2Player.games.filter(
                            (g) =>
                              g.statsLoadingStatus === 'loading' ||
                              g.statsLoadingStatus === 'pending',
                          ).length;
                          const failedCount = team2Player.games.filter(
                            (g) => g.statsLoadingStatus === 'failed',
                          ).length;

                          if (loadingCount > 0) {
                            return (
                              <Text color="$blue10">
                                {' '}
                                • Loading stats ({loadingCount})
                              </Text>
                            );
                          }
                          if (failedCount > 0) {
                            return (
                              <Text color="$red10">
                                {' '}
                                • Failed ({failedCount})
                              </Text>
                            );
                          }
                          return null;
                        })()}
                      </>
                    ) : (
                      <Text color="$gray8"> • Yet to play</Text>
                    )}
                  </Text>
                  {team2Stats && (
                    <Text
                      fontSize="$1"
                      color="$blue10"
                      marginTop="$1"
                      textAlign="right"
                    >
                      {team2Stats}
                    </Text>
                  )}
                </>
              ) : (
                <Text fontSize="$3" color="$gray8">
                  —
                </Text>
              )}
            </YStack>
            {/* Player Avatar */}
            {team2Player && (
              <YStack
                width={32}
                height={32}
                borderRadius={16}
                backgroundColor={team2PosBadge.bg}
                justifyContent="center"
                alignItems="center"
                flexShrink={0}
              >
                <Text fontSize="$1" fontWeight="800" color={team2PosBadge.text}>
                  {team2Position || '?'}
                </Text>
              </YStack>
            )}
          </XStack>
        </XStack>
      </XStack>
    );
  };

  // Show loading state if scoring settings are loading
  if (scoringLoading) {
    return (
      <Card elevate size="$4" bordered backgroundColor="$background">
        <Card.Header padded>
          <XStack justifyContent="space-between" alignItems="center">
            <H4>Player Matchups</H4>
            <Text fontSize="$2" color="$gray10">
              Loading projections...
            </Text>
          </XStack>
        </Card.Header>
      </Card>
    );
  }

  const playerCount = data?.getMatchupPlayers?.length ?? 0;

  return (
    <Card elevate size="$4" bordered backgroundColor="$background">
      <Card.Header padded>
        <XStack justifyContent="space-between" alignItems="center">
          <H4>Player Matchups</H4>
          <Text fontSize="$2" color="$gray10">
            {team1Starters.length + team1Bench.length} vs{' '}
            {team2Starters.length + team2Bench.length} players
          </Text>
        </XStack>
      </Card.Header>

      {/* Warning if season stats are missing */}
      {seasonStatsMap.size === 0 && playerCount > 0 && (
        <YStack
          backgroundColor="$yellow2"
          padding="$3"
          borderBottomWidth={1}
          borderBottomColor="$yellow6"
        >
          <Text fontSize="$2" color="$yellow11" fontWeight="600">
            <span role="img" aria-label="Warning">
              ⚠️
            </span>{' '}
            Season statistics not available
          </Text>
          <Text fontSize="$1" color="$yellow10" marginTop="$1">
            Projections are based on games played in this matchup only. Load
            season stats for more accurate projections.
          </Text>
        </YStack>
      )}

      <Separator />

      {/* Hitters Section Table */}
      <YStack
        overflow="hidden"
        borderRadius="$4"
        borderWidth={1}
        borderColor="$surfacePanelBorder"
        backgroundColor="$background"
        margin="$3"
        marginBottom={0}
      >
        {/* Starters Section Header */}
        <YStack
          backgroundColor="$blue3"
          paddingVertical="$2"
          paddingHorizontal="$3"
        >
          <H5 color="$blue11">Starting Lineup</H5>
        </YStack>

        {/* Header Row for Starters */}
        <XStack
          width="100%"
          paddingVertical="$2.5"
          paddingLeft="$3"
          paddingRight="$3"
          backgroundColor="$blue2"
          borderBottomWidth={2}
          borderBottomColor="$blue7"
          justifyContent="space-between"
          alignItems="center"
        >
          {/* Team 1 Side - 47% */}
          <XStack width="47%" alignItems="center" gap="$2">
            <YStack width={40} flexShrink={0}>
              <Text
                fontSize="$2"
                fontWeight="bold"
                color="$blue11"
                textTransform="uppercase"
              >
                Pos
              </Text>
            </YStack>
            <YStack flex={1} minWidth={0}>
              <Text
                fontSize="$2"
                fontWeight="bold"
                color="$blue11"
                textTransform="uppercase"
              >
                {team1Name}
              </Text>
            </YStack>
            <YStack width={60} flexShrink={0} alignItems="center">
              <Text
                fontSize="$2"
                fontWeight="bold"
                color="$gray10"
                textTransform="uppercase"
              >
                Proj
              </Text>
            </YStack>
            <YStack width={60} flexShrink={0} alignItems="center">
              <Text
                fontSize="$2"
                fontWeight="bold"
                color="$blue11"
                textTransform="uppercase"
              >
                Actual
              </Text>
            </YStack>
          </XStack>
          <Separator vertical height="100%" borderColor="$blue6" />
          {/* Team 2 Side - 47% */}
          <XStack width="47%" alignItems="center" gap="$2">
            <YStack width={60} flexShrink={0} alignItems="center">
              <Text
                fontSize="$2"
                fontWeight="bold"
                color="$blue11"
                textTransform="uppercase"
              >
                Actual
              </Text>
            </YStack>
            <YStack width={60} flexShrink={0} alignItems="center">
              <Text
                fontSize="$2"
                fontWeight="bold"
                color="$gray10"
                textTransform="uppercase"
              >
                Proj
              </Text>
            </YStack>
            <YStack flex={1} alignItems="flex-end" minWidth={0}>
              <Text
                fontSize="$2"
                fontWeight="bold"
                color="$blue11"
                textTransform="uppercase"
              >
                {team2Name}
              </Text>
            </YStack>
            <YStack width={40} flexShrink={0} alignItems="flex-end">
              <Text
                fontSize="$2"
                fontWeight="bold"
                color="$blue11"
                textTransform="uppercase"
              >
                Pos
              </Text>
            </YStack>
          </XStack>
        </XStack>

        {/* Batters Section */}
        {(team1Batters.length > 0 || team2Batters.length > 0) && (
          <>
            <YStack
              backgroundColor="$green3"
              paddingVertical="$2"
              paddingHorizontal="$3"
              marginTop="$2"
            >
              <H5 color="$green11">Batters</H5>
            </YStack>
            <YStack>
              {Array.from({ length: maxBatterRows }).map((_, index) =>
                renderPlayerRow(
                  team1Batters[index],
                  team2Batters[index],
                  `batter-${index}`,
                  index,
                ),
              )}
            </YStack>
          </>
        )}

        {/* Totals Row - Hitters */}
        <XStack
          width="100%"
          paddingVertical="$3"
          paddingLeft="$3"
          paddingRight="$3"
          backgroundColor="$blue2"
          borderTopWidth={2}
          borderTopColor="$blue8"
          marginTop="$3"
          justifyContent="space-between"
          alignItems="center"
        >
          {/* Team 1 Side - 47% */}
          <XStack width="47%" alignItems="center" gap="$2">
            <YStack flex={1} minWidth={0}>
              <Text fontSize="$4" fontWeight="800" color="$blue11">
                Hitters Total
              </Text>
            </YStack>
            <YStack width={60} flexShrink={0} alignItems="center">
              <Text fontSize="$2" fontWeight="600" color="$gray10">
                {team1BatterTotals.projected.toFixed(1)}
              </Text>
            </YStack>
            <YStack width={60} flexShrink={0} alignItems="center">
              <Text
                fontSize="$5"
                fontWeight="900"
                color={
                  team1BatterTotals.actual >= team2BatterTotals.actual
                    ? '$green10'
                    : '$red10'
                }
              >
                {team1BatterTotals.actual.toFixed(1)}
              </Text>
            </YStack>
          </XStack>
          <Separator
            vertical
            height="100%"
            borderColor="$blue8"
            borderWidth={2}
          />
          {/* Team 2 Side - 47% */}
          <XStack width="47%" alignItems="center" gap="$2">
            <YStack width={60} flexShrink={0} alignItems="center">
              <Text
                fontSize="$5"
                fontWeight="900"
                color={
                  team2BatterTotals.actual >= team1BatterTotals.actual
                    ? '$green10'
                    : '$red10'
                }
              >
                {team2BatterTotals.actual.toFixed(1)}
              </Text>
            </YStack>
            <YStack width={60} flexShrink={0} alignItems="center">
              <Text fontSize="$2" fontWeight="600" color="$gray10">
                {team2BatterTotals.projected.toFixed(1)}
              </Text>
            </YStack>
            <YStack flex={1} alignItems="flex-end" minWidth={0}>
              <Text fontSize="$4" fontWeight="800" color="$blue11">
                Hitters Total
              </Text>
            </YStack>
          </XStack>
        </XStack>
      </YStack>

      {/* Pitchers Section Table */}
      {(team1Pitchers.length > 0 || team2Pitchers.length > 0) && (
        <YStack
          overflow="hidden"
          borderRadius="$4"
          borderWidth={1}
          borderColor="$surfacePanelBorder"
          backgroundColor="$background"
          margin="$3"
          marginBottom={0}
        >
          <YStack
            backgroundColor="$blue3"
            paddingVertical="$2"
            paddingHorizontal="$3"
          >
            <H5 color="$blue11">Pitchers</H5>
          </YStack>
          <YStack>
            {Array.from({ length: maxPitcherRows }).map((_, index) =>
              renderPlayerRow(
                team1Pitchers[index],
                team2Pitchers[index],
                `pitcher-${index}`,
                index,
              ),
            )}
          </YStack>

          {/* Totals Row - Pitchers */}
          <XStack
            width="100%"
            paddingVertical="$3"
            paddingLeft="$3"
            paddingRight="$3"
            backgroundColor="$blue2"
            borderTopWidth={2}
            borderTopColor="$blue8"
            marginTop="$3"
            justifyContent="space-between"
            alignItems="center"
          >
            {/* Team 1 Side - 47% */}
            <XStack width="47%" alignItems="center" gap="$2">
              <YStack flex={1} minWidth={0}>
                <Text fontSize="$4" fontWeight="800" color="$blue11">
                  Pitchers Total
                </Text>
              </YStack>
              <YStack width={60} flexShrink={0} alignItems="center">
                <Text fontSize="$2" fontWeight="600" color="$gray10">
                  {team1PitcherTotals.projected.toFixed(1)}
                </Text>
              </YStack>
              <YStack width={60} flexShrink={0} alignItems="center">
                <Text
                  fontSize="$5"
                  fontWeight="900"
                  color={
                    team1PitcherTotals.actual >= team2PitcherTotals.actual
                      ? '$green10'
                      : '$red10'
                  }
                >
                  {team1PitcherTotals.actual.toFixed(1)}
                </Text>
              </YStack>
            </XStack>
            <Separator
              vertical
              height="100%"
              borderColor="$blue8"
              borderWidth={2}
            />
            {/* Team 2 Side - 47% */}
            <XStack width="47%" alignItems="center" gap="$2">
              <YStack width={60} flexShrink={0} alignItems="center">
                <Text
                  fontSize="$5"
                  fontWeight="900"
                  color={
                    team2PitcherTotals.actual >= team1PitcherTotals.actual
                      ? '$green10'
                      : '$red10'
                  }
                >
                  {team2PitcherTotals.actual.toFixed(1)}
                </Text>
              </YStack>
              <YStack width={60} flexShrink={0} alignItems="center">
                <Text fontSize="$2" fontWeight="600" color="$gray10">
                  {team2PitcherTotals.projected.toFixed(1)}
                </Text>
              </YStack>
              <YStack flex={1} alignItems="flex-end" minWidth={0}>
                <Text fontSize="$4" fontWeight="800" color="$blue11">
                  Pitchers Total
                </Text>
              </YStack>
            </XStack>
          </XStack>
        </YStack>
      )}

      {/* Bench Section Table */}
      {(team1Bench.length > 0 || team2Bench.length > 0) && (
        <YStack
          overflow="hidden"
          borderRadius="$4"
          borderWidth={1}
          borderColor="$surfacePanelBorder"
          backgroundColor="$background"
          margin="$3"
          marginBottom={0}
        >
          <XStack
            paddingVertical="$2"
            paddingHorizontal="$3"
            justifyContent="center"
            alignItems="center"
            gap="$2"
            cursor="pointer"
            hoverStyle={{ opacity: 0.8 }}
            onPress={() => setShowBench(!showBench)}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                transition: 'transform 250ms ease',
                transform: showBench ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            >
              <Text fontSize="$3" color="$gray11">
                ▶
              </Text>
            </span>
            <Text fontSize="$3" fontWeight="600" color="$gray11">
              {showBench ? 'Hide' : 'Show'} Bench (
              {team1Bench.length + team2Bench.length} players)
            </Text>
          </XStack>

          {/* Animated bench content wrapper */}
          <YStack
            style={{
              display: 'grid',
              gridTemplateRows: showBench ? '1fr' : '0fr',
              transition: 'grid-template-rows 300ms ease-in-out',
            }}
          >
            <YStack overflow="hidden">
              {/* Bullpen Section (bench pitchers) */}
              {(team1Bullpen.length > 0 || team2Bullpen.length > 0) && (
                <>
                  {/* Bullpen Section Header */}
                  <YStack
                    backgroundColor="$blue3"
                    paddingVertical="$2"
                    paddingHorizontal="$3"
                  >
                    <H5 color="$blue11">Bullpen</H5>
                  </YStack>

                  {/* Header Row for Bullpen */}
                  <XStack
                    width="100%"
                    paddingVertical="$2.5"
                    paddingLeft="$3"
                    paddingRight="$3"
                    backgroundColor="$gray2"
                    borderBottomWidth={2}
                    borderBottomColor="$gray7"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    {/* Team 1 Side - 47% */}
                    <XStack width="47%" alignItems="center" gap="$2">
                      <YStack flex={1} minWidth={0}>
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$blue11"
                          textTransform="uppercase"
                        >
                          {team1Name} Bullpen
                        </Text>
                      </YStack>
                      <YStack width={60} flexShrink={0} alignItems="center">
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$gray9"
                          textTransform="uppercase"
                        >
                          Proj
                        </Text>
                      </YStack>
                      <YStack width={60} flexShrink={0} alignItems="center">
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$gray10"
                          textTransform="uppercase"
                        >
                          Actual
                        </Text>
                      </YStack>
                    </XStack>
                    <Separator
                      vertical
                      height="100%"
                      borderColor="$gray8"
                      borderWidth={2}
                    />
                    {/* Team 2 Side - 47% */}
                    <XStack width="47%" alignItems="center" gap="$2">
                      <YStack width={60} flexShrink={0} alignItems="center">
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$gray10"
                          textTransform="uppercase"
                        >
                          Actual
                        </Text>
                      </YStack>
                      <YStack width={60} flexShrink={0} alignItems="center">
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$gray9"
                          textTransform="uppercase"
                        >
                          Proj
                        </Text>
                      </YStack>
                      <YStack flex={1} alignItems="flex-end" minWidth={0}>
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$blue11"
                          textTransform="uppercase"
                        >
                          {team2Name} Bullpen
                        </Text>
                      </YStack>
                    </XStack>
                  </XStack>

                  {/* Bullpen Rows */}
                  <YStack>
                    {Array.from({ length: maxBullpenRows }).map((_, index) =>
                      renderPlayerRow(
                        team1Bullpen[index],
                        team2Bullpen[index],
                        `bullpen-${index}`,
                        index,
                      ),
                    )}
                  </YStack>
                </>
              )}

              {/* Bench Section (fielders) */}
              {(team1BenchFielders.length > 0 ||
                team2BenchFielders.length > 0) && (
                <>
                  {/* Bench Section Header */}
                  <YStack
                    backgroundColor="$blue3"
                    paddingVertical="$2"
                    paddingHorizontal="$3"
                  >
                    <H5 color="$blue11">Bench</H5>
                  </YStack>

                  {/* Header Row for Bench */}
                  <XStack
                    width="100%"
                    paddingVertical="$2.5"
                    paddingLeft="$3"
                    paddingRight="$3"
                    backgroundColor="$gray2"
                    borderBottomWidth={2}
                    borderBottomColor="$gray7"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    {/* Team 1 Side - 47% */}
                    <XStack width="47%" alignItems="center" gap="$2">
                      <YStack flex={1} minWidth={0}>
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$blue11"
                          textTransform="uppercase"
                        >
                          {team1Name} Bench
                        </Text>
                      </YStack>
                      <YStack width={60} flexShrink={0} alignItems="center">
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$gray9"
                          textTransform="uppercase"
                        >
                          Proj
                        </Text>
                      </YStack>
                      <YStack width={60} flexShrink={0} alignItems="center">
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$gray10"
                          textTransform="uppercase"
                        >
                          Actual
                        </Text>
                      </YStack>
                    </XStack>
                    <Separator
                      vertical
                      height="100%"
                      borderColor="$gray8"
                      borderWidth={2}
                    />
                    {/* Team 2 Side - 47% */}
                    <XStack width="47%" alignItems="center" gap="$2">
                      <YStack width={60} flexShrink={0} alignItems="center">
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$gray10"
                          textTransform="uppercase"
                        >
                          Actual
                        </Text>
                      </YStack>
                      <YStack width={60} flexShrink={0} alignItems="center">
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$gray9"
                          textTransform="uppercase"
                        >
                          Proj
                        </Text>
                      </YStack>
                      <YStack flex={1} alignItems="flex-end" minWidth={0}>
                        <Text
                          fontSize="$2"
                          fontWeight="bold"
                          color="$blue11"
                          textTransform="uppercase"
                        >
                          {team2Name} Bench
                        </Text>
                      </YStack>
                    </XStack>
                  </XStack>

                  {/* Bench Rows */}
                  <YStack>
                    {Array.from({ length: maxBenchFielderRows }).map(
                      (_, index) =>
                        renderPlayerRow(
                          team1BenchFielders[index],
                          team2BenchFielders[index],
                          `bench-${index}`,
                          index,
                        ),
                    )}
                  </YStack>
                </>
              )}
            </YStack>
          </YStack>
        </YStack>
      )}

      {/* Player Season Stats Modal (for player name clicks) */}
      <PlayerSeasonStatsModal
        open={seasonStatsModalOpen}
        onOpenChange={setSeasonStatsModalOpen}
        playerId={selectedPlayer?.id ?? null}
        playerName={selectedPlayer?.name ?? ''}
      />

      {/* Player Matchup Stats Modal (for score clicks) */}
      <PlayerMatchupStatsModal
        open={matchupStatsModalOpen}
        onOpenChange={setMatchupStatsModalOpen}
        player={selectedMatchupPlayer}
        playerName={selectedMatchupPlayerName}
        scoringSettings={scoringSettings}
      />
    </Card>
  );
}
