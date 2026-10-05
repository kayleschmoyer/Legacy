/**
 * DraftOpenSlotsBanner — names the server's open-roster-slot filter on the
 * available-player list and lets the viewer lift it (LS-10593).
 *
 * The board has always been narrowed to positions that still fill one of the
 * viewer's open roster slots (LS-8065), but nothing said so: users who had
 * filled part of their roster just saw players "missing". Shared by the phone
 * players tab and the desktop player board.
 */
import React from 'react';
import { Text, XStack } from 'tamagui';
import { handleKeyActivate } from '../../utils/keyboardActivation';

export interface DraftOpenSlotsBannerProps {
  /** Open-slot positions the server applied; empty = no filter in effect. */
  openSlotPositions: readonly string[];
  showAllPositions: boolean;
  onToggleShowAll: (showAll: boolean) => void;
}

export function DraftOpenSlotsBanner({
  openSlotPositions,
  showAllPositions,
  onToggleShowAll,
}: DraftOpenSlotsBannerProps): React.JSX.Element | null {
  // No filter to explain (nothing filled yet, or roster complete) and the
  // viewer hasn't opted into "all" — stay out of the way.
  if (!showAllPositions && openSlotPositions.length === 0) return null;

  const message = showAllPositions
    ? 'Showing all positions'
    : `Showing open roster spots: ${openSlotPositions.join(', ')}`;
  const actionLabel = showAllPositions ? 'Open spots only' : 'Show all';
  const toggle = (): void => onToggleShowAll(!showAllPositions);

  return (
    <XStack
      testID="draft-open-slots-banner"
      alignItems="center"
      justifyContent="space-between"
      gap="$2"
      paddingHorizontal={12}
      paddingVertical={6}
      borderRadius={8}
      borderWidth={1}
      borderColor="$surfacePanelBorder"
      backgroundColor="$surfacePanel"
    >
      <Text flex={1} fontSize={12} color="$textMuted" numberOfLines={2}>
        {message}
      </Text>
      <XStack
        testID="draft-open-slots-toggle"
        minHeight={32}
        paddingHorizontal={8}
        alignItems="center"
        onPress={toggle}
        pressStyle={{ opacity: 0.7 }}
        cursor="pointer"
        role="button"
        accessibilityRole="button"
        tabIndex={0}
        onKeyDown={handleKeyActivate(toggle)}
        aria-label={actionLabel}
        accessibilityLabel={actionLabel}
      >
        <Text fontSize={12} fontWeight="700" color="$brandGoldLight">
          {actionLabel}
        </Text>
      </XStack>
    </XStack>
  );
}
