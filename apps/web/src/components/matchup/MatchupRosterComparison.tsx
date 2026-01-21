/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-redundant-type-constituents -- LS-53: File contains placeholders for unimplemented GraphQL operations */
import React, { useMemo, useState } from 'react';
import {
  Card,
  H4,
  H5,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  calculateMatchupProjection,
  computeScoring,
  type SeasonStats,
} from '@legacy-sports/scoring';
import { PlayerSeasonStatsModal } from './PlayerSeasonStatsModal';
import { PlayerMatchupStatsModal } from './PlayerMatchupStatsModal';
import {
  type MatchupFragment,
  // type MatchupPlayerFragment,
  // useGetMatchupPlayersQuery,
  useGetPositionsForLeagueQuery,
} from '../../api/db/graphql.generated';
import { useLeagueScoringSettings } from '../../lib/scoring';
import {
  mapBattingStats,
  mapFieldingStats,
  mapPitchingStats,
} from '../../lib/scoring/mapGraphQLToScoringFormat';

// TODO(LS-53): Placeholders until MatchupPlayerFragment and useGetMatchupPlayersQuery are implemented
type MatchupPlayerFragment = {
  id: string;
  playerId: number;
  positionId?: number | null;
  season?: number | null;
  teamId?: number | null;
  seasonBatting?: any;
  seasonPitching?: any;
  seasonFielding?: any;
  player?: {
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  games?: any[];
};
const useGetMatchupPlayersQuery = (_params?: any) => ({
  data: { getMatchupPlayers: [] } as any,
  loading: false,
  error: { message: '' } as any,
});

export interface MatchupRosterComparisonProps {
  matchup: MatchupFragment;
}

/**
 * MatchupRosterComparison - Detailed player-by-player comparison
 * Shows starting lineups and bench with projections vs actual scores
 */
export function MatchupRosterComparison({
  matchup,
}: MatchupRosterComparisonProps) {
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
  console.log('[MatchupRosterComparison] Debug Info:', {
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

  // Build season stats map directly from the matchup players data (no separate queries needed!)
  const seasonStatsMap = useMemo(() => {
    const map = new Map<number, SeasonStats>();

    if (!data?.getMatchupPlayers) {
      console.log('[MatchupRosterComparison] No matchup players data yet');
      return map;
    }

    console.log(
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

    console.log(
      '[MatchupRosterComparison] seasonStatsMap built with',
      map.size,
      'players',
    );
    if (map.size > 0) {
      const firstEntries = Array.from(map.entries()).slice(0, 2);
      console.log(
        '[MatchupRosterComparison] Sample SeasonStats:',
        firstEntries,
      );
    }

    return map;
  }, [data]);

  // Create position lookup map
  const positionMap = useMemo(() => {
    const map = new Map<number, string>();
    positionsData?.leaguePositions?.forEach((pos) => {
      if (pos.id && pos.positionType) {
        map.set(
          typeof pos.id === 'string' ? parseInt(pos.id, 10) : pos.id,
          pos.positionType,
        );
      }
    });
    return map;
  }, [positionsData]);

  // Separate and organize players by team and roster status (starter vs bench)
  const {
    team1Starters,
    team1Bench,
    team2Starters,
    team2Bench,
    team1Batters,
    team1Pitchers,
    team2Batters,
    team2Pitchers,
    team1Totals,
    team2Totals,
    team1ExpectedForGamesPlayed,
    team2ExpectedForGamesPlayed,
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
      if (game.battingStats) {
        const mappedBatting = mapBattingStats(game.battingStats);
        total += computeScoring(mappedBatting, scoringSettings.batting || {});
      }

      // Calculate pitching score - map GraphQL field names to DB names
      if (game.pitchingStats) {
        const mappedPitching = mapPitchingStats(game.pitchingStats);
        total += computeScoring(mappedPitching, scoringSettings.pitching || {});
      }

      // Calculate fielding score - map GraphQL field names to DB names
      if (game.fieldingStats) {
        const mappedFielding = mapFieldingStats(game.fieldingStats);
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
      const gamesRemaining = gamesPerMatchup - gamesPlayed;

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

      console.log('[calculatePlayerProjection] Player', playerId, ':', {
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
          console.log('[calculatePlayerProjection] Projection calculated:', {
            playerId,
            totalPerGame: projection.totalPerGame,
            projectedRemainingScore,
            finalTotal: actualScore + projectedRemainingScore,
          });
          return actualScore + projectedRemainingScore;
        } catch (error) {
          console.warn(
            'Error calculating projection for player',
            player.playerId,
            error,
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
        team2Starters: [],
        team2Bench: [],
        team1Batters: [],
        team1Pitchers: [],
        team2Batters: [],
        team2Pitchers: [],
        team1Totals: { projected: 0, actual: 0 },
        team2Totals: { projected: 0, actual: 0 },
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

    // Calculate totals (only starters count toward matchup score)
    const team1Totals = {
      actual: team1Starters.reduce((sum: any, p: MatchupPlayerFragment) => {
        const gameSum =
          p.games?.reduce((s: any, g: any) => s + calculateGameScore(g), 0) ??
          0;
        return sum + gameSum;
      }, 0),
      projected: team1Starters.reduce(
        (sum: any, p: MatchupPlayerFragment) =>
          sum + calculatePlayerProjection(p),
        0,
      ),
    };

    const team2Totals = {
      actual: team2Starters.reduce((sum: any, p: MatchupPlayerFragment) => {
        const gameSum =
          p.games?.reduce((s: any, g: any) => s + calculateGameScore(g), 0) ??
          0;
        return sum + gameSum;
      }, 0),
      projected: team2Starters.reduce(
        (sum: any, p: MatchupPlayerFragment) =>
          sum + calculatePlayerProjection(p),
        0,
      ),
    };

    // Calculate expected scores based on games played (for color coding totals)
    const team1TotalGamesPlayed = team1Starters.reduce(
      (sum: any, p: MatchupPlayerFragment) => sum + (p.games?.length ?? 0),
      0,
    );
    const team2TotalGamesPlayed = team2Starters.reduce(
      (sum: any, p: MatchupPlayerFragment) => sum + (p.games?.length ?? 0),
      0,
    );
    const team1TotalGamesExpected = team1Starters.length * gamesPerMatchup;
    const team2TotalGamesExpected = team2Starters.length * gamesPerMatchup;
    const team1ExpectedForGamesPlayed =
      team1TotalGamesPlayed > 0
        ? (team1Totals.projected / team1TotalGamesExpected) *
          team1TotalGamesPlayed
        : 0;
    const team2ExpectedForGamesPlayed =
      team2TotalGamesPlayed > 0
        ? (team2Totals.projected / team2TotalGamesExpected) *
          team2TotalGamesPlayed
        : 0;

    return {
      team1Starters,
      team1Bench,
      team2Starters,
      team2Bench,
      team1Batters,
      team1Pitchers,
      team2Batters,
      team2Pitchers,
      team1Totals,
      team2Totals,
      team1ExpectedForGamesPlayed,
      team2ExpectedForGamesPlayed,
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
    return (
      <Card backgroundColor="$blue2" borderColor="$blue6" padding="$4">
        <YStack space="$3" alignItems="center">
          <Spinner size="large" />
          <Text color="$gray11">Loading matchup players...</Text>
        </YStack>
      </Card>
    );
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

  const maxBenchRows = Math.max(team1Bench.length, team2Bench.length);
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
      NonNullable<MatchupPlayerFragment['games']>[number]['battingStats']
    >;
    type PitchingStatsType = NonNullable<
      NonNullable<MatchupPlayerFragment['games']>[number]['pitchingStats']
    >;
    type FieldingStatsType = NonNullable<
      NonNullable<MatchupPlayerFragment['games']>[number]['fieldingStats']
    >;
    type StatExtractor<T> = (stats: T) => number;
    interface StatConfig<T> {
      label: string;
      extract: StatExtractor<T>;
      scoringKey: string;
    }

    // Aggregate batting stats (only show stats that actually contributed points for this player)
    const battingGames = player.games.filter((g) => g.battingStats);
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
      for (const stat of battingStats) {
        // Check if this stat has a scoring value configured
        const scoringValue = scoringSettings.batting[stat.scoringKey];
        if (scoringValue !== undefined && scoringValue !== 0) {
          // Calculate the total for this stat across all games
          const total = battingGames.reduce((sum, g) => {
            if (!g.battingStats) return sum;
            return sum + stat.extract(g.battingStats);
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
    const pitchingGames = player.games.filter((g) => g.pitchingStats);
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
          (sum, g) => sum + (g.pitchingStats?.outsRecorded ?? 0),
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
            if (!g.pitchingStats) return sum;
            return sum + stat.extract(g.pitchingStats);
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
    const fieldingGames = player.games.filter((g) => g.fieldingStats);
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
            if (!g.fieldingStats) return sum;
            return sum + stat.extract(g.fieldingStats);
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
    showPosition = true,
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
      : null;
    const team2Position = team2Player?.positionId
      ? positionMap.get(team2Player.positionId)
      : null;

    // Get accumulated stats breakdown
    const team1Stats = formatAccumulatedStats(team1Player);
    const team2Stats = formatAccumulatedStats(team2Player);

    return (
      <XStack
        key={index}
        paddingVertical="$2.5"
        paddingHorizontal="$3"
        borderBottomWidth={1}
        borderBottomColor="$gray4"
        hoverStyle={{ backgroundColor: '$gray2' }}
      >
        {/* Team 1 Position */}
        {showPosition && (
          <YStack width={50} justifyContent="center">
            <Text fontSize="$2" fontWeight="bold" color="$blue10">
              {team1Position || '—'}
            </Text>
          </YStack>
        )}

        {/* Team 1 Player */}
        <YStack flex={1} justifyContent="center">
          {team1Player ? (
            <>
              <Text
                fontSize="$3"
                fontWeight="600"
                color="$gray12"
                cursor="pointer"
                hoverStyle={{ color: '$blue11', textDecoration: 'underline' }}
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
                {team1Player.player?.firstName} {team1Player.player?.lastName}
              </Text>
              <Text fontSize="$1" color="$gray10">
                Season {team1Player.season}
                {team1Player.games && team1Player.games.length > 0 ? (
                  <Text color="$green10">
                    {' '}
                    • {team1Player.games.length}/{gamesPerMatchup} games
                  </Text>
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

        {/* Team 1 Projected Score */}
        <YStack width={70} alignItems="center" justifyContent="center">
          <Text fontSize="$3" fontWeight="500" color="$gray10">
            {team1Player ? team1Proj.toFixed(1) : '—'}
          </Text>
        </YStack>

        {/* Team 1 Actual Score */}
        <YStack width={70} alignItems="center" justifyContent="center">
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

        <Separator vertical marginHorizontal="$3" borderColor="$gray6" />

        {/* Team 2 Actual Score */}
        <YStack width={70} alignItems="center" justifyContent="center">
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
        <YStack width={70} alignItems="center" justifyContent="center">
          <Text fontSize="$3" fontWeight="500" color="$gray10">
            {team2Player ? team2Proj.toFixed(1) : '—'}
          </Text>
        </YStack>

        {/* Team 2 Player */}
        <YStack flex={1} alignItems="flex-end" justifyContent="center">
          {team2Player ? (
            <>
              <Text
                fontSize="$3"
                fontWeight="600"
                color="$gray12"
                textAlign="right"
                cursor="pointer"
                hoverStyle={{ color: '$blue11', textDecoration: 'underline' }}
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
                {team2Player.player?.firstName} {team2Player.player?.lastName}
              </Text>
              <Text fontSize="$1" color="$gray10" textAlign="right">
                Season {team2Player.season}
                {team2Player.games && team2Player.games.length > 0 ? (
                  <Text color="$green10">
                    {' '}
                    • {team2Player.games.length}/{gamesPerMatchup} games
                  </Text>
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

        {/* Team 2 Position */}
        {showPosition && (
          <YStack width={50} alignItems="flex-end" justifyContent="center">
            <Text fontSize="$2" fontWeight="bold" color="$blue10">
              {team2Position || '—'}
            </Text>
          </YStack>
        )}
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
        paddingVertical="$2.5"
        paddingHorizontal="$3"
        backgroundColor="$blue2"
        borderBottomWidth={2}
        borderBottomColor="$blue7"
      >
        <YStack width={50}>
          <Text
            fontSize="$2"
            fontWeight="bold"
            color="$blue11"
            textTransform="uppercase"
          >
            Pos
          </Text>
        </YStack>
        <YStack flex={1}>
          <Text
            fontSize="$2"
            fontWeight="bold"
            color="$blue11"
            textTransform="uppercase"
          >
            Team 1
          </Text>
        </YStack>
        <YStack width={70} alignItems="center">
          <Text
            fontSize="$2"
            fontWeight="bold"
            color="$gray10"
            textTransform="uppercase"
          >
            Proj
          </Text>
        </YStack>
        <YStack width={70} alignItems="center">
          <Text
            fontSize="$2"
            fontWeight="bold"
            color="$blue11"
            textTransform="uppercase"
          >
            Actual
          </Text>
        </YStack>
        <Separator vertical marginHorizontal="$3" borderColor="$blue6" />
        <YStack width={70} alignItems="center">
          <Text
            fontSize="$2"
            fontWeight="bold"
            color="$blue11"
            textTransform="uppercase"
          >
            Actual
          </Text>
        </YStack>
        <YStack width={70} alignItems="center">
          <Text
            fontSize="$2"
            fontWeight="bold"
            color="$gray10"
            textTransform="uppercase"
          >
            Proj
          </Text>
        </YStack>
        <YStack flex={1} alignItems="flex-end">
          <Text
            fontSize="$2"
            fontWeight="bold"
            color="$blue11"
            textTransform="uppercase"
          >
            Team 2
          </Text>
        </YStack>
        <YStack width={50} alignItems="flex-end">
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
                true,
              ),
            )}
          </YStack>
        </>
      )}

      {/* Pitchers Section */}
      {(team1Pitchers.length > 0 || team2Pitchers.length > 0) && (
        <>
          <Separator marginVertical="$3" />
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
                true,
              ),
            )}
          </YStack>
        </>
      )}

      {/* Totals Row */}
      <XStack
        paddingVertical="$3"
        paddingHorizontal="$3"
        backgroundColor="$blue2"
        borderTopWidth={2}
        borderTopColor="$blue8"
        marginTop="$3"
      >
        <YStack width={50} /> {/* Position column spacer */}
        <YStack flex={1}>
          <Text fontSize="$4" fontWeight="bold" color="$blue11">
            TOTAL (Starters Only)
          </Text>
        </YStack>
        <YStack width={70} alignItems="center">
          <Text fontSize="$4" fontWeight="600" color="$gray10">
            {team1Totals.projected.toFixed(1)}
          </Text>
        </YStack>
        <YStack width={70} alignItems="center">
          <Text
            fontSize="$5"
            fontWeight="bold"
            color={
              team1Totals.actual >= team1ExpectedForGamesPlayed
                ? '$green10'
                : '$red10'
            }
          >
            {team1Totals.actual.toFixed(1)}
          </Text>
        </YStack>
        <Separator vertical marginHorizontal="$3" borderColor="$blue6" />
        <YStack width={70} alignItems="center">
          <Text
            fontSize="$5"
            fontWeight="bold"
            color={
              team2Totals.actual >= team2ExpectedForGamesPlayed
                ? '$green10'
                : '$red10'
            }
          >
            {team2Totals.actual.toFixed(1)}
          </Text>
        </YStack>
        <YStack width={70} alignItems="center">
          <Text fontSize="$4" fontWeight="600" color="$gray10">
            {team2Totals.projected.toFixed(1)}
          </Text>
        </YStack>
        <YStack flex={1} alignItems="flex-end">
          <Text fontSize="$4" fontWeight="bold" color="$blue11">
            TOTAL (Starters Only)
          </Text>
        </YStack>
        <YStack width={50} /> {/* Position column spacer */}
      </XStack>

      {/* Bench Section */}
      {(team1Bench.length > 0 || team2Bench.length > 0) && (
        <>
          <Separator marginVertical="$3" />

          {/* Bench Section Header */}
          <YStack
            backgroundColor="$gray3"
            paddingVertical="$2"
            paddingHorizontal="$3"
          >
            <H5 color="$gray11">Bench</H5>
          </YStack>

          {/* Header Row for Bench */}
          <XStack
            paddingVertical="$2.5"
            paddingHorizontal="$3"
            backgroundColor="$gray2"
            borderBottomWidth={2}
            borderBottomColor="$gray7"
          >
            <YStack flex={1}>
              <Text
                fontSize="$2"
                fontWeight="bold"
                color="$gray11"
                textTransform="uppercase"
              >
                Team 1 Bench
              </Text>
            </YStack>
            <YStack width={70} alignItems="center">
              <Text
                fontSize="$2"
                fontWeight="bold"
                color="$gray9"
                textTransform="uppercase"
              >
                Proj
              </Text>
            </YStack>
            <YStack width={70} alignItems="center">
              <Text
                fontSize="$2"
                fontWeight="bold"
                color="$gray10"
                textTransform="uppercase"
              >
                Actual
              </Text>
            </YStack>
            <Separator vertical marginHorizontal="$3" borderColor="$gray6" />
            <YStack width={70} alignItems="center">
              <Text
                fontSize="$2"
                fontWeight="bold"
                color="$gray10"
                textTransform="uppercase"
              >
                Actual
              </Text>
            </YStack>
            <YStack width={70} alignItems="center">
              <Text
                fontSize="$2"
                fontWeight="bold"
                color="$gray9"
                textTransform="uppercase"
              >
                Proj
              </Text>
            </YStack>
            <YStack flex={1} alignItems="flex-end">
              <Text
                fontSize="$2"
                fontWeight="bold"
                color="$gray11"
                textTransform="uppercase"
              >
                Team 2 Bench
              </Text>
            </YStack>
          </XStack>

          {/* Bench Rows */}
          <YStack>
            {Array.from({ length: maxBenchRows }).map((_, index) =>
              renderPlayerRow(
                team1Bench[index],
                team2Bench[index],
                `bench-${index}`,
                false,
              ),
            )}
          </YStack>
        </>
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
