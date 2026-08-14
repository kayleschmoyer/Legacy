/**
 * DraftRosterSlotRow — one roster-slot row (slot badge + player/"Empty" +
 * projected points) for the Draft Room v2 Team tab (LS-9400) — README
 * "Team tab". Exported standalone (not inlined into the Team tab) so the
 * draft-complete recap (LS-9402) can reuse it verbatim to render the final
 * roster list.
 */
import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import type { DraftPickRecord, DraftPlayer } from './types';
import { PositionBadge } from '../../components/PositionBadge';
import {
  getPositionColor,
  lightenForContrast,
  SURFACE_CARD,
  withAlpha,
} from '../../utils/colors';
import type { Sport } from '../../utils/colors';

/** README slot-label abbreviation — the synthetic overflow bucket displays as "BN". */
function slotLabel(positionType: string): string {
  return positionType === 'BENCH' ? 'BN' : positionType;
}

export interface DraftRosterSlotRowProps {
  /** League-configured slot type this row represents, e.g. "QB", "RB", "FLEX", "BENCH". */
  slotPositionType: string;
  sport: Sport;
  /** Player occupying this slot, or `null` for an open slot ("Empty"). */
  player: DraftPlayer | null;
  /** The pick that filled this slot, for the "Pick r.p" meta segment. */
  pick?: DraftPickRecord | null;
  /** Real-world team abbreviation, when available. */
  teamAbbr?: string | null;
  /** Bye week, when available. */
  byeWeek?: number | null;
}

export function DraftRosterSlotRow({
  slotPositionType,
  sport,
  player,
  pick,
  teamAbbr,
  byeWeek,
}: DraftRosterSlotRowProps): React.JSX.Element {
  const positionColor = getPositionColor(sport, slotPositionType);
  const badgeLabelColor = lightenForContrast(positionColor, SURFACE_CARD);

  const metaParts: string[] = [];
  if (player) {
    metaParts.push(player.position);
    if (teamAbbr) metaParts.push(teamAbbr);
    if (byeWeek != null) metaParts.push(`Bye ${byeWeek}`);
    if (pick) metaParts.push(`Pick ${pick.round}.${pick.pickNumber}`);
  }

  return (
    <XStack
      testID="draft-roster-slot-row"
      alignItems="center"
      gap={11}
      borderBottomWidth={1}
      borderBottomColor="$outlineSubtle"
      paddingVertical={10}
      paddingHorizontal={4}
    >
      <PositionBadge
        position={slotLabel(slotPositionType)}
        backgroundColor={withAlpha(positionColor, 0.18)}
        textColor={badgeLabelColor}
        width={44}
        height={44}
        borderRadius={8}
        fontSize={11}
        fontWeight="800"
      />
      <YStack flex={1} minWidth={0}>
        {player ? (
          <>
            <Text
              fontSize={14.5}
              fontWeight="600"
              color="$color"
              numberOfLines={1}
            >
              {player.name}
            </Text>
            <Text fontSize={10.5} color="$fg3" numberOfLines={1} marginTop={2}>
              {metaParts.join(' · ')}
            </Text>
          </>
        ) : (
          <Text fontSize={14.5} fontStyle="italic" color="$fg4">
            Empty
          </Text>
        )}
      </YStack>
      {player && player.ppg != null && (
        <Text
          fontFamily="$heading"
          fontSize={16}
          fontWeight="700"
          color="$brandGold"
        >
          {player.ppg.toFixed(1)}
        </Text>
      )}
    </XStack>
  );
}

export default DraftRosterSlotRow;
