import React from 'react';
import { Text, XStack } from 'tamagui';
import {
  BRAND_GOLD_LIGHT,
  STATS_BORDER,
  SURFACE_PANEL,
  TEXT_HIGH_CONTRAST,
} from '../../../utils/colors';
import { FONT_DISPLAY } from '../shell/tokens';

export interface LoadMoreButtonProps {
  onPress: () => void;
  testID?: string;
}

/**
 * Footer "Load more" control for `PlayersCardFeed` (LS-10682) — an explicit,
 * keyboard-operable way to fetch the next page alongside scroll-driven
 * `onEndReached`.
 */
export function LoadMoreButton({ onPress, testID }: LoadMoreButtonProps) {
  return (
    <XStack
      testID={testID}
      marginTop={8}
      alignSelf="center"
      justifyContent="center"
      alignItems="center"
      minHeight={44}
      paddingHorizontal={22}
      borderRadius={9999}
      borderWidth={1}
      borderColor={STATS_BORDER}
      backgroundColor={SURFACE_PANEL}
      onPress={onPress}
      pressStyle={{ opacity: 0.85 }}
      accessibilityRole="button"
      accessibilityLabel="Load more players"
      // A div[role=button] doesn't synthesize a click on Enter/Space, so
      // keyboard activation has to be wired explicitly (mirrors LS-10665).
      tabIndex={0}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPress();
        }
      }}
      focusVisibleStyle={{
        outlineColor: BRAND_GOLD_LIGHT,
        outlineStyle: 'solid',
        outlineWidth: 2,
        outlineOffset: 2,
      }}
    >
      <Text
        fontFamily={FONT_DISPLAY}
        fontWeight="700"
        fontSize={12}
        letterSpacing={0.96}
        textTransform="uppercase"
        color={TEXT_HIGH_CONTRAST}
      >
        Load more
      </Text>
    </XStack>
  );
}
