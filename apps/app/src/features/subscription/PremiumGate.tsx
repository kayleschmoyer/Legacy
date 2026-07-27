import React, { useEffect, useState } from 'react';
import { Button, Text, YStack } from 'tamagui';
import { useRouter } from 'expo-router';
import { brand } from '@legacy-sports/design-tokens';
import { useStripePrices } from './useStripePrices';
import {
  trackPremiumFeatureBlocked,
  trackPremiumFeatureClick,
} from '../../utils/analytics';

export interface PremiumGateProps {
  /** Whether the current user has premium access. */
  isPremium: boolean;
  /**
   * Pass `false` while user identity is still loading to suppress phantom
   * `trackPremiumFeatureBlocked` events that fire before isPremium resolves.
   * Defaults to `true` so existing callers are unaffected.
   */
  isUserLoaded?: boolean;
  /** Feature name used for analytics and upgrade prompt copy. */
  featureName: string;
  /** Optional description displayed in the upgrade overlay. */
  featureDescription?: string;
  /**
   * Stretch the free-tier overlay to fill its parent (`flex: 1`). Required when
   * `children` size themselves with flex (full-screen pages like
   * PlayerStatsPage): the overlay container is otherwise auto-height and the
   * lock card is absolutely positioned (contributing no height), so a
   * flex-sized child collapses the whole gate to zero height and free users see
   * a blank screen (LS-8636). Leave unset for intrinsic-height content (cards,
   * panels) so the gate keeps hugging its content.
   */
  fill?: boolean;
  /** Content to tease (dimmed) for free users or render normally for premium. */
  children: React.ReactNode;
}

/**
 * PremiumGate — Gatekeeps premium-only UI sections on mobile.
 *
 * - Premium users: children rendered normally with no overlay.
 * - Free users: children are dimmed/opaque, overlaid with a lock icon and an
 *   upgrade CTA. On render, fires `trackPremiumFeatureBlocked`. Tapping the
 *   CTA fires `trackPremiumFeatureClick` and navigates to the subscription
 *   settings screen.
 *
 * React Native does not support CSS `filter: blur()`, so the free-tier overlay
 * uses opacity to obscure content rather than a blur effect.
 */
export function PremiumGate({
  isPremium,
  isUserLoaded = true,
  featureName,
  featureDescription,
  fill = false,
  children,
}: PremiumGateProps) {
  useEffect(() => {
    if (isUserLoaded && !isPremium) {
      trackPremiumFeatureBlocked(featureName);
    }
  }, [featureName, isPremium, isUserLoaded]);

  if (isPremium) {
    return children as React.JSX.Element;
  }

  return (
    <PremiumGateOverlay
      featureName={featureName}
      featureDescription={featureDescription}
      fill={fill}
    >
      {children}
    </PremiumGateOverlay>
  );
}

interface PremiumGateOverlayProps {
  /** Feature name used for analytics and upgrade prompt copy. */
  featureName: string;
  /** Optional description displayed in the upgrade overlay. */
  featureDescription?: string;
  /** Stretch the overlay to fill its parent — see {@link PremiumGateProps.fill}. */
  fill?: boolean;
  /** Content to tease (dimmed) behind the lock card. */
  children: React.ReactNode;
}

/**
 * Free-tier upgrade overlay for {@link PremiumGate}. Rendered only for
 * non-premium users, so the `useStripePrices` query fires lazily — premium
 * users (the common case) never trigger it.
 */
function PremiumGateOverlay({
  featureName,
  featureDescription,
  fill = false,
  children,
}: PremiumGateOverlayProps) {
  const router = useRouter();
  const [pressed, setPressed] = useState(false);
  // Live monthly-equivalent price (annual total / 12). Falls back to display
  // values from FALLBACK_ANNUAL_TOTAL_CENTS when Stripe prices are unavailable.
  const { annualMonthlyEquivalent } = useStripePrices();

  const handleUpgradePress = () => {
    trackPremiumFeatureClick(featureName);
    void router.navigate('subscription-settings');
  };

  return (
    <YStack
      testID="premium-gate-overlay"
      position="relative"
      overflow="hidden"
      borderRadius="$4"
      flex={fill ? 1 : undefined}
    >
      {/* Dimmed preview of locked content. The wrapper must mirror `fill` —
          without flex here a flex-sized child still resolves to zero height
          even when the outer container fills the parent. */}
      <YStack
        testID="premium-gate-content"
        pointerEvents="none"
        opacity={0.3}
        flex={fill ? 1 : undefined}
      >
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
        backgroundColor={`${brand.navy}CC`}
      >
        <YStack
          alignItems="center"
          gap="$3"
          backgroundColor="$background"
          borderWidth={1}
          borderColor={`${brand.gold}73`}
          borderRadius="$5"
          paddingHorizontal="$6"
          paddingVertical="$5"
        >
          <Text fontSize={28}>🔒</Text>
          <YStack alignItems="center" gap="$1">
            <Text
              color={brand.gold}
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
            backgroundColor={brand.gold}
            color={brand.navy}
            fontWeight="bold"
            pressStyle={{ opacity: 0.85, scale: 0.97 }}
            borderRadius="$4"
            paddingHorizontal="$5"
            opacity={pressed ? 0.85 : 1}
            onPressIn={() => setPressed(true)}
            onPressOut={() => setPressed(false)}
          >
            <Text color={brand.navy} fontWeight="bold">
              Upgrade to Premium
            </Text>
          </Button>
          <Text fontSize="$2" color={brand.goldLight} textAlign="center">
            From {annualMonthlyEquivalent}/mo
          </Text>
        </YStack>
      </YStack>
    </YStack>
  );
}
