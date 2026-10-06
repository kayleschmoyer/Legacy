import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RosterActionBar,
  RosterBoard,
  RosterOverLimitNotice,
  type RosterPlayerStats,
  RosterScoreboard,
  type RosterScorelineTeam,
  RosterStatusBanners,
} from '@legacy-sports/shared-components/roster';
import {
  computeFootballMatchupTotals,
  PendingTradeOfferBanner,
  useFootballMatchupScores,
} from '@legacy-sports/shared-components/matchup';
import { type SeasonStats } from '@legacy-sports/scoring';
import {
  type LeagueFragment,
  type LeaguePositionFragment,
  type MatchupPlayerFragment,
  Sport,
  type TeamMemberFragment,
  useGetMatchupPlayersQuery,
  useGetNflTeamSeasonMetadataQuery,
  useGetPositionsForLeagueQuery,
  useGetTeamMembersQuery,
  useSwapTeamMemberPositionsMutation,
  useUpdateTeamMemberPositionMutation,
} from '@legacy-sports/graphql';
import { LOGGER } from '@legacy-sports/logging';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import { CombinedGraphQLErrors } from '@apollo/client';
import { Button, Text, useMedia, XStack, YStack } from 'tamagui';
import { PendingWaiverClaims } from '../../../../features/roster';
import {
  computeFootballMatchupPlayerStats,
  computeMatchupPlayerStats,
  computeMatchupScores,
  type MatchupPlayerComputedStats,
} from '../../../../features/matchup/MatchupScoreboard';
import {
  useMatchupById,
  useMatchupsByWeek,
} from '../../../../hooks/useMatchup';
import { useLeagueScoringSettings } from '../../../../lib/scoring';
import { mapMatchupPlayerToSeasonStats } from '../../../../lib/scoring/mapGraphQLToScoringFormat';
import { Empty } from '../Shared';
import { I } from '../Icons';
import { PremiumGate } from '../../../../components/PremiumGate';
import { useHasEntitlement } from '../../../../hooks/useIsPremium';

export interface RosterTabProps {
  league: LeagueFragment;
  myTeamId: number | null;
}

/** "Thu Nov 12" — the scoreline hero's matchup-period date format. */
function formatPeriodDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

const PLAYER_LOCKED_MESSAGE =
  'This player is locked — the matchup for the current week has already started.';

/**
 * Distinguishes the expected, intentional "player locked" validation
 * (`extensions.code === 'MATCHUP_LOCKED'`, thrown by `checkPlayersNotLocked`
 * in `lambdas/db/src/schema/authorization.ts`) from genuinely unexpected
 * mutation failures, via the GraphQL error code rather than message text
 * (LS-9798).
 */
function isMatchupLockedError(err: unknown): boolean {
  return (
    CombinedGraphQLErrors.is(err) &&
    err.errors.some((e) => e.extensions?.['code'] === 'MATCHUP_LOCKED')
  );
}

export const RosterTab: React.FC<RosterTabProps> = ({ league, myTeamId }) => {
  const navigate = useNavigate();
  const media = useMedia();
  const hasOptimalLineup = useHasEntitlement(ENTITLEMENTS.optimal_lineup);
  const { data: positionsData } = useGetPositionsForLeagueQuery({
    variables: { leagueId: league.id ?? 0 },
    skip: !league.id,
  });
  const positions = (positionsData?.leaguePositions ??
    []) as readonly LeaguePositionFragment[];

  const {
    data: teamMembersData,
    loading,
    error,
    refetch,
  } = useGetTeamMembersQuery({
    variables: { teamId: myTeamId ?? 0 },
    skip: !myTeamId,
  });
  const teamPlayers = useMemo<readonly TeamMemberFragment[]>(
    () => teamMembersData?.teamMembers ?? [],
    [teamMembersData?.teamMembers],
  );

  const [updatePosition] = useUpdateTeamMemberPositionMutation();
  const [swapPositions] = useSwapTeamMemberPositionsMutation();

  const [inFlightPositionIds, setInFlightPositionIds] = useState<
    ReadonlySet<number>
  >(new Set());
  const [lockedPlayerNotice, setLockedPlayerNotice] = useState<string | null>(
    null,
  );

  const addInFlight = useCallback((ids: number[]) => {
    setInFlightPositionIds((prev) => new Set([...prev, ...ids]));
  }, []);

  const removeInFlight = useCallback((ids: number[]) => {
    setInFlightPositionIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const handleAssign = useCallback(
    async (player: TeamMemberFragment, position: LeaguePositionFragment) => {
      if (player.id == null || position.id == null) return;
      if (inFlightPositionIds.has(position.id)) return;
      addInFlight([position.id]);
      try {
        await updatePosition({
          variables: { teamMemberId: player.id, positionId: position.id },
          // Handled locally below (locked-player banner, or LOGGER.error for
          // anything else) — skip the global Apollo error toast/Rollbar link.
          context: { suppressGlobalError: true },
        });
        await refetch();
      } catch (err) {
        if (isMatchupLockedError(err)) {
          setLockedPlayerNotice(PLAYER_LOCKED_MESSAGE);
        } else {
          LOGGER.error(
            'Failed to assign player to position',
            err instanceof Error ? err : undefined,
            {
              playerId: player.id,
              positionId: position.id,
            },
          );
        }
      } finally {
        removeInFlight([position.id]);
      }
    },
    [updatePosition, refetch, inFlightPositionIds, addInFlight, removeInFlight],
  );

  const handleRemove = useCallback(
    async (position: LeaguePositionFragment) => {
      if (position.id == null) return;
      if (inFlightPositionIds.has(position.id)) return;
      const occupant = teamPlayers.find((p) => p.positionId === position.id);
      if (!occupant?.id) return;
      addInFlight([position.id]);
      try {
        await updatePosition({
          variables: { teamMemberId: occupant.id, positionId: null },
          // Handled locally below (locked-player banner, or LOGGER.error for
          // anything else) — skip the global Apollo error toast/Rollbar link.
          context: { suppressGlobalError: true },
        });
        await refetch();
      } catch (err) {
        if (isMatchupLockedError(err)) {
          setLockedPlayerNotice(PLAYER_LOCKED_MESSAGE);
        } else {
          LOGGER.error(
            'Failed to remove player from position',
            err instanceof Error ? err : undefined,
            {
              playerId: occupant.id,
              positionId: position.id,
            },
          );
        }
      } finally {
        removeInFlight([position.id]);
      }
    },
    [
      updatePosition,
      refetch,
      teamPlayers,
      inFlightPositionIds,
      addInFlight,
      removeInFlight,
    ],
  );

  const handleSwap = useCallback(
    async (
      incoming: TeamMemberFragment,
      target: LeaguePositionFragment,
      displaced: TeamMemberFragment,
    ) => {
      if (incoming.id == null || displaced.id == null || target.id == null)
        return;
      const affectedIds = [target.id];
      if (incoming.positionId != null) affectedIds.push(incoming.positionId);
      if (affectedIds.some((id) => inFlightPositionIds.has(id))) return;
      addInFlight(affectedIds);
      try {
        await swapPositions({
          variables: {
            teamMemberIdA: incoming.id,
            positionIdA: target.id,
            teamMemberIdB: displaced.id,
            positionIdB: incoming.positionId ?? undefined,
          },
          // Handled locally below (locked-player banner, or LOGGER.error for
          // anything else) — skip the global Apollo error toast/Rollbar link.
          context: { suppressGlobalError: true },
        });
        await refetch();
      } catch (err) {
        if (isMatchupLockedError(err)) {
          setLockedPlayerNotice(PLAYER_LOCKED_MESSAGE);
        } else {
          LOGGER.error(
            'Failed to swap player positions',
            err instanceof Error ? err : undefined,
            {
              incomingId: incoming.id,
              displacedId: displaced.id,
              positionId: target.id,
            },
          );
        }
      } finally {
        removeInFlight(affectedIds);
      }
    },
    [swapPositions, refetch, inFlightPositionIds, addInFlight, removeInFlight],
  );

  const currentWeek = league.currentWeekNumber ?? 1;
  const totalMatchups = league.totalMatchups ?? currentWeek;
  const [week, setWeek] = useState<number>(currentWeek);
  const isPast = week < currentWeek;
  const isFuture = week > currentWeek;
  const isCurrent = week === currentWeek;
  // Only a finalized past week is locked — future weeks are editable so
  // managers can set lineups ahead of time (LS-9768). The server's own
  // `checkPlayersNotLocked` guard (lambdas/db/src/schema/authorization.ts)
  // only ever locks the league's *current* week, so a future-week edit here
  // can never collide with that check.
  const readOnly = isPast;
  const isFootball = league.sport === Sport.Football;

  // Bye-week warning data (LS-6334) — football only. IR-slot enforcement was
  // scoped out of this ticket (product decision: no injury/IR concept on a
  // historical-data platform).
  const { data: nflByeWeekData } = useGetNflTeamSeasonMetadataQuery({
    variables: { season: league.seasonNumber ?? undefined },
    skip: !isFootball,
  });
  const byeWeeksByTeam = useMemo(() => {
    const map: Record<string, number> = {};
    for (const meta of nflByeWeekData?.nflTeamSeasonMetadata ?? []) {
      if (meta?.teamAbbreviation) map[meta.teamAbbreviation] = meta.byeWeek;
    }
    return map;
  }, [nflByeWeekData?.nflTeamSeasonMetadata]);

  // ── Matchup scoreline + per-player stats (LS-9355) ────────────────────────
  // Mirrors the Matchup tab's client-side scoring pipeline: my matchup for the
  // viewed week → matchup players → league scoring settings → computed
  // scores/projections. All of it degrades gracefully (hero hides the
  // scoreline, rows fall back to eligibility sub-lines) when data is missing.
  const { matchups } = useMatchupsByWeek(league.id ?? null, week);
  const myMatchup = useMemo(() => {
    if (myTeamId == null) return null;
    return (
      matchups.find(
        (m) => m != null && (m.team1Id === myTeamId || m.team2Id === myTeamId),
      ) ?? null
    );
  }, [matchups, myTeamId]);
  const matchupId = myMatchup?.id != null ? Number(myMatchup.id) : null;
  const { matchup } = useMatchupById(matchupId);

  const { data: playersData, error: playersError } = useGetMatchupPlayersQuery({
    variables: { matchupId: matchupId ?? 0 },
    skip: !matchupId,
    errorPolicy: 'all',
  });
  const { settings: scoringSettings } = useLeagueScoringSettings(
    league.id ?? undefined,
  );
  const seasonStatsMap = useMemo(() => {
    const map = new Map<number, SeasonStats>();
    playersData?.getMatchupPlayers?.forEach((mp: MatchupPlayerFragment) => {
      const stats = mapMatchupPlayerToSeasonStats(mp);
      if (stats) map.set(stats.playerId, stats);
    });
    return map;
  }, [playersData?.getMatchupPlayers]);

  // Football is scored server-side by `matchupScores` — the client scoring
  // pipeline reads baseball stat blocks only and sums NFL rosters to 0.0
  // (LS-10829). Same source as Matchup > Roster Comparison, so the two tabs
  // show the same per-player and team projections.
  const { playerScores: footballPlayerScores, teamScores: footballTeamScores } =
    useFootballMatchupScores({
      leagueId: league.id,
      weekNum: week,
      skip: !isFootball,
    });

  const computed = useMemo<{
    team1Score: number | null;
    team2Score: number | null;
    team1Projected: number | null;
    team2Projected: number | null;
  }>(
    () =>
      isFootball
        ? computeFootballMatchupTotals(matchup, footballTeamScores)
        : computeMatchupScores({
            matchup,
            players: playersData?.getMatchupPlayers,
            hasPlayersError: playersError != null,
            scoringSettings,
            seasonStatsMap,
          }),
    [
      isFootball,
      footballTeamScores,
      matchup,
      playersData?.getMatchupPlayers,
      playersError,
      scoringSettings,
      seasonStatsMap,
    ],
  );

  const perPlayerStats = useMemo<readonly MatchupPlayerComputedStats[]>(() => {
    if (isFootball) {
      if (!playersData?.getMatchupPlayers || playersError != null) return [];
      return computeFootballMatchupPlayerStats(
        playersData.getMatchupPlayers,
        footballPlayerScores,
      );
    }
    if (
      !matchup ||
      !playersData?.getMatchupPlayers ||
      playersError != null ||
      !scoringSettings
    )
      return [];
    return computeMatchupPlayerStats(
      matchup,
      playersData.getMatchupPlayers,
      scoringSettings,
      seasonStatsMap,
    );
  }, [
    isFootball,
    footballPlayerScores,
    matchup,
    playersData?.getMatchupPlayers,
    playersError,
    scoringSettings,
    seasonStatsMap,
  ]);

  const myPlayerStats = useMemo(() => {
    const map = new Map<number, MatchupPlayerComputedStats>();
    for (const s of perPlayerStats) {
      if (s.playerId != null && s.teamId === myTeamId) map.set(s.playerId, s);
    }
    return map;
  }, [perPlayerStats, myTeamId]);

  const getPlayerStats = useCallback(
    (tm: TeamMemberFragment): RosterPlayerStats | null => {
      const playerId = tm.player?.id ?? tm.playerId;
      if (playerId == null) return null;
      const s = myPlayerStats.get(playerId);
      if (!s) return null;
      return {
        actual: s.actual,
        projected: s.projected,
        gamesPlayed: s.gamesPlayed,
        totalGames: s.totalGames,
        seasonYear: s.season,
        teamAbbr: tm.player?.mlbTeam,
      };
    },
    [myPlayerStats],
  );

  const scoreline = useMemo<{
    myTeam: RosterScorelineTeam;
    opponent: RosterScorelineTeam;
  } | null>(() => {
    if (!matchup || myTeamId == null) return null;
    if (matchup.team1Id !== myTeamId && matchup.team2Id !== myTeamId)
      return null;
    const iAmTeam1 = matchup.team1Id === myTeamId;
    const sideFor = (
      teamId: number | null | undefined,
    ): RosterScorelineTeam => {
      const starters = perPlayerStats.filter(
        (s) => s.teamId === teamId && s.positionId != null,
      );
      const played = starters.filter(
        (s) => s.totalGames > 0 && s.gamesPlayed >= s.totalGames,
      ).length;
      const isTeam1 = teamId === matchup.team1Id;
      return {
        name: (isTeam1 ? matchup.team1?.name : matchup.team2?.name) ?? null,
        score: isTeam1 ? computed.team1Score : computed.team2Score,
        projected: isTeam1 ? computed.team1Projected : computed.team2Projected,
        playersPlayed: starters.length > 0 ? played : null,
        playersTotal: starters.length > 0 ? starters.length : null,
      };
    };
    return {
      myTeam: sideFor(iAmTeam1 ? matchup.team1Id : matchup.team2Id),
      opponent: sideFor(iAmTeam1 ? matchup.team2Id : matchup.team1Id),
    };
  }, [matchup, myTeamId, perPlayerStats, computed]);

  const dateRange =
    matchup?.startTime && matchup?.endTime
      ? `${formatPeriodDate(matchup.startTime)} – ${formatPeriodDate(matchup.endTime)}`
      : null;

  const handleQuickSwap = useCallback(() => {
    document
      .querySelector('[data-testid="roster-section-bench"]')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  if (!myTeamId) {
    return (
      <Empty
        icon={<I.Users size={32} />}
        title="No team yet"
        sub="Join this league to manage your roster."
      />
    );
  }

  // Set Optimal Lineup lives in the hero's action band for premium users
  // (mockup 2a); free users keep the PremiumGate upsell section below. The
  // button itself remains the pre-redesign disabled placeholder — wiring the
  // optimizer is not part of the presentation-only redesign (LS-9355).
  const optimalLineupButton =
    isCurrent && hasOptimalLineup ? (
      <button
        type="button"
        className="ls-btn ls-btn-gold sm"
        disabled
        aria-label="Set Optimal Lineup"
      >
        <I.Zap size={12} /> Set Optimal Lineup
      </button>
    ) : null;

  const isNarrow = media.md;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <RosterScoreboard
        week={week}
        currentWeek={currentWeek}
        totalWeeks={totalMatchups}
        onWeekChange={setWeek}
        onResetToCurrent={() => setWeek(currentWeek)}
        myTeam={scoreline?.myTeam ?? null}
        opponent={scoreline?.opponent ?? null}
        dateRange={dateRange}
        actions={optimalLineupButton}
      />

      <RosterStatusBanners isPast={isPast} isFuture={isFuture} />

      {league.id != null && (
        <RosterOverLimitNotice leagueId={league.id} teamId={myTeamId} />
      )}

      {lockedPlayerNotice && (
        <XStack
          role="alert"
          aria-live="assertive"
          borderRadius="$4"
          borderWidth={1}
          backgroundColor="$orange3"
          borderColor="$orange7"
          padding="$3"
          gap="$2"
          alignItems="center"
          justifyContent="space-between"
        >
          <Text fontSize="$3" color="$orange11" flex={1}>
            {lockedPlayerNotice}
          </Text>
          <Button
            size="$2"
            chromeless
            aria-label="Dismiss"
            onPress={() => setLockedPlayerNotice(null)}
          >
            <I.X size={14} />
          </Button>
        </XStack>
      )}

      {isCurrent && league.id != null && (
        <PendingTradeOfferBanner
          teamId={myTeamId}
          onReview={() =>
            navigate(
              league.sport === Sport.Football
                ? `/football/league/${league.id}/trades`
                : `/baseball/league/${league.id}/trades`,
            )
          }
        />
      )}

      {(isCurrent || isFuture) && (
        <PendingWaiverClaims
          teamId={myTeamId}
          compact={!isCurrent || isNarrow}
        />
      )}

      {isCurrent && !hasOptimalLineup && (
        <PremiumGate
          isPremium={hasOptimalLineup}
          featureName="Optimal Lineup"
          featureDescription="Automatically set your best lineup before lock based on projections and optimizer."
        >
          <YStack gap="$2">
            <Text fontWeight="600" fontSize="$3">
              Optimal Lineup
            </Text>
            <Button size="$3" alignSelf="flex-start" disabled>
              Set Optimal Lineup
            </Button>
          </YStack>
        </PremiumGate>
      )}

      <RosterBoard<TeamMemberFragment, LeaguePositionFragment>
        sport={league.sport === Sport.Football ? 'football' : 'baseball'}
        positions={positions}
        teamPlayers={teamPlayers}
        onPlayerAssign={(player, position) => {
          void handleAssign(player, position);
        }}
        onPlayerRemove={(position) => {
          void handleRemove(position);
        }}
        onPlayerSwap={(incoming, target, displaced) => {
          void handleSwap(incoming, target, displaced);
        }}
        onPlayerPress={(player) => {
          const playerId = player.player?.id ?? player.playerId;
          if (playerId != null) {
            navigate(
              league.sport === Sport.Football
                ? `/football/players/${playerId}`
                : `/players/${playerId}`,
            );
          }
        }}
        loading={loading}
        error={error ?? null}
        readOnly={readOnly}
        disabledPositionIds={inFlightPositionIds}
        getPlayerStats={getPlayerStats}
        currentWeek={isFootball ? week : undefined}
        byeWeeksByTeam={byeWeeksByTeam}
      />

      {isNarrow && isCurrent && (
        <RosterActionBar
          onOptimalLineup={hasOptimalLineup ? () => undefined : undefined}
          optimalLineupDisabled
          onQuickSwap={handleQuickSwap}
        />
      )}
    </div>
  );
};
