import React, { useEffect, useState } from 'react';
import { Button, Text, YStack } from 'tamagui';
import { Lock } from '@tamagui/lucide-icons';
import { UpgradeModal } from './UpgradeModal';
import {
  trackPremiumFeatureBlocked,
  trackPremiumFeatureClick,
} from '../utils/analytics';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  SURFACE_CARD,
  withAlpha,
} from '../constants/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PremiumGateProps {
  /** Whether the current user has premium access. */
  isPremium: boolean;
  /** Feature name used for analytics and upgrade modal copy. */
  featureName: string;
  /** Optional description displayed in the upgrade prompt overlay and modal. */
  featureDescription?: string;
  /** Content to tease (blurred) for free users or render normally for premium. */
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * PremiumGate — Gatekeeps premium-only UI sections.
 *
 * - Premium users: children rendered normally with no overlay.
 * - Free users: children are rendered but visually blurred, overlaid with a
 *   lock icon and an upgrade CTA. Clicking the CTA fires
 *   `trackPremiumFeatureClick` and opens the UpgradeModal.
 *
 * Usage:
 * ```tsx
 * <PremiumGate isPremium={user.isPremium} featureName="Player Comparison">
 *   <PlayerComparisonPanel />
 * </PremiumGate>
 * ```
 */
export function PremiumGate({
  isPremium,
  featureName,
  featureDescription,
  children,
}: PremiumGateProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  useEffect(() => {
    if (!isPremium) {
      trackPremiumFeatureBlocked(featureName);
    }
  }, [featureName, isPremium]);

  if (isPremium) {
    return <>{children}</>;
  }

  function handleUpgradeClick() {
    trackPremiumFeatureClick(featureName);
    setShowUpgradeModal(true);
  }

  return (
    <>
      {/* Gated content: blurred tease + lock overlay */}
      <YStack position="relative" overflow="hidden" borderRadius="$4">
        {/* Blurred preview of the actual content — reveals shape without data */}
        <YStack
          pointerEvents="none"
          style={{ filter: 'blur(6px)', userSelect: 'none' }}
          opacity={0.45}
        >
          {children}
        </YStack>

        {/* Gradient overlay with lock card */}
        <YStack
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          alignItems="center"
          justifyContent="center"
          style={{
            background: `linear-gradient(180deg, ${withAlpha(BRAND_NAVY, 0.7)} 0%, ${BRAND_NAVY} 100%)`,
          }}
        >
          <YStack
            alignItems="center"
            gap="$3"
            backgroundColor={withAlpha(SURFACE_CARD, 0.92)}
            borderWidth={1}
            borderColor={withAlpha(BRAND_GOLD, 0.45)}
            borderRadius="$5"
            paddingHorizontal="$6"
            paddingVertical="$5"
            style={{ boxShadow: `0 8px 32px ${withAlpha(BRAND_NAVY, 0.5)}` }}
          >
            <Lock size={30} color={BRAND_GOLD_LIGHT} />
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
                maxWidth={280}
              >
                {featureDescription ??
                  `${featureName} is available on the Premium plan.`}
              </Text>
            </YStack>
            <Button
              onPress={handleUpgradeClick}
              style={{
                background: `linear-gradient(135deg, ${BRAND_GOLD} 0%, ${BRAND_GOLD_LIGHT} 100%)`,
              }}
              color={BRAND_NAVY}
              fontWeight="bold"
              pressStyle={{ opacity: 0.85, scale: 0.97 }}
              hoverStyle={{ opacity: 0.92 }}
              borderRadius="$4"
              paddingHorizontal="$5"
            >
              Upgrade to Premium
            </Button>
          </YStack>
        </YStack>
      </YStack>

      <UpgradeModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
        featureName={featureName}
        featureDescription={featureDescription}
      />
    </>
  );
}
