/**
 * DraftPickHistoryList — the phone pick sheet's History tab (LS-10165),
 * design `.mob-history` in `DraftRoomMobile.html`. Newest pick first, the
 * viewer's own picks in gold — the same reading as the desktop rail's Pick
 * History panel, which shares the name/label helpers below.
 */
import React, { useMemo } from 'react';
import { ScrollView, Text, XStack, YStack } from 'tamagui';

import type { DraftPickRecord, DraftPlayer } from './types';
import { BRAND_GOLD, withAlpha } from '../../utils/colors';

/** Display name for a pick, preferring the stats row, then the pick's own
 *  player record, then a placeholder. */
export function pickPlayerName(
  pick: DraftPickRecord,
  statsLookup: Map<number, DraftPlayer>,
): string {
  const stat = statsLookup.get(pick.playerId);
  if (stat) return stat.name;
  if (pick.player) return `${pick.player.firstName} ${pick.player.lastName}`;
  return `Player #${pick.playerId}`;
}

/** "3.07" — round, then the zero-padded pick within the round. */
export function pickRoundLabel(pick: DraftPickRecord): string {
  return `${pick.round}.${pick.pickNumber.toString().padStart(2, '0')}`;
}

export interface DraftPickHistoryListProps {
  picks: readonly DraftPickRecord[];
  statsLookup: Map<number, DraftPlayer>;
  myTeamId: number | null;
  teamNameById: (teamId: number | null) => string | null;
}

export function DraftPickHistoryList({
  picks,
  statsLookup,
  myTeamId,
  teamNameById,
}: DraftPickHistoryListProps): React.JSX.Element {
  const newestFirst = useMemo(
    () => [...picks].sort((a, b) => b.overallPick - a.overallPick),
    [picks],
  );

  if (newestFirst.length === 0) {
    return (
      <YStack
        testID="draft-pick-history"
        flex={1}
        alignItems="center"
        justifyContent="center"
        padding="$6"
      >
        <Text color="$fg4" textAlign="center">
          No picks yet.
        </Text>
      </YStack>
    );
  }

  return (
    <ScrollView
      testID="draft-pick-history"
      flex={1}
      role="list"
      aria-label="Draft pick history"
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}
    >
      <YStack gap={6}>
        {newestFirst.map((pick) => {
          const isMine = myTeamId != null && pick.teamId === myTeamId;
          const position =
            statsLookup.get(pick.playerId)?.position ??
            pick.player?.eligiblePositions?.[0] ??
            '—';
          return (
            <XStack
              key={pick.id}
              testID={`draft-pick-history-row-${pick.overallPick}`}
              role="listitem"
              alignItems="center"
              gap={10}
              minHeight={44}
              paddingHorizontal={12}
              paddingVertical={8}
              borderRadius={10}
              borderWidth={1}
              borderColor={
                isMine ? withAlpha(BRAND_GOLD, 0.4) : '$surfacePanelBorder'
              }
              backgroundColor="$surfacePanel"
            >
              <Text
                width={34}
                fontFamily="$heading"
                fontSize={12}
                fontWeight="800"
                color="$fg4"
              >
                {pickRoundLabel(pick)}
              </Text>
              <YStack flex={1} minWidth={0}>
                <Text
                  fontFamily="$heading"
                  fontSize={15}
                  fontWeight="700"
                  numberOfLines={1}
                  color={isMine ? '$brandGold' : '$color'}
                >
                  {pickPlayerName(pick, statsLookup)}
                </Text>
                <Text fontSize={11} color="$fg3" numberOfLines={1}>
                  {`${position} · ${teamNameById(pick.teamId) ?? ''}`}
                </Text>
              </YStack>
              <Text fontSize={10} color="$fg4" flexShrink={0}>
                #{pick.overallPick}
              </Text>
            </XStack>
          );
        })}
      </YStack>
    </ScrollView>
  );
}

export default DraftPickHistoryList;
