import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  TEXT_MUTED,
  withAlpha,
} from '../../../utils/colors';
import { FONT_BODY, FONT_DISPLAY } from '../shell/tokens';

export interface PremiumTeaserCardProps {
  onPress: () => void;
  testID?: string;
}

/**
 * Inline "GO PREMIUM" upsell card for the Players card feed (LS-8832, design
 * handoff option 1c) — inserted once in the feed (after ~3rd card or at end).
 * Callers must not render this at all for premium users
 * (`useSubscription().isPremium`); the design spec calls for it to be "hidden
 * entirely", not just disabled, so the gating happens at the call site rather
 * than inside this component.
 */
export function PremiumTeaserCard({
  onPress,
  testID = 'players-card-feed-premium-teaser',
}: PremiumTeaserCardProps) {
  return (
    <XStack
      testID={testID}
      borderWidth={1.5}
      borderStyle="dashed"
      borderColor={withAlpha(BRAND_GOLD, 0.5)}
      borderRadius={12}
      padding={14}
      backgroundColor={withAlpha(BRAND_GOLD, 0.05)}
      alignItems="center"
      gap={12}
      onPress={onPress}
      pressStyle={{ opacity: 0.85 }}
      accessibilityRole="button"
      accessibilityLabel="Go Premium — unlock advanced stats"
    >
      <YStack flex={1} gap={4}>
        <Text
          fontFamily={FONT_DISPLAY}
          fontWeight="700"
          fontSize={12}
          letterSpacing={0.96}
          textTransform="uppercase"
          color={BRAND_GOLD_LIGHT}
        >
          Go Premium
        </Text>
        <Text fontFamily={FONT_BODY} fontSize={12.5} color={TEXT_MUTED}>
          Unlock FPTS/G, oWAR, custom columns and 500-row pages.
        </Text>
      </YStack>
      <Text
        fontFamily={FONT_DISPLAY}
        fontWeight="800"
        fontSize={18}
        color={BRAND_GOLD_LIGHT}
      >
        →
      </Text>
    </XStack>
  );
}

export default PremiumTeaserCard;
