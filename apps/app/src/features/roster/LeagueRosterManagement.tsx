import React, { useMemo, useRef, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { ScrollView } from 'react-native';
import type { RefreshControlProps } from 'react-native';
import {
  OtherTeamViewingBanner,
  PendingTradeOffers,
  PendingWaiverClaims,
  RosterActionBar,
  RosterBoard,
  RosterOverLimitNotice,
  RosterScoreboard,
  type RosterScorelineTeam,
  RosterStatusBanners,
} from '@legacy-sports/shared-components/roster';
import {
  AppTeamMemberFragment,
  LeaguePositionFragment,
  useGetMatchupsByWeekQuery,
} from '@legacy-sports/graphql';

export type LeagueRosterManagementProps = {
  positions: readonly LeaguePositionFragment[];
  teamPlayers: readonly AppTeamMemberFragment[];
  onPlayerAssign: (
    player: AppTeamMemberFragment,
    position: LeaguePositionFragment,
  ) => void;
  onPlayerRemove: (position: LeaguePositionFragment) => void;
  /** Swap two players' slots (atomic swap mutation on the data layer). */
  onPlayerSwap?: (
    incoming: AppTeamMemberFragment,
    target: LeaguePositionFragment,
    displaced: AppTeamMemberFragment,
  ) => void;
  /** Navigate to a player's detail page. Sport-aware routing handled by the caller. */
  onPlayerPress?: (player: {
    player?: { id?: number | null } | null;
    playerId?: number | null;
  }) => void;
  loading?: boolean;
  leagueId?: number | null;
  /** The league's live/current week. Enables week navigation when provided. */
  currentWeek?: number | null;
  /** Total matchup weeks in the season. */
  totalWeeks?: number | null;
  /** The viewer's team id — enables pending trade/waiver banners. */
  myTeamId?: number | null;
  /** Pull-to-refresh control for the tab's `ScrollView` (LS-8847). */
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /**
   * Set when viewing another team's roster (via standings or matchup
   * click). Renders the "Other Team Viewing" banner, forces the board
   * read-only, and hides the viewer's own trade/waiver banners (LS-6335).
   * Only takes effect once `onBackToMyRoster` is also set — see the
   * `viewingTeamName != null && onBackToMyRoster != null` guard below.
   */
  viewingTeamName?: string | null;
  /** "Back to My Roster" handler — required for `viewingTeamName` to take effect. */
  onBackToMyRoster?: () => void;
  /**
   * Whether this league has a salary cap enabled (gated by
   * `ENTITLEMENTS.salary_cap_leagues`). Drives the per-player salary column
   * and the team cap-remaining summary — invisible in non-cap leagues
   * (LS-6338).
   */
  salaryCapEnabled?: boolean | null;
  /** The viewer's team's remaining salary cap space (dollars), when known. */
  capSpace?: number | null;
  /** League sport — controls the board's starter grouping and football-specific constraints. Defaults to `'baseball'`. */
  sport?: 'baseball' | 'football';
  /**
   * Per-NFL-team bye week for the league's active season, keyed by team
   * abbreviation (LS-6334). Football-only; ignored for baseball.
   */
  byeWeeksByTeam?: Readonly<Record<string, number>>;
};

/**
 * LeagueRosterManagement — native roster tab.
 *
 * Wraps the cross-platform shared `RosterBoard` with the "command center"
 * chrome (LS-9355): the `RosterScoreboard` scoreline header is pinned above
 * the ScrollView, the `RosterStatusBanners` + pending trade-offer /
 * waiver-claim banners scroll with the board, and the `RosterActionBar` sits
 * in thumb reach below. The matchup scoreline for the viewed week is fetched
 * here (server-stored scores) so all league screens get it without extra
 * wiring. Past weeks are read-only; the board's mutations are gated on
 * `!isPast`.
 */
export function LeagueRosterManagement({
  positions,
  teamPlayers,
  onPlayerAssign,
  onPlayerRemove,
  onPlayerSwap,
  onPlayerPress,
  loading = false,
  leagueId,
  currentWeek,
  totalWeeks,
  myTeamId,
  viewingTeamName,
  onBackToMyRoster,
  refreshControl,
  salaryCapEnabled = false,
  capSpace,
  sport = 'baseball',
  byeWeeksByTeam,
}: LeagueRosterManagementProps): React.JSX.Element {
  const isViewingOther = viewingTeamName != null;
  const effectiveCurrent = currentWeek ?? 1;
  const effectiveTotal = totalWeeks ?? effectiveCurrent;
  // `week === null` tracks the live week until the user navigates, so the view
  // follows `currentWeek` once the league query resolves without an effect.
  const [week, setWeek] = useState<number | null>(null);
  const activeWeek = week ?? effectiveCurrent;
  const scrollRef = useRef<ScrollView>(null);

  const isPast = activeWeek < effectiveCurrent;
  const isFuture = activeWeek > effectiveCurrent;
  const isCurrent = activeWeek === effectiveCurrent && !isViewingOther;
  const showWeekNav =
    currentWeek != null && effectiveTotal > 1 && !isViewingOther;

  // Matchup scoreline for the viewed week (LS-9355). Server-stored scores —
  // native does not recompute live scores client-side, so projections are
  // omitted and the hero degrades to names + scores.
  const { data: matchupsData } = useGetMatchupsByWeekQuery({
    variables: { leagueId: leagueId ?? 0, weekNumber: activeWeek },
    skip: leagueId == null || myTeamId == null || !showWeekNav,
  });
  const scoreline = useMemo<{
    myTeam: RosterScorelineTeam;
    opponent: RosterScorelineTeam;
  } | null>(() => {
    if (myTeamId == null) return null;
    const myMatchup =
      matchupsData?.getMatchupsByWeek?.find(
        (m) => m != null && (m.team1Id === myTeamId || m.team2Id === myTeamId),
      ) ?? null;
    if (!myMatchup) return null;
    const iAmTeam1 = myMatchup.team1Id === myTeamId;
    const side = (team1: boolean): RosterScorelineTeam => ({
      name: (team1 ? myMatchup.team1?.name : myMatchup.team2?.name) ?? null,
      score: (team1 ? myMatchup.team1Score : myMatchup.team2Score) ?? 0,
    });
    return {
      myTeam: side(iAmTeam1),
      opponent: side(!iAmTeam1),
    };
  }, [matchupsData?.getMatchupsByWeek, myTeamId]);

  return (
    <YStack flex={1}>
      {showWeekNav && (
        <RosterScoreboard
          week={activeWeek}
          currentWeek={effectiveCurrent}
          totalWeeks={effectiveTotal}
          onWeekChange={setWeek}
          onResetToCurrent={() => setWeek(effectiveCurrent)}
          myTeam={scoreline?.myTeam ?? null}
          opponent={scoreline?.opponent ?? null}
        />
      )}

      <ScrollView ref={scrollRef} refreshControl={refreshControl}>
        <YStack padding="$4" gap="$4">
          {salaryCapEnabled && capSpace != null && (
            <XStack
              justifyContent="space-between"
              alignItems="center"
              paddingHorizontal="$3"
              paddingVertical="$2.5"
              borderRadius="$4"
              borderWidth={1}
              borderColor="$outlineSubtle"
              backgroundColor="$surfaceSubtle"
            >
              <Text fontSize="$2" fontWeight="600" color="$gray10">
                Cap Remaining
              </Text>
              <Text
                fontSize="$5"
                fontWeight="800"
                color={capSpace < 0 ? '$red10' : '$brandGoldLight'}
              >
                ${capSpace.toLocaleString()}
              </Text>
            </XStack>
          )}

          {viewingTeamName != null && onBackToMyRoster != null ? (
            <OtherTeamViewingBanner
              teamName={viewingTeamName}
              onBackToMyRoster={onBackToMyRoster}
            />
          ) : (
            <RosterStatusBanners isPast={isPast} isFuture={isFuture} />
          )}

          {!isViewingOther && myTeamId != null && leagueId != null && (
            <RosterOverLimitNotice leagueId={leagueId} teamId={myTeamId} />
          )}

          {isCurrent && myTeamId != null && (
            <PendingTradeOffers
              teamId={myTeamId}
              leagueId={leagueId ?? undefined}
            />
          )}
          {isCurrent && myTeamId != null && (
            <PendingWaiverClaims teamId={myTeamId} />
          )}

          <RosterBoard<AppTeamMemberFragment, LeaguePositionFragment>
            positions={positions}
            teamPlayers={teamPlayers}
            onPlayerAssign={onPlayerAssign}
            onPlayerRemove={onPlayerRemove}
            onPlayerSwap={onPlayerSwap}
            onPlayerPress={onPlayerPress}
            loading={loading}
            // Only a finalized past week is locked — future weeks are
            // editable so managers can set lineups ahead of time (LS-9768).
            readOnly={isViewingOther || isPast}
            salaryCapEnabled={!!salaryCapEnabled}
            sport={sport}
            currentWeek={sport === 'football' ? activeWeek : undefined}
            byeWeeksByTeam={byeWeeksByTeam}
          />
        </YStack>
      </ScrollView>

      {isCurrent && (
        <RosterActionBar
          onQuickSwap={() => scrollRef.current?.scrollToEnd({ animated: true })}
        />
      )}
    </YStack>
  );
}
