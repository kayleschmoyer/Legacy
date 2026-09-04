/**
 * DraftTeamTab — Draft Room v2 (LS-9400) README "Team tab": team-switcher
 * chips ("MY TEAM" + other teams' initials) plus the league's configured
 * roster slots, each rendered via the standalone {@link DraftRosterSlotRow}
 * so the recap child (LS-9402) can reuse the same row.
 *
 * Slot assignment reuses `buildDepthChartBuckets` (DraftPlayerBoard.tsx) —
 * the same narrowest-eligibility-first fill algorithm the spectator depth
 * chart already relies on — expanded from aggregated counts into one row per
 * slot instance, in league-configured order, with a synthetic BENCH row for
 * any drafted players beyond the starter slots.
 */
import React, { useMemo } from 'react';
import { ScrollView, Text, XStack, YStack } from 'tamagui';
import { buildDepthChartBuckets } from './DraftPlayerBoard';
import { DraftRosterSlotRow } from './DraftRosterSlotRow';
import { initialsOf } from './nativeDraftBoard';
import { useDraftPalette } from './nativeDraftPalette';
import type { DraftPickRecord, DraftPlayer, LeagueTeam } from './types';
import { withAlpha } from '../../utils/colors';
import type { SportKind } from '../../config/sports';

function unknownPlayer(pick: DraftPickRecord): DraftPlayer {
  return {
    id: pick.playerId,
    name: pick.player
      ? `${pick.player.firstName} ${pick.player.lastName}`.trim()
      : `Player #${pick.playerId}`,
    position: pick.player?.eligiblePositions?.[0] ?? 'UTIL',
    avg: 0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    games: 0,
    hits: 0,
    obp: 0,
    slg: 0,
  };
}

export interface DraftTeamTabProps {
  teams: LeagueTeam[];
  myTeamId: number | null;
  /** `null` means "my team" — the default selection. */
  selectedTeamId: number | null;
  onSelectTeam: (teamId: number | null) => void;
  pickHistory: DraftPickRecord[];
  statsLookup: Map<number, DraftPlayer>;
  leaguePositions: ReadonlyArray<{ positionType: string }>;
  sport: SportKind;
  maxRosterSize: number | null;
  /**
   * Rendered below the roster slots, inside the same scroll container
   * (LS-9857: the compact branch's home for the Draft Details panel, which
   * the wide branch shows in the rail).
   */
  footer?: React.ReactNode;
}

export function DraftTeamTab({
  teams,
  myTeamId,
  selectedTeamId,
  onSelectTeam,
  pickHistory,
  statsLookup,
  leaguePositions,
  sport,
  maxRosterSize,
  footer = null,
}: DraftTeamTabProps): React.JSX.Element {
  const palette = useDraftPalette();
  const viewedTeamId = selectedTeamId ?? myTeamId;
  const isMineActive = selectedTeamId == null;

  const { players, pickByPlayerId } = useMemo(() => {
    const picks = pickHistory.filter(
      (p) => viewedTeamId != null && p.teamId === viewedTeamId,
    );
    const byPlayerId = new Map<number, DraftPickRecord>();
    const list = picks.map((pick) => {
      byPlayerId.set(pick.playerId, pick);
      return statsLookup.get(pick.playerId) ?? unknownPlayer(pick);
    });
    return { players: list, pickByPlayerId: byPlayerId };
  }, [pickHistory, viewedTeamId, statsLookup]);

  const buckets = useMemo(
    () =>
      buildDepthChartBuckets(leaguePositions, players, sport, maxRosterSize),
    [leaguePositions, players, sport, maxRosterSize],
  );

  const slotRows = useMemo(
    () =>
      buckets.flatMap((bucket) =>
        Array.from({ length: bucket.total }, (_, i) => {
          const player = bucket.players[i] ?? null;
          return {
            key: `${bucket.positionType}-${i}`,
            positionType: bucket.positionType,
            player,
            pick: player ? (pickByPlayerId.get(player.id) ?? null) : null,
          };
        }),
      ),
    [buckets, pickByPlayerId],
  );

  return (
    <YStack flex={1} testID="draft-team-tab">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        flexGrow={0}
        flexShrink={0}
      >
        <XStack gap={6} paddingHorizontal="$3" paddingVertical={9}>
          <XStack
            key="my-team"
            role="button"
            accessibilityRole="button"
            tabIndex={0}
            aria-label="My team"
            accessibilityLabel="My team"
            accessibilityState={{ selected: isMineActive }}
            onPress={() => onSelectTeam(null)}
            paddingVertical={6}
            paddingHorizontal={12}
            borderRadius={999}
            borderWidth={1}
            borderColor={
              isMineActive ? palette.gold.gold : palette.surface.outlineDefault
            }
            backgroundColor={
              isMineActive ? withAlpha(palette.gold.gold, 0.15) : 'transparent'
            }
          >
            <Text
              fontSize={11.5}
              fontWeight="700"
              color={isMineActive ? palette.gold.goldLight : palette.text.fg3}
            >
              MY TEAM
            </Text>
          </XStack>
          {teams
            .filter(
              (t) => myTeamId == null || String(t.id) !== String(myTeamId),
            )
            .map((team) => {
              const active =
                selectedTeamId != null &&
                String(selectedTeamId) === String(team.id);
              return (
                <XStack
                  key={team.id}
                  role="button"
                  accessibilityRole="button"
                  tabIndex={0}
                  aria-label={team.name}
                  accessibilityLabel={team.name}
                  accessibilityState={{ selected: active }}
                  onPress={() => onSelectTeam(Number(team.id))}
                  paddingVertical={6}
                  paddingHorizontal={12}
                  borderRadius={999}
                  borderWidth={1}
                  borderColor={
                    active ? palette.gold.gold : palette.surface.outlineDefault
                  }
                  backgroundColor={
                    active ? withAlpha(palette.gold.gold, 0.15) : 'transparent'
                  }
                >
                  <Text
                    fontSize={11.5}
                    fontWeight="700"
                    color={active ? palette.gold.goldLight : palette.text.fg3}
                  >
                    {initialsOf(team.name)}
                  </Text>
                </XStack>
              );
            })}
        </XStack>
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false}>
        <YStack paddingHorizontal="$3" paddingBottom="$4">
          {slotRows.map((row) => (
            <DraftRosterSlotRow
              key={row.key}
              slotPositionType={row.positionType}
              sport={sport}
              player={row.player}
              pick={row.pick}
            />
          ))}
          {footer}
        </YStack>
      </ScrollView>
    </YStack>
  );
}

export default DraftTeamTab;
