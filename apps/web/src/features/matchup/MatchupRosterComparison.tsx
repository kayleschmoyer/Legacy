import React, { useMemo, useState } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import {
  calculateMatchupProjection,
  computeScoring,
  type SeasonStats,
} from '@legacy-sports/scoring';
import {
  isPitcherPositionType,
  isStatsLoading,
  POSITION_SLOT_ORDER,
} from '@legacy-sports/shared-components/roster';
import {
  FootballStatsDataQuality,
  type MatchupFragment,
  type MatchupPlayerFragment,
  Sport,
  useGetLeagueTeamsQuery,
  useGetMatchupPlayersQuery,
  useGetPositionsForLeagueQuery,
} from '@legacy-sports/graphql';
import { useFootballMatchupScores } from '@legacy-sports/shared-components/matchup';
import { PlayerSeasonStatsModal } from './PlayerSeasonStatsModal';
import { PlayerMatchupStatsModal } from './PlayerMatchupStatsModal';
import { FootballPlayerDetailModal } from '../../components/FootballPlayerDetailModal';
import { useHasEntitlement } from '../../hooks/useIsPremium';
import { useLeagueScoringSettings } from '../../lib/scoring';
import {
  mapBattingStats,
  mapFieldingStats,
  mapMatchupPlayerToSeasonStats,
  mapPitchingStats,
} from '../../lib/scoring/mapGraphQLToScoringFormat';
import { outsToBaseballIP } from '../../lib/scoring/ipUtils';
import './MatchupRosterComparison.css';

/**
 * Row badge for a football player whose points may under-count because a
 * scheduled game produced no stat rows (LS-6394). `ok` gets no badge.
 */
const STATS_QUALITY_BADGES: Record<
  FootballStatsDataQuality,
  { label: string; title: string } | null
> = {
  [FootballStatsDataQuality.Ok]: null,
  [FootballStatsDataQuality.StatsPending]: {
    label: 'stats pending',
    title:
      'This player’s game stats have not been loaded yet — their points may be incomplete.',
  },
  [FootballStatsDataQuality.StatsFailed]: {
    label: 'stats pending',
    title:
      'Loading this player’s game stats failed — their points may be incomplete.',
  },
  [FootballStatsDataQuality.StatsMissing]: {
    label: 'stats pending',
    title:
      'This player’s game finished but no stats were found — their points may be incomplete.',
  },
};

// ── Game-slot helpers ────────────────────────────────────────────────────
//
// A game slot with no real stats can mean two different things:
//   - pitcherStartSkipped: a real off day — an SP was probabilistically
//     held out of the rotation for this game day.
//   - noGameDataFound: a data gap — the stats pipeline never found a
//     per-game box score for the player's assigned season, for any
//     position. This is not an off day; it should never be counted or
//     labeled as one (LS-9122).
type GameSlot = Pick<
  NonNullable<MatchupPlayerFragment['games']>[number],
  'pitcherStartSkipped' | 'noGameDataFound'
>;

function hasNoStats(game: GameSlot): boolean {
  return Boolean(game.pitcherStartSkipped || game.noGameDataFound);
}

// ── Position grouping (drives .mrc-g-* badge color classes) ────────────────

/**
 * Badge color group for a roster slot. Baseball uses `catcher` / `infield` /
 * `outfield` / `pitcher`; football uses `qb` / `skill` / `kicker` / `defense`.
 * `utility` is the fallback for both sports.
 */
type PositionGroup =
  | 'catcher'
  | 'infield'
  | 'outfield'
  | 'pitcher'
  | 'utility'
  | 'qb'
  | 'skill'
  | 'kicker'
  | 'defense';

const FOOTBALL_SKILL_POSITIONS = new Set(['RB', 'WR', 'TE', 'FLEX']);
const FOOTBALL_DEFENSE_POSITIONS = new Set(['DST', 'DL', 'LB', 'DB']);

/**
 * Maps a position/slot label to its badge color group.
 *
 * @param position - Position or slot label (e.g. `'QB'`, `'SP'`), matched
 * case-insensitively.
 * @param isFootball - When true, matches against the football position
 * groups (qb/skill/kicker/defense) instead of the baseball ones.
 */
function getPositionGroup(
  position: string | null | undefined,
  isFootball: boolean,
): PositionGroup {
  if (!position) return 'utility';
  const pos = position.toUpperCase();
  if (isFootball) {
    if (pos === 'QB') return 'qb';
    if (FOOTBALL_SKILL_POSITIONS.has(pos)) return 'skill';
    if (pos === 'K') return 'kicker';
    if (FOOTBALL_DEFENSE_POSITIONS.has(pos)) return 'defense';
    return 'utility';
  }
  if (pos === 'C') return 'catcher';
  if (['1B', '2B', '3B', 'SS', 'IF'].includes(pos)) return 'infield';
  if (['LF', 'CF', 'RF', 'OF'].includes(pos)) return 'outfield';
  if (pos === 'SP' || pos === 'RP') return 'pitcher';
  return 'utility';
}

// ── Matchup Edge grade (FMD-028 / LS-6385) ──────────────────────────────────
//
// Grades whether a football player's season has been strong or weak so far,
// using their real season-average fantasy points per game (`footballSeasonFppg`,
// computed server-side from actual season stat rows for the player's assigned
// matchup season — see MatchupPlayer.footballSeasonFppg). This is NOT an
// opponent-specific "defense rank vs position" comparison: no defense-vs-position
// data source exists yet in this codebase, so the grade is scoped to what real
// data actually supports — the player's own season pace.

type GradeTier = 'green' | 'yellow' | 'red';

interface MatchupGrade {
  grade: string;
  tier: GradeTier;
}

interface GradeBand {
  min: number;
  grade: string;
  tier: GradeTier;
}

// Illustrative, round-number FPPG bands per football position group (standard
// scoring scale). Not derived from a league-wide distribution — a reasonable
// heuristic for "good/bad season", not a precise percentile rank.
const MATCHUP_GRADE_BANDS: Partial<Record<PositionGroup, GradeBand[]>> = {
  qb: [
    { min: 24, grade: 'A+', tier: 'green' },
    { min: 21, grade: 'A', tier: 'green' },
    { min: 19, grade: 'A-', tier: 'green' },
    { min: 17, grade: 'B+', tier: 'yellow' },
    { min: 15, grade: 'B', tier: 'yellow' },
    { min: 13, grade: 'B-', tier: 'yellow' },
    { min: 11, grade: 'C+', tier: 'red' },
    { min: 9, grade: 'C', tier: 'red' },
    { min: 7, grade: 'C-', tier: 'red' },
    { min: 5, grade: 'D', tier: 'red' },
    { min: -Infinity, grade: 'F', tier: 'red' },
  ],
  skill: [
    { min: 20, grade: 'A+', tier: 'green' },
    { min: 17, grade: 'A', tier: 'green' },
    { min: 14, grade: 'A-', tier: 'green' },
    { min: 12, grade: 'B+', tier: 'yellow' },
    { min: 10, grade: 'B', tier: 'yellow' },
    { min: 8, grade: 'B-', tier: 'yellow' },
    { min: 6, grade: 'C+', tier: 'red' },
    { min: 4.5, grade: 'C', tier: 'red' },
    { min: 3, grade: 'C-', tier: 'red' },
    { min: 1.5, grade: 'D', tier: 'red' },
    { min: -Infinity, grade: 'F', tier: 'red' },
  ],
  kicker: [
    { min: 12, grade: 'A+', tier: 'green' },
    { min: 11, grade: 'A', tier: 'green' },
    { min: 10, grade: 'A-', tier: 'green' },
    { min: 9, grade: 'B+', tier: 'yellow' },
    { min: 8, grade: 'B', tier: 'yellow' },
    { min: 7, grade: 'B-', tier: 'yellow' },
    { min: 6, grade: 'C+', tier: 'red' },
    { min: 5, grade: 'C', tier: 'red' },
    { min: 4, grade: 'C-', tier: 'red' },
    { min: 3, grade: 'D', tier: 'red' },
    { min: -Infinity, grade: 'F', tier: 'red' },
  ],
  defense: [
    { min: 14, grade: 'A+', tier: 'green' },
    { min: 12, grade: 'A', tier: 'green' },
    { min: 10, grade: 'A-', tier: 'green' },
    { min: 8.5, grade: 'B+', tier: 'yellow' },
    { min: 7, grade: 'B', tier: 'yellow' },
    { min: 5.5, grade: 'B-', tier: 'yellow' },
    { min: 4, grade: 'C+', tier: 'red' },
    { min: 2.5, grade: 'C', tier: 'red' },
    { min: 1, grade: 'C-', tier: 'red' },
    { min: 0, grade: 'D', tier: 'red' },
    { min: -Infinity, grade: 'F', tier: 'red' },
  ],
};

function getMatchupGrade(
  fppg: number,
  group: PositionGroup,
): MatchupGrade | null {
  const bands = MATCHUP_GRADE_BANDS[group];
  if (!bands) return null;
  const band = bands.find((b) => fppg >= b.min);
  return band ? { grade: band.grade, tier: band.tier } : null;
}

// ── Skeleton loading ─────────────────────────────────────────────────────

function SkeletonSlotRow() {
  return (
    <div className="mrc-slot">
      <div className="mrc-cell mrc-t1">
        <div className="mrc-pinfo">
          <div
            className="mrc-sk"
            style={{ height: 15, width: '60%', marginLeft: 'auto' }}
          />
          <div
            className="mrc-sk"
            style={{
              height: 11,
              width: '80%',
              marginTop: 6,
              marginLeft: 'auto',
            }}
          />
        </div>
        <div className="mrc-sk" style={{ height: 34, width: 90 }} />
      </div>
      <div className="mrc-pos" />
      <div className="mrc-cell mrc-t2">
        <div className="mrc-pinfo">
          <div className="mrc-sk" style={{ height: 15, width: '60%' }} />
          <div
            className="mrc-sk"
            style={{ height: 11, width: '80%', marginTop: 6 }}
          />
        </div>
        <div className="mrc-sk" style={{ height: 34, width: 90 }} />
      </div>
    </div>
  );
}

function SkeletonLoading() {
  return (
    <div className="mrc-root">
      <div className="mrc-wrap">
        <div className="mrc-head">
          <h1 className="mrc-title">Player Matchups</h1>
        </div>
        <div className="mrc-section">
          <div className="mrc-section-bar">
            <h3>Starting Lineup — Batters</h3>
            <div className="mrc-rule" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonSlotRow key={`sk-batter-${i}`} />
          ))}
        </div>
        <div className="mrc-section">
          <div className="mrc-section-bar">
            <h3>Starting Lineup — Pitchers</h3>
            <div className="mrc-rule" />
          </div>
          {Array.from({ length: 2 }).map((_, i) => (
            <SkeletonSlotRow key={`sk-pitcher-${i}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

export interface MatchupRosterComparisonProps {
  matchup: MatchupFragment;
  /** The current user's team ID — if provided, their team is always shown on the left. */
  userTeamId?: number | null;
  /** The league's sport — drives football-specific position grouping/ordering
   *  and routes player clicks to the football player detail modal instead of
   *  the baseball season/matchup-breakdown modals. */
  sport?: Sport | null;
}

/**
 * MatchupRosterComparison - Detailed player-by-player comparison
 * Shows starting lineups and bench with projections vs actual scores
 */
export function MatchupRosterComparison({
  matchup,
  userTeamId,
  sport,
}: MatchupRosterComparisonProps) {
  const isFootball = sport === Sport.Football;
  // Matchup Edge grade chip (FMD-028 / LS-6385) — gated behind the same
  // entitlement as the other client-computed matchup projection surfaces on
  // this page (MatchupWinProbabilityPanel).
  const canSeeMatchupGrade = useHasEntitlement(
    ENTITLEMENTS.football_projections,
  );

  // Bench toggle state
  const [showBench, setShowBench] = useState(false);

  // Advanced stats expand/collapse state, keyed by playerId (LS-6398).
  const [expandedAdvancedStats, setExpandedAdvancedStats] = useState<
    Set<number>
  >(new Set());
  const toggleAdvancedStats = (playerId: number) => {
    setExpandedAdvancedStats((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };
  const canSeeAdvancedStats = useHasEntitlement(
    ENTITLEMENTS.football_projections,
  );

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

  // Modal state for the football player detail modal (name/score clicks
  // route here instead of the baseball modals above when isFootball).
  const [footballModalOpen, setFootballModalOpen] = useState(false);
  const [footballPlayerId, setFootballPlayerId] = useState<number | null>(null);

  // Always show the current user's team on the left column. If the user is
  // team2 in this matchup, swap so their slots line up with the roster editor.
  const userIsTeam2 = userTeamId != null && userTeamId === matchup.team2Id;
  const team1Id = userIsTeam2 ? matchup.team2Id : matchup.team1Id;
  const team2Id = userIsTeam2 ? matchup.team1Id : matchup.team2Id;
  const leagueId = matchup.leagueId ?? 0;
  const gamesPerMatchup = matchup.gamesPerMatchup ?? 3;

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

  // Fetch league positions to get position labels + slot list
  const { data: positionsData, loading: positionsLoading } =
    useGetPositionsForLeagueQuery({
      variables: { leagueId },
      skip: !leagueId,
    });

  // Fetch team names
  const { data: teamsData } = useGetLeagueTeamsQuery({
    variables: { leagueId },
    skip: !leagueId,
  });

  // Football scoring path (LS-9612): the `MatchupPlayer.games[].battingGame/
  // pitchingGame/fieldingGame` fields fed into `computeScoring` below are
  // baseball-only — football players have no equivalent per-game stat blocks
  // there. Real football per-game/actual/projected points already exist via
  // `matchupScores` (`FootballMatchupPlayer.totalPoints`/`projectedPoints`
  // and `FootballMatchupStats.totalPoints`/`projectedPoints` for the team).
  // `useFootballMatchupScores` is shared with the My Roster tab and the
  // scoreboards so every football surface reads the same totals (LS-10829).
  const { playerScores: footballPlayerScores, teamScores: footballTeamScores } =
    useFootballMatchupScores({
      leagueId,
      weekNum: matchup.weekNumber,
      skip: !isFootball,
    });

  // Football equivalents of `calculateGameScore`/`calculatePlayerProjection`
  // below — those two remain baseball-only and unchanged.
  const getPlayerActualScore = (player: MatchupPlayerFragment): number =>
    player.playerId != null
      ? (footballPlayerScores.get(player.playerId)?.actual ?? 0)
      : 0;
  const getPlayerProjectedScore = (player: MatchupPlayerFragment): number =>
    player.playerId != null
      ? (footballPlayerScores.get(player.playerId)?.projected ?? 0)
      : 0;
  // LS-6394: a scheduled game with no stat rows scores 0. Surface that as a
  // badge so an ingest gap reads as "pending", not as a real zero.
  const getPlayerDataQuality = (
    player: MatchupPlayerFragment,
  ): FootballStatsDataQuality =>
    player.playerId != null
      ? (footballPlayerScores.get(player.playerId)?.dataQuality ??
        FootballStatsDataQuality.Ok)
      : FootballStatsDataQuality.Ok;

  const team1Name = useMemo(() => {
    if (!team1Id || !teamsData?.leagueTeams)
      return userTeamId ? 'Your Team' : 'Team 1';
    return (
      teamsData.leagueTeams.find((t) => t.id === team1Id)?.name ?? 'Team 1'
    );
  }, [team1Id, teamsData, userTeamId]);

  const team2Name = useMemo(() => {
    if (!team2Id || !teamsData?.leagueTeams) return 'Team 2';
    return (
      teamsData.leagueTeams.find((t) => t.id === team2Id)?.name ?? 'Team 2'
    );
  }, [team2Id, teamsData]);

  // Build season stats map directly from the matchup players data (no separate queries needed!)
  const seasonStatsMap = useMemo(() => {
    const map = new Map<number, SeasonStats>();
    data?.getMatchupPlayers?.forEach((mp: MatchupPlayerFragment) => {
      const stats = mapMatchupPlayerToSeasonStats(mp);
      if (stats) map.set(stats.playerId, stats);
    });
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
    team1Bench,
    team2Bench,
    team1Bullpen,
    team1BenchFielders,
    team2Bullpen,
    team2BenchFielders,
    team1RosterCount,
    team2RosterCount,
    batterSlotRows,
    pitcherSlotRows,
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
      const gamesPlayed =
        player.games?.filter((g) => !hasNoStats(g)).length ?? 0;
      const actualScore =
        player.games?.reduce((sum, g) => sum + calculateGameScore(g), 0) ?? 0;
      // Use player-specific numberOfGames (SP gets pitcherStartsPerMatchup, others get gamesPerMatchup)
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

      if (seasonStats && scoringSettings) {
        // Use real projection function with season stats
        try {
          const projection = calculateMatchupProjection(
            seasonStats,
            scoringSettings,
          );
          const projectedRemainingScore =
            projection.totalPerGame * gamesRemaining;
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
        team1Bench: [],
        team2Bench: [],
        team1Bullpen: [],
        team1BenchFielders: [],
        team2Bullpen: [],
        team2BenchFielders: [],
        team1RosterCount: 0,
        team2RosterCount: 0,
        batterSlotRows: [],
        pitcherSlotRows: [],
        team1BatterTotals: { projected: 0, actual: 0 },
        team1PitcherTotals: { projected: 0, actual: 0 },
        team2BatterTotals: { projected: 0, actual: 0 },
        team2PitcherTotals: { projected: 0, actual: 0 },
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

    // Separate starters (have positionId) from bench (positionId is null)
    const team1Bench = team1All.filter(
      (p: MatchupPlayerFragment) => p.positionId === null,
    );
    const team2Bench = team2All.filter(
      (p: MatchupPlayerFragment) => p.positionId === null,
    );

    // Helper to check if a bench player is a pitcher based on eligiblePositions
    const isBenchPitcher = (p: MatchupPlayerFragment): boolean => {
      const positions = p.player?.eligiblePositions;
      if (!positions || positions.length === 0) return false;
      return positions.some((pos) => isPitcherPositionType(pos));
    };
    const isBenchFielder = (p: MatchupPlayerFragment): boolean => {
      const positions = p.player?.eligiblePositions;
      if (!positions || positions.length === 0) return true; // default to bench if unknown
      return positions.some((pos) => !isPitcherPositionType(pos));
    };

    // Split bench into bullpen (pitchers) and bench (fielders)
    const team1Bullpen = team1Bench.filter(isBenchPitcher);
    const team1BenchFielders = team1Bench.filter(isBenchFielder);
    const team2Bullpen = team2Bench.filter(isBenchPitcher);
    const team2BenchFielders = team2Bench.filter(isBenchFielder);

    // ── Slot-based starter rows ────────────────────────────────────────────
    // Build one row per league position slot so empty slots are always visible.
    type SlotRow = {
      slotId: number;
      slotType: string;
      team1Player: MatchupPlayerFragment | undefined;
      team2Player: MatchupPlayerFragment | undefined;
    };

    const allLeagueSlots = (positionsData?.leaguePositions ?? []).map(
      (pos: { id?: string | number | null; positionType?: string | null }) => ({
        slotId:
          pos.id == null
            ? 0
            : typeof pos.id === 'string'
              ? parseInt(pos.id, 10)
              : pos.id,
        slotType: pos.positionType ?? '',
      }),
    );

    const sortSlots = (a: { slotType: string }, b: { slotType: string }) =>
      (POSITION_SLOT_ORDER[a.slotType] ?? 99) -
      (POSITION_SLOT_ORDER[b.slotType] ?? 99);

    // ── Build slot rows by rank (index within type), not by exact slot ID ────
    //
    // Multiple league slots can share the same positionType (e.g. 5 SP slots).
    // Both teams share the same league_positions slot IDs — a slot belongs to
    // the league, not to a team. Exact-ID matching is therefore correct.
    const buildSlotRows = (
      slotFilter: (s: { slotType: string }) => boolean,
    ): SlotRow[] =>
      allLeagueSlots
        .filter(slotFilter)
        .sort(sortSlots)
        .map((s) => ({
          ...s,
          team1Player: team1All.find((p) => p.positionId === s.slotId),
          team2Player: team2All.find((p) => p.positionId === s.slotId),
        }));

    const batterSlotRows: SlotRow[] = buildSlotRows(
      (s) => !isPitcherPositionType(s.slotType),
    );
    const pitcherSlotRows: SlotRow[] = buildSlotRows((s) =>
      isPitcherPositionType(s.slotType),
    );

    // Calculate separate totals for batter and pitcher slots (only assigned players score).
    // Football sources its totals straight from `FootballMatchupStats.totalPoints`/
    // `projectedPoints` rather than summing per-player rows, so the displayed team
    // total always matches the real team score exactly (LS-9612).
    const team1BatterTotals = isFootball
      ? {
          actual: footballTeamScores.get(team1Id ?? -1)?.actual ?? 0,
          projected: footballTeamScores.get(team1Id ?? -1)?.projected ?? 0,
        }
      : {
          actual: batterSlotRows.reduce<number>((sum, row) => {
            const gameSum =
              row.team1Player?.games?.reduce<number>(
                (s, g) => s + calculateGameScore(g),
                0,
              ) ?? 0;
            return sum + gameSum;
          }, 0),
          projected: batterSlotRows.reduce<number>(
            (sum, row) =>
              sum +
              (row.team1Player
                ? calculatePlayerProjection(row.team1Player)
                : 0),
            0,
          ),
        };

    const team1PitcherTotals = {
      actual: pitcherSlotRows.reduce<number>((sum, row) => {
        const gameSum =
          row.team1Player?.games?.reduce<number>(
            (s, g) => s + calculateGameScore(g),
            0,
          ) ?? 0;
        return sum + gameSum;
      }, 0),
      projected: pitcherSlotRows.reduce<number>(
        (sum, row) =>
          sum +
          (row.team1Player ? calculatePlayerProjection(row.team1Player) : 0),
        0,
      ),
    };

    const team2BatterTotals = isFootball
      ? {
          actual: footballTeamScores.get(team2Id ?? -1)?.actual ?? 0,
          projected: footballTeamScores.get(team2Id ?? -1)?.projected ?? 0,
        }
      : {
          actual: batterSlotRows.reduce<number>((sum, row) => {
            const gameSum =
              row.team2Player?.games?.reduce<number>(
                (s, g) => s + calculateGameScore(g),
                0,
              ) ?? 0;
            return sum + gameSum;
          }, 0),
          projected: batterSlotRows.reduce<number>(
            (sum, row) =>
              sum +
              (row.team2Player
                ? calculatePlayerProjection(row.team2Player)
                : 0),
            0,
          ),
        };

    const team2PitcherTotals = {
      actual: pitcherSlotRows.reduce<number>((sum, row) => {
        const gameSum =
          row.team2Player?.games?.reduce<number>(
            (s, g) => s + calculateGameScore(g),
            0,
          ) ?? 0;
        return sum + gameSum;
      }, 0),
      projected: pitcherSlotRows.reduce<number>(
        (sum, row) =>
          sum +
          (row.team2Player ? calculatePlayerProjection(row.team2Player) : 0),
        0,
      ),
    };

    return {
      team1Bench,
      team2Bench,
      team1Bullpen,
      team1BenchFielders,
      team2Bullpen,
      team2BenchFielders,
      team1RosterCount: team1All.length,
      team2RosterCount: team2All.length,
      batterSlotRows,
      pitcherSlotRows,
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
    positionsData,
    isFootball,
    footballTeamScores,
  ]);

  if (!team1Id || !team2Id) {
    return (
      <div className="mrc-root">
        <div className="mrc-wrap">
          <div className="mrc-head">
            <h1 className="mrc-title">Player Matchups</h1>
          </div>
          <div className="mrc-state-msg mrc-empty">
            <div className="mrc-ic">VS</div>
            <h3>No teams assigned yet</h3>
            <p>
              This matchup slot doesn&rsquo;t have both teams set. Once the
              schedule locks, rosters will appear here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mrc-root">
        <div className="mrc-wrap">
          <div className="mrc-head">
            <h1 className="mrc-title">Player Matchups</h1>
          </div>
          <div className="mrc-state-msg mrc-error">
            <div className="mrc-ic">!</div>
            <h3>Unable to load this matchup</h3>
            <p>{error.message}</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading || positionsLoading || scoringLoading) {
    return <SkeletonLoading />;
  }

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
        { label: 'R', extract: (s) => s?.runs ?? 0, scoringKey: 'r' },
        { label: 'H', extract: (s) => s?.hits ?? 0, scoringKey: 'h' },
        { label: '2B', extract: (s) => s?.doubles ?? 0, scoringKey: 'doubles' },
        { label: '3B', extract: (s) => s?.triples ?? 0, scoringKey: 'triples' },
        { label: 'HR', extract: (s) => s?.homeRuns ?? 0, scoringKey: 'hr' },
        { label: 'RBI', extract: (s) => s?.rbi ?? 0, scoringKey: 'rbi' },
        { label: 'SB', extract: (s) => s?.stolenBases ?? 0, scoringKey: 'sb' },
        {
          label: 'CS',
          extract: (s) => s?.caughtStealing ?? 0,
          scoringKey: 'cs',
        },
        { label: 'BB', extract: (s) => s?.baseOnBalls ?? 0, scoringKey: 'bb' },
        { label: 'SO', extract: (s) => s?.strikeouts ?? 0, scoringKey: 'so' },
        {
          label: 'HBP',
          extract: (s) => s?.hitByPitch ?? 0,
          scoringKey: 'hbp',
        },
      ];

      const battingParts: string[] = [];

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
        const scoringValue = scoringSettings.batting[stat.scoringKey];
        if (scoringValue !== undefined && scoringValue !== 0) {
          const total = battingGames.reduce((sum, g) => {
            if (!g.battingGame) return sum;
            return sum + stat.extract(g.battingGame);
          }, 0);

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
        { label: 'W', extract: (s) => s?.wins ?? 0, scoringKey: 'w' },
        { label: 'L', extract: (s) => s?.losses ?? 0, scoringKey: 'l' },
        { label: 'SV', extract: (s) => s?.saves ?? 0, scoringKey: 'sv' },
        { label: 'H', extract: (s) => s?.hits ?? 0, scoringKey: 'h' },
        { label: 'ER', extract: (s) => s?.earnedRuns ?? 0, scoringKey: 'er' },
        { label: 'BB', extract: (s) => s?.baseOnBalls ?? 0, scoringKey: 'bb' },
        { label: 'SO', extract: (s) => s?.strikeouts ?? 0, scoringKey: 'so' },
      ];

      const pitchingParts: string[] = [];

      const outsRecordedScoring = scoringSettings.pitching.outsRecorded;
      if (outsRecordedScoring !== undefined && outsRecordedScoring !== 0) {
        const totalOuts = pitchingGames.reduce(
          (sum, g) => sum + (g.pitchingGame?.outsRecorded ?? 0),
          0,
        );
        if (totalOuts > 0) {
          pitchingParts.push(`${outsToBaseballIP(totalOuts)}IP`);
        }
      }

      for (const stat of pitchingStats) {
        const scoringValue = scoringSettings.pitching[stat.scoringKey];
        if (scoringValue !== undefined && scoringValue !== 0) {
          const total = pitchingGames.reduce((sum, g) => {
            if (!g.pitchingGame) return sum;
            return sum + stat.extract(g.pitchingGame);
          }, 0);

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
        { label: 'E', extract: (s) => s?.errors ?? 0, scoringKey: 'eDef' },
      ];

      const fieldingParts: string[] = [];
      for (const stat of fieldingStats) {
        const scoringValue = scoringSettings.fielding[stat.scoringKey];
        if (scoringValue !== undefined && scoringValue !== 0) {
          const total = fieldingGames.reduce((sum, g) => {
            if (!g.fieldingGame) return sum;
            return sum + stat.extract(g.fieldingGame);
          }, 0);

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

  // Suffix shown after the "Season {year} • {gp}/{gs} games" meta line —
  // priority: loading > failed > no data > off days > yet to play.
  const metaSuffix = (
    player: MatchupPlayerFragment,
  ): { text: string; className: string } | null => {
    const games = player.games ?? [];
    if (games.length === 0) return { text: ' • Yet to play', className: '' };
    const loadingCount = games.filter(
      (g) =>
        !hasNoStats(g) &&
        (g.statsLoadingStatus === 'loading' ||
          g.statsLoadingStatus === 'pending'),
    ).length;
    if (loadingCount > 0) return { text: ' • Loading stats', className: '' };
    const failedCount = games.filter(
      (g) => !hasNoStats(g) && g.statsLoadingStatus === 'failed',
    ).length;
    if (failedCount > 0)
      return { text: ' • Stats unavailable', className: 'mrc-fail' };
    // A data-availability gap (no per-game box scores for the player's
    // assigned season) is not a real off day — never fold it into the
    // off-day count (LS-9122).
    const noDataCount = games.filter((g) => g.noGameDataFound).length;
    if (noDataCount > 0)
      return { text: ' • Stats unavailable', className: 'mrc-fail' };
    const skippedCount = games.filter((g) => g.pitcherStartSkipped).length;
    if (skippedCount > 0) {
      return {
        text: ` • ${skippedCount} off day${skippedCount > 1 ? 's' : ''}`,
        className: '',
      };
    }
    return null;
  };

  // Prorated projection to date → whether the player is beating their pace.
  // Matches the original component: paced against the matchup-wide
  // gamesPerMatchup, not the player's own numberOfGames (which differs for
  // pitchers with a separate pitcherStartsPerMatchup).
  const beatsProjection = (
    player: MatchupPlayerFragment,
    actual: number,
    proj: number,
  ): boolean | null => {
    const gamesPlayed = player.games?.filter((g) => !hasNoStats(g)).length ?? 0;
    if (gamesPlayed === 0) return null;
    const expected = (proj / gamesPerMatchup) * gamesPlayed;
    return actual >= expected;
  };

  const openFootballPlayerDetail = (player: MatchupPlayerFragment) => {
    if (player.playerId) {
      setFootballPlayerId(player.playerId);
      setFootballModalOpen(true);
    }
  };

  const openSeasonModal = (player: MatchupPlayerFragment) => {
    if (player.playerId && player.player) {
      setSelectedPlayer({
        id: player.playerId,
        name: `${player.player.firstName} ${player.player.lastName}`,
      });
      setSeasonStatsModalOpen(true);
    }
  };

  const openBreakdownModal = (player: MatchupPlayerFragment) => {
    const hasPlayed =
      (player.games?.filter((g) => !hasNoStats(g)).length ?? 0) > 0;
    if (hasPlayed && player.player) {
      setSelectedMatchupPlayer(player);
      setSelectedMatchupPlayerName(
        `${player.player.firstName} ${player.player.lastName}`,
      );
      setMatchupStatsModalOpen(true);
    }
  };

  // Renders one team's half of a slot row. `slotType` is passed for starter
  // rows (both sides share a slot); bench/bullpen rows omit it since the two
  // sides pair arbitrary players who may hold different positions — those
  // rows fall back to each player's own position, shown inline.
  const renderCell = (
    team: 1 | 2,
    player: MatchupPlayerFragment | undefined,
    slotType: string | undefined,
    isLead: boolean,
  ) => {
    const cls = team === 1 ? 'mrc-t1' : 'mrc-t2';
    const mine = userTeamId != null && team === 1 ? ' mrc-mine' : '';

    if (!player) {
      return (
        <div className={`mrc-cell ${cls}${mine}`}>
          <div className="mrc-pinfo">
            <span className="mrc-pname mrc-empty">Empty</span>
          </div>
          <div className="mrc-pscore">
            <div className="mrc-sc mrc-proj">
              <span className="mrc-lab">Proj</span>
              <span className="mrc-num">—</span>
            </div>
            <div className="mrc-sc mrc-actual">
              <span className="mrc-lab">Actual</span>
              <span className="mrc-num">—</span>
            </div>
          </div>
        </div>
      );
    }

    const actual = isFootball
      ? getPlayerActualScore(player)
      : (player.games?.reduce(
          (sum, game) => sum + calculateGameScore(game),
          0,
        ) ?? 0);
    const proj = isFootball
      ? getPlayerProjectedScore(player)
      : calculatePlayerProjection(player);
    const hasPlayed =
      (player.games?.filter((g) => !hasNoStats(g)).length ?? 0) > 0;
    const beats = beatsProjection(player, actual, proj);
    const actualCls = beats === null ? '' : beats ? 'mrc-up' : 'mrc-down';
    const suffix = metaSuffix(player);
    const posLabel = slotType
      ? undefined
      : player.positionId
        ? positionMap.get(player.positionId)
        : (player.player?.eligiblePositions?.[0] ?? null);
    const group = getPositionGroup(slotType ?? posLabel, isFootball);
    const statLine = formatAccumulatedStats(player);
    const lead = isLead ? ' mrc-lead' : '';
    const matchupGrade =
      isFootball && canSeeMatchupGrade && player.footballSeasonFppg != null
        ? getMatchupGrade(player.footballSeasonFppg, group)
        : null;
    // LS-6394: badge rows whose points may under-count because a scheduled
    // game produced no stat rows.
    const statsBadge = isFootball
      ? STATS_QUALITY_BADGES[getPlayerDataQuality(player)]
      : null;

    return (
      <div className={`mrc-cell ${cls}${mine}${lead}`}>
        {!slotType && (
          <span className={`mrc-pos-badge mrc-pos-badge-inline mrc-g-${group}`}>
            {posLabel ?? '?'}
          </span>
        )}
        <div className="mrc-pinfo">
          <div className="mrc-pname-row">
            <button
              type="button"
              className="mrc-pname"
              onClick={() =>
                isFootball
                  ? openFootballPlayerDetail(player)
                  : openSeasonModal(player)
              }
            >
              {player.player?.firstName} {player.player?.lastName}
            </button>
            {matchupGrade && (
              <span
                className={`mrc-grade-chip mrc-grade-${matchupGrade.tier}`}
                title="Matchup Edge — grades this player's season scoring pace so far, not opponent strength"
              >
                {matchupGrade.grade}
              </span>
            )}
            {statsBadge && (
              <span
                className="mrc-stats-pending-chip"
                title={statsBadge.title}
                data-testid={`stats-pending-badge-${player.playerId}`}
              >
                {statsBadge.label}
              </span>
            )}
          </div>
          <div className="mrc-pmeta">
            Season {player.season} •{' '}
            {player.games?.filter((g) => !hasNoStats(g)).length ?? 0}/
            {player.numberOfGames ?? gamesPerMatchup} games
            {suffix && (
              <span className={`mrc-suffix ${suffix.className}`}>
                {suffix.text}
              </span>
            )}
          </div>
          {statLine && <div className="mrc-pstat">{statLine}</div>}
          {isFootball && player.playerId != null && (
            <>
              <button
                type="button"
                className="mrc-advstats-toggle"
                aria-expanded={expandedAdvancedStats.has(player.playerId)}
                onClick={() => toggleAdvancedStats(player.playerId as number)}
              >
                {expandedAdvancedStats.has(player.playerId)
                  ? 'Hide advanced stats'
                  : 'Advanced stats'}
              </button>
              {expandedAdvancedStats.has(player.playerId) && (
                <div className="mrc-advstats-panel">
                  {!canSeeAdvancedStats ? (
                    <p className="mrc-advstats-locked">
                      Snap %, target share, and air yards are a Premium feature.
                    </p>
                  ) : player.advancedStats?.snapCountPercentage == null &&
                    player.advancedStats?.targetSharePercentage == null &&
                    player.advancedStats?.airYards == null ? (
                    <p className="mrc-advstats-empty">
                      Advanced stats are coming soon for this player.
                    </p>
                  ) : (
                    <dl className="mrc-advstats-list">
                      <div className="mrc-advstats-row">
                        <dt>Snap %</dt>
                        <dd>
                          {player.advancedStats.snapCountPercentage != null
                            ? `${player.advancedStats.snapCountPercentage.toFixed(0)}%`
                            : '—'}
                        </dd>
                      </div>
                      <div className="mrc-advstats-row">
                        <dt>Target share</dt>
                        <dd>
                          {player.advancedStats.targetSharePercentage != null
                            ? `${player.advancedStats.targetSharePercentage.toFixed(0)}%`
                            : '—'}
                        </dd>
                      </div>
                      <div className="mrc-advstats-row">
                        <dt>Air yards</dt>
                        <dd>{player.advancedStats.airYards ?? '—'}</dd>
                      </div>
                    </dl>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <div className="mrc-pscore">
          <div className="mrc-sc mrc-proj">
            <span className="mrc-lab">Proj</span>
            <span className="mrc-num">{proj.toFixed(1)}</span>
          </div>
          <button
            type="button"
            className="mrc-sc mrc-actual"
            onClick={() =>
              isFootball
                ? openFootballPlayerDetail(player)
                : openBreakdownModal(player)
            }
          >
            <span className="mrc-lab">Actual</span>
            <span className={`mrc-num ${actualCls}`}>
              {hasPlayed ? actual.toFixed(1) : '—'}
            </span>
          </button>
        </div>
      </div>
    );
  };

  const slotRow = (
    key: string,
    slotType: string | undefined,
    team1Player: MatchupPlayerFragment | undefined,
    team2Player: MatchupPlayerFragment | undefined,
  ) => {
    // Only starter rows share a single league slot (and therefore a single
    // position) across both teams — bench/bullpen rows pair arbitrary
    // players by index and rely on each cell's own inline badge instead.
    const group = getPositionGroup(slotType, isFootball);
    const team1Actual = team1Player
      ? isFootball
        ? getPlayerActualScore(team1Player)
        : (team1Player.games?.reduce(
            (sum, g) => sum + calculateGameScore(g),
            0,
          ) ?? 0)
      : 0;
    const team2Actual = team2Player
      ? isFootball
        ? getPlayerActualScore(team2Player)
        : (team2Player.games?.reduce(
            (sum, g) => sum + calculateGameScore(g),
            0,
          ) ?? 0)
      : 0;
    const team1Played =
      (team1Player?.games?.filter((g) => !hasNoStats(g)).length ?? 0) > 0;
    const team2Played =
      (team2Player?.games?.filter((g) => !hasNoStats(g)).length ?? 0) > 0;
    const team1Lead =
      team1Player != null &&
      team2Player != null &&
      team1Played &&
      team2Played &&
      team1Actual > team2Actual;
    const team2Lead =
      team1Player != null &&
      team2Player != null &&
      team1Played &&
      team2Played &&
      team2Actual > team1Actual;

    return (
      <div className={`mrc-slot mrc-g-${group}`} key={key}>
        {renderCell(1, team1Player, slotType, team1Lead)}
        {slotType && (
          <div className="mrc-pos">
            <span className="mrc-pos-badge">{slotType}</span>
          </div>
        )}
        {renderCell(2, team2Player, slotType, team2Lead)}
      </div>
    );
  };

  const totalsRow = (
    label: string,
    team1Totals: { projected: number; actual: number },
    team2Totals: { projected: number; actual: number },
  ) => {
    const team1Cls =
      team1Totals.actual === team2Totals.actual
        ? ''
        : team1Totals.actual > team2Totals.actual
          ? 'mrc-up'
          : 'mrc-down';
    const team2Cls =
      team1Totals.actual === team2Totals.actual
        ? ''
        : team2Totals.actual > team1Totals.actual
          ? 'mrc-up'
          : 'mrc-down';
    return (
      <div className="mrc-totals">
        <div className="mrc-tot-cell mrc-t1">
          <div className="mrc-sc mrc-proj">
            <span className="mrc-num">{team1Totals.projected.toFixed(1)}</span>
          </div>
          <div className="mrc-sc mrc-actual">
            <span className={`mrc-num ${team1Cls}`}>
              {team1Totals.actual.toFixed(1)}
            </span>
          </div>
          <div className="mrc-filler" />
        </div>
        <div className="mrc-tot-lab">{label}</div>
        <div className="mrc-tot-cell mrc-t2">
          <div className="mrc-sc mrc-proj">
            <span className="mrc-num">{team2Totals.projected.toFixed(1)}</span>
          </div>
          <div className="mrc-sc mrc-actual">
            <span className={`mrc-num ${team2Cls}`}>
              {team2Totals.actual.toFixed(1)}
            </span>
          </div>
          <div className="mrc-filler" />
        </div>
      </div>
    );
  };

  const maxBullpenRows = Math.max(team1Bullpen.length, team2Bullpen.length);
  const maxBenchFielderRows = Math.max(
    team1BenchFielders.length,
    team2BenchFielders.length,
  );
  const playerCount = data?.getMatchupPlayers?.length ?? 0;
  return (
    <div className="mrc-root">
      <div className="mrc-wrap">
        <div className="mrc-head">
          <h1 className="mrc-title">Player Matchups</h1>
          <span className="mrc-count">
            <span>
              {team1RosterCount} vs {team2RosterCount}
            </span>{' '}
            players
          </span>
        </div>

        {isStatsLoading(matchup.statsLoadingStatus) && (
          <div className="mrc-banner mrc-updating">
            <span className="mrc-dot" />
            Stats are updating — scores refresh automatically as the games
            finish processing.
          </div>
        )}
        {seasonStatsMap.size === 0 && playerCount > 0 && (
          <div className="mrc-banner mrc-noseason">
            <span className="mrc-dot" />
            Season statistics not available — projections are running on
            in-matchup games only, not full-season data.
          </div>
        )}

        <div className="mrc-teams">
          <div className="mrc-theadcell mrc-t1">
            <div className="mrc-tname">
              <h2>{team1Name}</h2>
              {userTeamId != null && <span className="mrc-you">YOU</span>}
            </div>
            <div className="mrc-tcols">
              <span>Proj</span>
              <span>Actual</span>
            </div>
          </div>
          <div className="mrc-tvs">VS</div>
          <div className="mrc-theadcell mrc-t2">
            <div className="mrc-tname">
              <h2>{team2Name}</h2>
            </div>
            <div className="mrc-tcols">
              <span>Proj</span>
              <span>Actual</span>
            </div>
          </div>
        </div>

        {batterSlotRows.length > 0 && (
          <div className="mrc-section">
            <div className="mrc-section-bar">
              <h3>
                {isFootball ? 'Starting Lineup' : 'Starting Lineup — Batters'}
              </h3>
              <div className="mrc-rule" />
            </div>
            {batterSlotRows.map((row) =>
              slotRow(
                `batter-${row.slotId}`,
                row.slotType,
                row.team1Player,
                row.team2Player,
              ),
            )}
            {totalsRow(
              isFootball ? 'Team Total' : 'Hitters Total',
              team1BatterTotals,
              team2BatterTotals,
            )}
          </div>
        )}

        {pitcherSlotRows.length > 0 && (
          <div className="mrc-section">
            <div className="mrc-section-bar">
              <h3>Starting Lineup — Pitchers</h3>
              <div className="mrc-rule" />
            </div>
            {pitcherSlotRows.map((row) =>
              slotRow(
                `pitcher-${row.slotId}`,
                row.slotType,
                row.team1Player,
                row.team2Player,
              ),
            )}
            {totalsRow(
              'Pitchers Total',
              team1PitcherTotals,
              team2PitcherTotals,
            )}
          </div>
        )}

        {(team1Bench.length > 0 || team2Bench.length > 0) && (
          <>
            <button
              type="button"
              className="mrc-bench-toggle"
              aria-expanded={showBench}
              onClick={() => setShowBench(!showBench)}
            >
              <h3>{showBench ? 'Hide' : 'Show'} Bench</h3>
              <span className="mrc-cnt">
                {team1Bench.length} vs {team2Bench.length}
              </span>
              <span className="mrc-chev" aria-hidden="true">
                ▶
              </span>
            </button>
            {showBench && (
              <>
                {(team1Bullpen.length > 0 || team2Bullpen.length > 0) && (
                  <div className="mrc-section">
                    <div className="mrc-section-bar">
                      <h3>Bullpen</h3>
                      <div className="mrc-rule" />
                    </div>
                    {Array.from({ length: maxBullpenRows }).map((_, index) =>
                      slotRow(
                        `bullpen-${index}`,
                        undefined,
                        team1Bullpen[index],
                        team2Bullpen[index],
                      ),
                    )}
                  </div>
                )}
                {(team1BenchFielders.length > 0 ||
                  team2BenchFielders.length > 0) && (
                  <div className="mrc-section">
                    <div className="mrc-section-bar">
                      <h3>Bench</h3>
                      <div className="mrc-rule" />
                    </div>
                    {Array.from({ length: maxBenchFielderRows }).map(
                      (_, index) =>
                        slotRow(
                          `bench-${index}`,
                          undefined,
                          team1BenchFielders[index],
                          team2BenchFielders[index],
                        ),
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

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

      {/* Football Player Detail Modal (name/score clicks, football leagues only) */}
      <FootballPlayerDetailModal
        playerId={footballPlayerId}
        open={footballModalOpen}
        onOpenChange={setFootballModalOpen}
      />
    </div>
  );
}
