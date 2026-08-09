import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { PositionBadge } from '../../../components/PositionBadge';
import {
  BG_DARK,
  getPositionColor,
  lightenForContrast,
  STATS_BORDER,
  SURFACE_PANEL,
  TEXT_HIGH_CONTRAST,
  TEXT_MUTED,
  TEXT_TERTIARY,
  WHITE,
  withAlpha,
} from '../../../utils/colors';
import type { Sport } from '../../../utils/colors';
import { FONT_BODY, FONT_DISPLAY, FONT_MONO } from '../shell/tokens';

export interface PlayerFeedCardProps {
  sport: Sport;
  /** Position abbreviation for the tile + sub-stat category selection (e.g. "OF", "QB"). */
  position: string;
  name: string;
  /** Pre-formatted sub-stat line, e.g. "HR 762 · RBI 1,996 · AVG .298" or "BUF · YDS 4,587 · TD 42". */
  subStats: string;
  /** Pre-formatted career fantasy points, e.g. "14,208". */
  fpts: string;
  onPress: () => void;
  testID?: string;
}

/**
 * FPTS-first player row for the Players card feed (LS-8832, design handoff
 * option 1c). The position tile reuses {@link PositionBadge} (per the
 * handoff's "reuse PositionBadge where it fits") rather than a bespoke tile —
 * its `width`/`height` overrides (added for this ticket) make the badge's
 * chip variant render as the spec's fixed 38×38 rounded square.
 */
export function PlayerFeedCard({
  sport,
  position,
  name,
  subStats,
  fpts,
  onPress,
  testID = 'player-feed-card',
}: PlayerFeedCardProps) {
  const positionColor = getPositionColor(sport, position);
  const labelColor = lightenForContrast(positionColor, BG_DARK);

  return (
    <XStack
      testID={testID}
      backgroundColor={SURFACE_PANEL}
      borderWidth={1}
      borderColor={STATS_BORDER}
      borderRadius={12}
      padding={12}
      gap={12}
      alignItems="center"
      minHeight={44}
      onPress={onPress}
      pressStyle={{ opacity: 0.85 }}
      accessibilityRole="button"
      accessibilityLabel={`View details for ${name}`}
    >
      <PositionBadge
        position={position}
        color={positionColor}
        backgroundColor={withAlpha(WHITE, 0.05)}
        textColor={labelColor}
        showBorder
        borderAlpha={1}
        width={38}
        height={38}
        borderRadius={9}
        fontSize={11}
        fontWeight="800"
        fontFamily={FONT_DISPLAY}
        letterSpacing={0.8}
      />

      <YStack flex={1} minWidth={0}>
        <Text
          fontFamily={FONT_BODY}
          fontWeight="600"
          fontSize={15}
          color={TEXT_HIGH_CONTRAST}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {name}
        </Text>
        <Text
          fontFamily={FONT_MONO}
          fontSize={11.5}
          color={TEXT_MUTED}
          marginTop={2}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {subStats}
        </Text>
      </YStack>

      <YStack alignItems="flex-end" gap={2}>
        <Text
          fontFamily={FONT_MONO}
          fontWeight="700"
          fontSize={16}
          color={TEXT_HIGH_CONTRAST}
        >
          {fpts}
        </Text>
        <Text fontFamily={FONT_MONO} fontSize={11} color={TEXT_TERTIARY}>
          FPTS
        </Text>
      </YStack>
    </XStack>
  );
}

export default PlayerFeedCard;
