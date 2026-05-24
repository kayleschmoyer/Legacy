import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  getPositionColor,
} from '../utils/colors';
import { TABULAR_NUMS } from '../utils/typography';

export interface PlayerCardProps {
  /** Player's full name — first two initials appear in the avatar. */
  name: string;
  /**
   * Position abbreviation (P / C / 1B / 2B / 3B / SS / OF).
   * Drives the left-edge accent color and the position chip background.
   */
  position: string;
  /**
   * Subtitle line — year, team abbreviation, key stats.
   * e.g. "1998 · ARI · 329 K · 2.48 ERA"
   */
  meta?: string;
  /**
   * Primary fantasy stat shown on the right.
   * Numbers are formatted to one decimal place.
   */
  stat: number | string;
  onPress?: () => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Design-system player row card. Left-edge accent encodes position group;
 * avatar shows name initials with a gold border; right side displays the
 * primary fantasy stat with tabular figures.
 *
 * Exported from the package index as `DSPlayerCard` to avoid collision with
 * the legacy `PlayerCard` in features/players.
 */
export function PlayerCard({
  name,
  position,
  meta,
  stat,
  onPress,
}: PlayerCardProps): React.JSX.Element {
  const positionColor = getPositionColor('baseball', position);
  const initials = getInitials(name);
  const statLabel = typeof stat === 'number' ? stat.toFixed(1) : stat;

  return (
    <XStack
      borderRadius={16}
      borderLeftWidth={4}
      borderLeftColor={positionColor}
      backgroundColor="$surfaceCard"
      paddingHorizontal={16}
      paddingVertical={14}
      alignItems="center"
      justifyContent="space-between"
      width="100%"
      shadowColor="rgba(8, 12, 20, 0.45)"
      shadowOffset={{ width: 0, height: 2 }}
      shadowRadius={10}
      onPress={onPress}
      cursor={onPress ? 'pointer' : undefined}
      hoverStyle={onPress ? { y: -1 } : undefined}
      pressStyle={onPress ? { scale: 0.98 } : undefined}
      animation="medium"
      role={onPress ? 'button' : undefined}
      tabIndex={onPress ? 0 : undefined}
      onKeyDown={
        onPress
          ? (e: React.KeyboardEvent<HTMLElement>) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.currentTarget.click();
              }
            }
          : undefined
      }
    >
      {/* Left section: avatar + name/meta */}
      <XStack alignItems="center" gap={14} flex={1} minWidth={0}>
        {/* Avatar circle */}
        <XStack
          width={44}
          height={44}
          borderRadius={9999}
          borderWidth={2}
          borderColor={BRAND_GOLD}
          alignItems="center"
          justifyContent="center"
          backgroundColor="$brandNavy"
          flexShrink={0}
        >
          <Text
            fontFamily="$heading"
            fontWeight="800"
            fontSize={15}
            color={BRAND_GOLD_LIGHT}
          >
            {initials}
          </Text>
        </XStack>

        {/* Name + sub line */}
        <YStack gap={2} flex={1} minWidth={0}>
          <XStack alignItems="center" gap={6}>
            {/* Position chip */}
            <XStack
              paddingHorizontal={8}
              paddingVertical={3}
              borderRadius={4}
              backgroundColor={positionColor}
              flexShrink={0}
            >
              <Text
                fontFamily="$heading"
                fontWeight="700"
                fontSize={10}
                letterSpacing={0.8}
                color="#FFFFFF"
              >
                {position}
              </Text>
            </XStack>
            <Text
              fontFamily="$body"
              fontWeight="600"
              fontSize={15}
              color="$color12"
              numberOfLines={1}
              flex={1}
            >
              {name}
            </Text>
          </XStack>
          {meta ? (
            <Text fontFamily="$mono" fontSize={11} color="$textMuted">
              {meta}
            </Text>
          ) : null}
        </YStack>
      </XStack>

      {/* Primary fantasy stat */}
      <Text
        fontFamily="$heading"
        fontWeight="800"
        fontSize={22}
        color="$color12"
        marginLeft={12}
        flexShrink={0}
        {...TABULAR_NUMS}
      >
        {statLabel}
      </Text>
    </XStack>
  );
}
