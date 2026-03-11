import React, { useState } from 'react';
import { Button, Text, YStack } from 'tamagui';
import { useRouter } from 'expo-router';
import { trackPremiumFeatureClick } from '../../utils/analytics';

export interface PremiumGateProps {
  /** Whether the current user has premium access. */
  isPremium: boolean;
  /** Feature name used for analytics and upgrade prompt copy. */
  featureName: string;
  /** Optional description displayed in the upgrade overlay. */
  featureDescription?: string;
  /** Content to tease (dimmed) for free users or render normally for premium. */
  children: React.ReactNode;
}

const BRAND_GOLD = '#B8962E';
const BRAND_GOLD_LIGHT = '#C5A55A';
const BRAND_NAVY = '#1A2A4A';

/**
 * PremiumGate — Gatekeeps premium-only UI sections on mobile.
 *
 * - Premium users: children rendered normally with no overlay.
 * - Free users: children are dimmed/opaque, overlaid with a lock icon and an
 *   upgrade CTA. Tapping the CTA fires `trackPremiumFeatureClick` and
 *   navigates to the subscription settings screen.
 *
 * React Native does not support CSS `filter: blur()`, so the free-tier overlay
 * uses opacity to obscure content rather than a blur effect.
 */
export function PremiumGate({
  isPremium,
  featureName,
  featureDescription,
  children,
}: PremiumGateProps) {
  const router = useRouter();
  const [pressed, setPressed] = useState(false);

  if (isPremium) {
    return children as React.JSX.Element;
  }

  const handleUpgradePress = () => {
    trackPremiumFeatureClick(featureName);
    void router.navigate('subscription-settings');
  };

  return (
    <YStack position="relative" overflow="hidden" borderRadius="$4">
      {/* Dimmed preview of locked content */}
      <YStack pointerEvents="none" opacity={0.3}>
        {children}
      </YStack>

      {/* Overlay lock card */}
      <YStack
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        alignItems="center"
        justifyContent="center"
        backgroundColor={`${BRAND_NAVY}CC`}
      >
        <YStack
          alignItems="center"
          gap="$3"
          backgroundColor="$background"
          borderWidth={1}
          borderColor={`${BRAND_GOLD}73`}
          borderRadius="$5"
          paddingHorizontal="$6"
          paddingVertical="$5"
        >
          <Text fontSize={28}>🔒</Text>
          <YStack alignItems="center" gap="$1">
            <Text
              color={BRAND_GOLD}
              fontSize="$5"
              fontWeight="bold"
              textAlign="center"
            >
              Premium Feature
            </Text>
            <Text
              color="$colorSubtle"
              fontSize="$3"
              textAlign="center"
              maxWidth={240}
            >
              {featureDescription ??
                `${featureName} is available on the Premium plan.`}
            </Text>
          </YStack>
          <Button
            onPress={handleUpgradePress}
            backgroundColor={BRAND_GOLD}
            color={BRAND_NAVY}
            fontWeight="bold"
            pressStyle={{ opacity: 0.85, scale: 0.97 }}
            borderRadius="$4"
            paddingHorizontal="$5"
            opacity={pressed ? 0.85 : 1}
            onPressIn={() => setPressed(true)}
            onPressOut={() => setPressed(false)}
          >
            <Text color={BRAND_NAVY} fontWeight="bold">
              Upgrade to Premium
            </Text>
          </Button>
          <Text fontSize="$2" color={BRAND_GOLD_LIGHT} textAlign="center">
            From $3.33/mo
          </Text>
        </YStack>
      </YStack>
    </YStack>
  );
}
