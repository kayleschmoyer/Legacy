/**
 * DraftRoomRecap — the Draft Room v2 draft-complete recap (LS-9402) README
 * "Draft-complete recap". Replaces the compact-branch room once the draft is
 * done: DRAFT GRADE / PROJ PTS / ADP VALUE stat cards, a "BEST VALUE"
 * callout, and the full roster list — reusing LS-9400's
 * {@link DraftRosterSlotRow} verbatim (not a reimplementation) via the same
 * bucket-fill logic DraftTeamTab already uses.
 *
 * LS-10528: the recap is the only completion screen at phone/tablet widths
 * and on native, so it carries the same next steps as the wide
 * DraftCompleteView — a sticky CTA bar (Practice Again / My Leagues, or Set
 * My Lineup / Back to League) and a team selector for reviewing every other
 * team's roster — without changing the LS-9402 recap styling.
 */
import React, { useMemo, useState } from 'react';
import { Button, ScrollView, Text, XStack, YStack } from 'tamagui';
import { buildDepthChartBuckets } from './DraftPlayerBoard';
import { DraftPacketSection } from './DraftPacketSection';
import { DraftRosterSlotRow } from './DraftRosterSlotRow';
import {
  getDraftCompletionActions,
  resolveDraftedPlayers,
} from './draftCompletion';
import { useDraftPalette } from './nativeDraftPalette';
import type { DraftPickRecord, DraftPlayer, LeagueTeam } from './types';
import { withAlpha } from '../../utils/colors';
import type { SportKind } from '../../config/sports';

export interface DraftRoomRecapProps {
  pickHistory: DraftPickRecord[];
  /** My team's picks, in draft order — index-aligned with `myTeam`. */
  myTeamPicks: DraftPickRecord[];
  /** My team's drafted players — index-aligned with `myTeamPicks`. */
  myTeam: DraftPlayer[];
  statsLookup: Map<number, DraftPlayer>;
  leaguePositions: ReadonlyArray<{ positionType: string }>;
  sport: SportKind;
  maxRosterSize: number | null;
  /** Whether the viewer has the `draft_packet` entitlement (LS-9750). */
  isPremium: boolean;
  onUpgrade?: () => void;
  teamNameById: (teamId: number | null | undefined) => string;
  leagueName?: string | null;
  onDownloadPacket?: (contents: string, filename: string) => void;
  /** Mock drafts offer Practice Again; league drafts offer the league. */
  isMock: boolean;
  leagueId: number | null;
  myTeamId: number | null;
  /** Every team in the draft — drives the roster team selector. */
  leagueTeams: LeagueTeam[];
  onNavigate: (path: string) => void;
}

interface PickValue {
  pick: DraftPickRecord;
  player: DraftPlayer;
  /** overallPick - adpRank; positive means the player fell further than expected (good value). */
  value: number;
}

/**
 * No ADP field exists on `DraftPlayer` (see DraftPlayersTab.tsx) — proxy
 * each drafted player's expected pick position with their 1-based rank by
 * projected points among every player drafted this draft, mirroring the
 * same "no real ADP" proxy already established elsewhere in this feature.
 */
function buildAdpRanks(
  pickHistory: DraftPickRecord[],
  statsLookup: Map<number, DraftPlayer>,
): Map<number, number> {
  const ranked = pickHistory
    .map((pick) => ({
      playerId: pick.playerId,
      ppg: statsLookup.get(pick.playerId)?.ppg ?? 0,
    }))
    .sort((a, b) => b.ppg - a.ppg);
  const ranks = new Map<number, number>();
  ranked.forEach((entry, index) => {
    if (!ranks.has(entry.playerId)) ranks.set(entry.playerId, index + 1);
  });
  return ranks;
}

/** Coarse letter grade from the average per-pick ADP value — the "prototype"
 *  heuristic the README calls for (sum of overall − ADP), bucketed since the
 *  underlying ADP is itself only a same-draft proxy, not real precision. */
function gradeFor(totalValue: number, pickCount: number): string {
  if (pickCount === 0) return '—';
  const avg = totalValue / pickCount;
  if (avg >= 15) return 'A+';
  if (avg >= 8) return 'A';
  if (avg >= 3) return 'B+';
  if (avg >= -2) return 'B';
  if (avg >= -8) return 'C';
  return 'D';
}

interface StatCardProps {
  label: string;
  value: string;
  color: string;
}

function StatCard({ label, value, color }: StatCardProps): React.JSX.Element {
  return (
    <YStack
      flex={1}
      backgroundColor="$surfaceCard"
      borderRadius={14}
      paddingVertical={12}
      paddingHorizontal={8}
      alignItems="center"
      gap={4}
    >
      <Text
        fontSize={9}
        fontWeight="700"
        letterSpacing={1.2}
        textTransform="uppercase"
        color="$fg4"
        textAlign="center"
      >
        {label}
      </Text>
      <Text fontFamily="$heading" fontSize={20} fontWeight="800" color={color}>
        {value}
      </Text>
    </YStack>
  );
}

export function DraftRoomRecap({
  pickHistory,
  myTeamPicks,
  myTeam,
  statsLookup,
  leaguePositions,
  sport,
  maxRosterSize,
  isPremium,
  onUpgrade,
  teamNameById,
  leagueName,
  onDownloadPacket,
  isMock,
  leagueId,
  myTeamId,
  leagueTeams,
  onNavigate,
}: DraftRoomRecapProps): React.JSX.Element {
  const palette = useDraftPalette();
  const myTeamKey = myTeamId == null ? null : String(myTeamId);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    myTeamKey,
  );
  const isViewingOwnTeam =
    selectedTeamId == null || selectedTeamId === myTeamKey;

  // The roster list, grade cards and BEST VALUE callout all follow the team
  // selector, so any team's roster and draft grade can be reviewed.
  const rosterPicks = useMemo(
    () =>
      isViewingOwnTeam
        ? myTeamPicks
        : pickHistory.filter((p) => String(p.teamId) === selectedTeamId),
    [isViewingOwnTeam, myTeamPicks, pickHistory, selectedTeamId],
  );
  const rosterPlayers = useMemo(
    () =>
      isViewingOwnTeam
        ? myTeam
        : resolveDraftedPlayers(rosterPicks, statsLookup),
    [isViewingOwnTeam, myTeam, rosterPicks, statsLookup],
  );

  const pickValues = useMemo<PickValue[]>(() => {
    const adpRanks = buildAdpRanks(pickHistory, statsLookup);
    return rosterPicks.map((pick, i) => {
      const rank = adpRanks.get(pick.playerId) ?? pick.overallPick;
      return { pick, player: rosterPlayers[i], value: pick.overallPick - rank };
    });
  }, [pickHistory, rosterPicks, rosterPlayers, statsLookup]);

  const totalValue = useMemo(
    () => pickValues.reduce((sum, v) => sum + v.value, 0),
    [pickValues],
  );
  const projPtsTotal = useMemo(
    () => rosterPlayers.reduce((sum, p) => sum + (p.ppg ?? 0), 0),
    [rosterPlayers],
  );
  const bestValue = useMemo(
    () =>
      pickValues.reduce<PickValue | null>(
        (best, v) => (best == null || v.value > best.value ? v : best),
        null,
      ),
    [pickValues],
  );
  const grade = gradeFor(totalValue, rosterPicks.length);

  const pickByPlayerId = useMemo(() => {
    const map = new Map<number, DraftPickRecord>();
    rosterPicks.forEach((pick) => map.set(pick.playerId, pick));
    return map;
  }, [rosterPicks]);

  const buckets = useMemo(
    () =>
      buildDepthChartBuckets(
        leaguePositions,
        rosterPlayers,
        sport,
        maxRosterSize,
      ),
    [leaguePositions, rosterPlayers, sport, maxRosterSize],
  );

  const actions = getDraftCompletionActions({ sport, isMock, leagueId });

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
    <YStack testID="draft-room-recap" flex={1} backgroundColor="$background">
      <ScrollView showsVerticalScrollIndicator={false}>
        <YStack
          alignItems="center"
          paddingTop={28}
          paddingBottom={16}
          paddingHorizontal="$4"
        >
          <Text
            fontSize={9.5}
            fontWeight="700"
            letterSpacing={2}
            textTransform="uppercase"
            color="$fg4"
          >
            {`LEGACY SPORTS · ${new Date().getFullYear()}`}
          </Text>
          <Text
            fontFamily="$heading"
            fontSize={38}
            fontWeight="800"
            color="$color"
            marginTop={4}
            textAlign="center"
          >
            DRAFT COMPLETE
          </Text>
          <Text fontSize={12.5} color="$fg3" marginTop={4} textAlign="center">
            {`All ${pickHistory.length} picks are in — your final roster is set.`}
          </Text>
        </YStack>

        <XStack gap={10} paddingHorizontal="$4" marginBottom={14}>
          <StatCard label="Draft Grade" value={grade} color="$brandGold" />
          <StatCard
            label="Proj Pts"
            value={projPtsTotal.toFixed(1)}
            color="$color"
          />
          <StatCard
            label="ADP Value"
            value={`${totalValue >= 0 ? '+' : ''}${totalValue}`}
            color="$statusSuccessFg"
          />
        </XStack>

        {bestValue?.player && (
          <XStack
            testID="draft-recap-best-value"
            marginHorizontal="$4"
            marginBottom={16}
            backgroundColor={withAlpha(palette.gold.gold, 0.08)}
            borderWidth={1}
            borderColor={withAlpha(palette.gold.gold, 0.4)}
            borderRadius={14}
            padding={12}
            alignItems="center"
            gap={10}
          >
            <Text
              fontSize={9}
              fontWeight="800"
              letterSpacing={1.2}
              textTransform="uppercase"
              color="$brandGoldLight"
            >
              Best Value
            </Text>
            <Text
              fontSize={13}
              fontWeight="600"
              color="$color"
              flex={1}
              numberOfLines={1}
            >
              {bestValue.player.name}
            </Text>
            <Text
              fontFamily="$heading"
              fontSize={14}
              fontWeight="800"
              color="$statusSuccessFg"
            >
              {`+${bestValue.value}`}
            </Text>
          </XStack>
        )}

        {leagueTeams.length > 1 && (
          <YStack testID="draft-recap-team-selector" marginBottom={10}>
            <Text
              fontSize={9}
              fontWeight="700"
              letterSpacing={1.2}
              textTransform="uppercase"
              color="$fg4"
              paddingHorizontal="$4"
              marginBottom={6}
            >
              Rosters
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <XStack gap={6} paddingHorizontal="$4">
                {leagueTeams.map((team) => {
                  const teamKey = String(team.id);
                  const isActive = isViewingOwnTeam
                    ? teamKey === myTeamKey
                    : teamKey === selectedTeamId;
                  return (
                    <Button
                      key={team.id}
                      testID={`draft-recap-team-${teamKey}`}
                      aria-pressed={isActive}
                      onPress={() => setSelectedTeamId(teamKey)}
                      size="$2"
                      borderRadius={999}
                      borderWidth={1}
                      borderColor={isActive ? '$brandGold' : '$outlineDefault'}
                      backgroundColor={
                        isActive
                          ? withAlpha(palette.gold.gold, 0.15)
                          : '$surfaceCard'
                      }
                      color={isActive ? '$brandGoldLight' : '$fg3'}
                      fontWeight={isActive ? '700' : '500'}
                    >
                      {`${team.name}${teamKey === myTeamKey ? ' (You)' : ''}`}
                    </Button>
                  );
                })}
              </XStack>
            </ScrollView>
          </YStack>
        )}

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
        </YStack>

        <DraftPacketSection
          pickHistory={pickHistory}
          teamNameById={teamNameById}
          leagueName={leagueName}
          isPremium={isPremium}
          onUpgrade={onUpgrade}
          onDownload={onDownloadPacket}
        />
      </ScrollView>

      {/* Sticky so the next steps stay reachable however long the roster
          is (LS-10528) — mirrors DraftCompleteView's CTAs. */}
      <XStack
        testID="draft-recap-actions"
        gap={10}
        paddingHorizontal="$4"
        paddingVertical="$3"
        borderTopWidth={1}
        borderTopColor="$outlineDefault"
        backgroundColor="$background"
      >
        {actions.map((action) => (
          <Button
            key={action.key}
            testID={`draft-recap-cta-${action.key}`}
            flex={1}
            onPress={() => onNavigate(action.path)}
            backgroundColor={action.primary ? '$brandGold' : '$surfaceCard'}
            color={action.primary ? '$textOnAccent' : '$color'}
            fontWeight="700"
            borderRadius={12}
            pressStyle={{ scale: 0.98 }}
          >
            {action.label}
          </Button>
        ))}
      </XStack>
    </YStack>
  );
}

export default DraftRoomRecap;
