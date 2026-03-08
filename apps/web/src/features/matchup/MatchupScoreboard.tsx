import React, { useMemo } from 'react';
import { Card, styled, Text, XStack, YStack } from 'tamagui';
import {
  Activity,
  Clock,
  Swords,
  TrendingUp,
  Trophy,
} from '@tamagui/lucide-icons';
import {
  calculateMatchupProjection,
  computeScoring,
  type SeasonStats,
} from '@legacy-sports/scoring';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';
import {
  type MatchupFragment,
  type MatchupPlayerFragment,
  MatchupStatus,
  useGetLeagueTeamsQuery,
  useGetMatchupPlayersQuery,
} from '../../api/db/graphql.generated';
import { useLeagueScoringSettings } from '../../lib/scoring';
import {
  mapBattingStats,
  mapFieldingStats,
  mapPitchingStats,
} from '../../lib/scoring/mapGraphQLToScoringFormat';

// ── Styled Components ─────────────────────────────────────────────────────────

const ScoreboardCard = styled(Card, {
  overflow: 'hidden',
  borderRadius: '$6',
  borderWidth: 1,
  borderColor: '$surfacePanelBorder',
  width: '100%',
  maxWidth: 800,
});

const TopBar = styled(XStack, {
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: '$5',
  paddingVertical: '$3',
  backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.12),
  borderBottomWidth: 1,
  borderBottomColor: withAlpha(BRAND_NAVY_LIGHT, 0.35),
  flexWrap: 'wrap',
  gap: '$2',
  $sm: {
    paddingHorizontal: '$3',
    paddingVertical: '$2',
  },
});

const StatusChip = styled(XStack, {
  alignItems: 'center',
  gap: '$1.5',
  paddingHorizontal: '$3',
  paddingVertical: '$1.5',
  borderRadius: '$10',
  borderWidth: 1,
});

const TeamPanel = styled(YStack, {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: '$5',
  paddingHorizontal: '$4',
  gap: '$2',
  $sm: {
    paddingVertical: '$3',
    paddingHorizontal: '$2',
  },
});

const ScoreDisplay = styled(Text, {
  fontWeight: '900',
  fontVariant: ['tabular-nums'],
  letterSpacing: -1.5,
  lineHeight: 52,
  $sm: {
    lineHeight: 40,
  },
});

const VsBadge = styled(YStack, {
  width: 40,
  height: 40,
  borderRadius: 20,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '$background',
  borderWidth: 2,
  borderColor: '$surfacePanelBorder',
  zIndex: 1,
});

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatchupScoreboardProps {
  matchup: MatchupFragment | null | undefined;
  gamesRemaining?: number;
  /** When provided, team names become clickable links to view that team's roster */
  onTeamClick?: (teamId: number) => void;
}

/**
 * MatchupScoreboard — Broadcast-style scoreboard with split team panels
 * Features a centered VS badge, large scores, and an integrated progress bar
 */
export function MatchupScoreboard({
  matchup,
  gamesRemaining = 0,
  onTeamClick,
}: MatchupScoreboardProps) {
  // Extract IDs before early return to use in hooks
  const matchupIdStr = matchup?.id;
  const leagueIdNum = matchup?.leagueId ?? undefined;
  const matchupIdNum = matchupIdStr ? parseInt(matchupIdStr, 10) : 0;

  // Fetch matchup players to calculate actual scores (hooks must come before early return)
  const { data: playersData } = useGetMatchupPlayersQuery({
    variables: { matchupId: matchupIdNum },
    skip: !matchupIdNum,
  });

  // Fetch scoring settings
  const { settings: scoringSettings } = useLeagueScoringSettings(leagueIdNum);

  // Build season stats map from matchup players data for projection calculations
  const seasonStatsMap = useMemo(() => {
    const map = new Map<number, SeasonStats>();
    if (!playersData?.getMatchupPlayers) return map;

    playersData.getMatchupPlayers.forEach((mp: MatchupPlayerFragment) => {
      const playerId = mp.playerId;
      const season = mp.season;
      const batting = mp.seasonBatting;
      const pitching = mp.seasonPitching;
      const fielding = mp.seasonFielding;

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

    return map;
  }, [playersData]);

  // Calculate team scores and projected final scores
  const { team1Score, team2Score, team1Projected, team2Projected } =
    useMemo(() => {
      if (!playersData?.getMatchupPlayers || !scoringSettings || !matchup) {
        return {
          team1Score: matchup?.team1Score ?? 0,
          team2Score: matchup?.team2Score ?? 0,
          team1Projected: null,
          team2Projected: null,
        };
      }

      const players = playersData.getMatchupPlayers;
      const gamesPerMatchup = matchup.gamesPerMatchup ?? 0;

      const calculateGameScore = (
        game: NonNullable<MatchupPlayerFragment['games']>[number],
      ): number => {
        let total = 0;

        if (game.battingGame) {
          const mappedBatting = mapBattingStats(game.battingGame);
          total += computeScoring(mappedBatting, scoringSettings.batting || {});
        }

        if (game.pitchingGame) {
          const mappedPitching = mapPitchingStats(game.pitchingGame);
          total += computeScoring(
            mappedPitching,
            scoringSettings.pitching || {},
          );
        }

        if (game.fieldingGame) {
          const mappedFielding = mapFieldingStats(game.fieldingGame);
          total += computeScoring(
            mappedFielding,
            scoringSettings.fielding || {},
          );
        }

        return total;
      };

      // Calculate projection for a single player using their selected season stats
      const calculatePlayerProjection = (
        player: MatchupPlayerFragment,
      ): number => {
        const gamesPlayed = player.games?.length ?? 0;
        const actualScore =
          player.games?.reduce(
            (sum, game) => sum + calculateGameScore(game),
            0,
          ) ?? 0;
        // Use player-specific numberOfGames (SP gets spStartsPerMatchup, others get gamesPerMatchup)
        const playerTotalGames = player.numberOfGames ?? gamesPerMatchup;
        const remaining = playerTotalGames - gamesPlayed;

        if (remaining <= 0) return actualScore;

        const playerId = player.playerId;
        if (playerId) {
          const seasonStats = seasonStatsMap.get(playerId);
          if (seasonStats && scoringSettings) {
            try {
              const projection = calculateMatchupProjection(
                seasonStats,
                scoringSettings,
              );
              return actualScore + projection.totalPerGame * remaining;
            } catch {
              // Fall through to fallback
            }
          }
        }

        // Fallback: use average from games already played
        if (gamesPlayed > 0) {
          return actualScore + (actualScore / gamesPlayed) * remaining;
        }
        return actualScore;
      };

      let team1Total = 0;
      let team2Total = 0;
      let team1ProjTotal = 0;
      let team2ProjTotal = 0;

      players.forEach((player) => {
        if (player.positionId === null) return;

        const playerScore =
          player.games?.reduce(
            (sum, game) => sum + calculateGameScore(game),
            0,
          ) ?? 0;

        const playerProjected = calculatePlayerProjection(player);

        if (player.teamId === matchup.team1Id) {
          team1Total += playerScore;
          team1ProjTotal += playerProjected;
        } else if (player.teamId === matchup.team2Id) {
          team2Total += playerScore;
          team2ProjTotal += playerProjected;
        }
      });

      return {
        team1Score: team1Total,
        team2Score: team2Total,
        team1Projected: team1ProjTotal,
        team2Projected: team2ProjTotal,
      };
    }, [playersData, scoringSettings, matchup, seasonStatsMap]);

  // Fetch team names
  const { data: teamsData } = useGetLeagueTeamsQuery({
    variables: { leagueId: leagueIdNum ?? 0 },
    skip: !leagueIdNum,
  });

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

  // Early return after all hooks
  if (!matchup) {
    return (
      <ScoreboardCard>
        <YStack padding="$6" alignItems="center" gap="$2">
          <Clock size={24} color="var(--textMuted)" />
          <Text color="$textMuted" fontSize="$4">
            No active matchup
          </Text>
        </YStack>
      </ScoreboardCard>
    );
  }

  const { weekNumber, status, gamesPerMatchup, team1Id, team2Id } = matchup;

  const team1Leading = (team1Score ?? 0) > (team2Score ?? 0);
  const team2Leading = (team2Score ?? 0) > (team1Score ?? 0);
  const isTied = team1Score === team2Score;
  const isLive = status === MatchupStatus.InProgress;
  const isCompleted = status === MatchupStatus.Completed;
  const gamesCompleted = gamesPerMatchup ? gamesPerMatchup - gamesRemaining : 0;

  // Show projections when games remain and matchup isn't completed
  const showProjections =
    !isCompleted && gamesRemaining > 0 && team1Projected !== null;

  const statusConfig = isLive
    ? {
        bg: '$green3',
        border: '$green7',
        text: '$green11',
        label: 'LIVE',
        icon: <Activity size={12} color="var(--green11)" />,
      }
    : isCompleted
      ? {
          bg: withAlpha(BRAND_NAVY_LIGHT, 0.18),
          border: withAlpha(BRAND_NAVY_LIGHT, 0.5),
          text: BRAND_GOLD_LIGHT,
          label: 'FINAL',
          icon: <Trophy size={12} color={BRAND_GOLD_LIGHT} />,
        }
      : {
          bg: '$gray3',
          border: '$gray7',
          text: '$gray11',
          label: 'SCHEDULED',
          icon: <Clock size={12} color="var(--gray11)" />,
        };

  return (
    <ScoreboardCard
      role="region"
      aria-label={`Week ${weekNumber} scoreboard: ${team1Name} vs ${team2Name}`}
    >
      {/* Top Bar */}
      <TopBar>
        <XStack alignItems="center" gap="$2">
          <Swords size={16} color={BRAND_GOLD_LIGHT} />
          <Text fontSize="$4" fontWeight="700" color={BRAND_GOLD_LIGHT}>
            Week {weekNumber}
          </Text>
          {gamesPerMatchup && (
            <Text fontSize="$2" color={BRAND_NAVY_LIGHT} marginLeft="$1">
              {gamesCompleted}/{gamesPerMatchup} games
            </Text>
          )}
        </XStack>

        <XStack alignItems="center" gap="$3">
          {isLive && gamesRemaining > 0 && (
            <Text fontSize="$2" fontWeight="600" color="$orange10">
              {gamesRemaining} remaining
            </Text>
          )}
          <StatusChip
            backgroundColor={statusConfig.bg}
            borderColor={statusConfig.border}
          >
            {statusConfig.icon}
            <Text
              fontSize="$2"
              fontWeight="700"
              color={statusConfig.text}
              letterSpacing={0.5}
            >
              {statusConfig.label}
            </Text>
          </StatusChip>
        </XStack>
      </TopBar>

      {/* Score Panels */}
      <XStack position="relative">
        {/* Team 1 */}
        <TeamPanel
          backgroundColor={
            team1Leading && !isTied
              ? withAlpha(BRAND_NAVY_LIGHT, 0.12)
              : '$background'
          }
        >
          <Text
            fontSize="$5"
            fontWeight="700"
            color={team1Leading ? BRAND_GOLD_LIGHT : '$color'}
            cursor={onTeamClick && team1Id ? 'pointer' : undefined}
            hoverStyle={
              onTeamClick && team1Id
                ? { textDecorationLine: 'underline', opacity: 0.85 }
                : undefined
            }
            onPress={
              onTeamClick && team1Id ? () => onTeamClick(team1Id) : undefined
            }
          >
            {team1Name}
          </Text>
          <ScoreDisplay
            fontSize={48}
            $sm={{ fontSize: 32 }}
            color={team1Leading && !isTied ? BRAND_GOLD_LIGHT : '$textMuted'}
          >
            {team1Score?.toFixed(2) ?? '0.00'}
          </ScoreDisplay>
          {team1Leading && !isTied && (
            <XStack alignItems="center" gap="$1.5">
              <YStack
                width={6}
                height={6}
                borderRadius={3}
                backgroundColor="$green10"
              />
              <Text fontSize="$2" fontWeight="600" color="$green10">
                {isCompleted ? 'Winner' : 'Leading'}
              </Text>
            </XStack>
          )}
          {isTied && team1Score !== null && (
            <Text fontSize="$2" fontWeight="600" color="$orange10">
              Tied
            </Text>
          )}
          {showProjections && team1Projected !== null && (
            <XStack
              alignItems="center"
              gap="$1.5"
              marginTop="$1"
              paddingHorizontal="$2.5"
              paddingVertical="$1"
              borderRadius="$3"
              backgroundColor="$gray3"
            >
              <TrendingUp size={12} color="var(--textMuted)" />
              <Text fontSize="$1" fontWeight="600" color="$textMuted">
                Proj: {team1Projected.toFixed(2)}
              </Text>
            </XStack>
          )}
        </TeamPanel>

        {/* Center VS Badge */}
        <YStack
          position="absolute"
          top={0}
          bottom={0}
          left={0}
          right={0}
          justifyContent="center"
          alignItems="center"
          zIndex={2}
          pointerEvents="none"
        >
          <VsBadge>
            <Text
              fontSize="$2"
              fontWeight="900"
              color="$textMuted"
              letterSpacing={1}
            >
              VS
            </Text>
          </VsBadge>
        </YStack>

        {/* Vertical divider */}
        <YStack width={1} backgroundColor="$surfacePanelBorder" />

        {/* Team 2 */}
        <TeamPanel
          backgroundColor={
            team2Leading && !isTied
              ? withAlpha(BRAND_NAVY_LIGHT, 0.12)
              : '$background'
          }
        >
          <Text
            fontSize="$5"
            fontWeight="700"
            color={team2Leading ? BRAND_GOLD_LIGHT : '$color'}
            cursor={onTeamClick && team2Id ? 'pointer' : undefined}
            hoverStyle={
              onTeamClick && team2Id
                ? { textDecorationLine: 'underline', opacity: 0.85 }
                : undefined
            }
            onPress={
              onTeamClick && team2Id ? () => onTeamClick(team2Id) : undefined
            }
          >
            {team2Name}
          </Text>
          <ScoreDisplay
            fontSize={48}
            $sm={{ fontSize: 32 }}
            color={team2Leading && !isTied ? BRAND_GOLD_LIGHT : '$textMuted'}
          >
            {team2Score?.toFixed(2) ?? '0.00'}
          </ScoreDisplay>
          {team2Leading && !isTied && (
            <XStack alignItems="center" gap="$1.5">
              <YStack
                width={6}
                height={6}
                borderRadius={3}
                backgroundColor="$green10"
              />
              <Text fontSize="$2" fontWeight="600" color="$green10">
                {isCompleted ? 'Winner' : 'Leading'}
              </Text>
            </XStack>
          )}
          {isTied && team2Score !== null && (
            <Text fontSize="$2" fontWeight="600" color="$orange10">
              Tied
            </Text>
          )}
          {showProjections && team2Projected !== null && (
            <XStack
              alignItems="center"
              gap="$1.5"
              marginTop="$1"
              paddingHorizontal="$2.5"
              paddingVertical="$1"
              borderRadius="$3"
              backgroundColor="$gray3"
            >
              <TrendingUp size={12} color="var(--textMuted)" />
              <Text fontSize="$1" fontWeight="600" color="$textMuted">
                Proj: {team2Projected.toFixed(2)}
              </Text>
            </XStack>
          )}
        </TeamPanel>
      </XStack>

      {/* Games Progress Bar */}
      {gamesPerMatchup && gamesPerMatchup > 0 && (
        <YStack
          paddingHorizontal="$5"
          paddingVertical="$3"
          borderTopWidth={1}
          borderTopColor="$surfacePanelBorder"
          backgroundColor="$surfacePanel"
        >
          <XStack
            justifyContent="space-between"
            alignItems="center"
            marginBottom="$2"
          >
            <Text fontSize="$1" fontWeight="600" color="$textMuted">
              {gamesCompleted} of {gamesPerMatchup} games completed
            </Text>
            <Text
              fontSize="$1"
              fontWeight="700"
              color={gamesRemaining === 0 ? '$green10' : BRAND_GOLD_LIGHT}
            >
              {gamesRemaining === 0
                ? 'Complete'
                : `${Math.round((gamesCompleted / gamesPerMatchup) * 100)}%`}
            </Text>
          </XStack>
          <XStack
            height={4}
            width="100%"
            backgroundColor="$gray4"
            borderRadius="$10"
            overflow="hidden"
          >
            <YStack
              height="100%"
              width={`${(gamesCompleted / gamesPerMatchup) * 100}%`}
              backgroundColor={
                gamesRemaining === 0 ? '$green9' : BRAND_NAVY_LIGHT
              }
              borderRadius="$10"
              animation="quick"
            />
          </XStack>
        </YStack>
      )}
    </ScoreboardCard>
  );
}
