import React, { useState } from 'react';
import { ScrollView, YStack } from 'tamagui';
import {
  PendingTradeOffers,
  PendingWaiverClaims,
  RosterBoard,
  RosterStatusBanners,
  RosterWeekNavigation,
} from '@legacy-sports/shared-components/roster';
import {
  AppTeamMemberFragment,
  LeaguePositionFragment,
} from '../../api/db/graphql.generated';

export interface LeagueRosterManagementProps {
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
}

/**
 * LeagueRosterManagement — native roster tab.
 *
 * Wraps the cross-platform shared `RosterBoard` with `RosterWeekNavigation`,
 * `RosterStatusBanners`, and the pending trade-offer / waiver-claim banners,
 * reaching parity with the canonical web league-detail v2 roster tab (LS-7813).
 * Past weeks are read-only; the board's mutations are gated on `!isPast`.
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
}: LeagueRosterManagementProps): React.JSX.Element {
  const effectiveCurrent = currentWeek ?? 1;
  const effectiveTotal = totalWeeks ?? effectiveCurrent;
  // `week === null` tracks the live week until the user navigates, so the view
  // follows `currentWeek` once the league query resolves without an effect.
  const [week, setWeek] = useState<number | null>(null);
  const activeWeek = week ?? effectiveCurrent;

  const isPast = activeWeek < effectiveCurrent;
  const isFuture = activeWeek > effectiveCurrent;
  const isCurrent = activeWeek === effectiveCurrent;
  const showWeekNav = currentWeek != null && effectiveTotal > 1;

  return (
    <ScrollView>
      <YStack padding="$4" gap="$4">
        {showWeekNav && (
          <RosterWeekNavigation
            week={activeWeek}
            currentWeek={effectiveCurrent}
            totalWeeks={effectiveTotal}
            onWeekChange={setWeek}
            onResetToCurrent={() => setWeek(effectiveCurrent)}
          />
        )}

        <RosterStatusBanners isPast={isPast} isFuture={isFuture} />

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
          readOnly={isPast}
        />
      </YStack>
    </ScrollView>
  );
}
