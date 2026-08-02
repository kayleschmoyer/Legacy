import React, { useEffect, useState } from 'react';
import { Button, Text, YStack } from 'tamagui';
import { Lock } from '@tamagui/lucide-icons';
import { PriceSkeleton } from './PriceSkeleton';
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
import { useStripePrices } from '../hooks/useStripePrices';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PremiumGateProps {
  /** Whether the current user has premium access. */
  isPremium: boolean;
  /**
   * Pass `false` while user identity is still loading to suppress phantom
   * `trackPremiumFeatureBlocked` events that fire before isPremium resolves.
   * Defaults to `true` so existing callers are unaffected.
   */
  isUserLoaded?: boolean;
  /** Feature name used for analytics and upgrade modal copy. */
  featureName: string;
  /** Optional description displayed in the upgrade prompt overlay and modal. */
  featureDescription?: string;
  /** Content to tease (blurred) for free users or render normally for premium. */
  children: React.ReactNode;
  /**
   * Fully hides the blurred content from assistive tech (aria-hidden) instead
   * of leaving it perceivable-but-inert. Use only where the underlying data
   * is a genuine paywall bypass risk if read by a screen reader (e.g. full
   * AI-generated recap text) — see LS-5873/BMD-003. Defaults to `false` so
   * gates that intentionally show a real, non-interactive preview to free
   * users (e.g. the Player Stats teaser) keep their existing accessibility
   * tree presence.
   */
  hideBlurredContentFromAssistiveTech?: boolean;
}

// ---------------------------------------------------------------------------
// Session-scoped analytics dedup
// ---------------------------------------------------------------------------

// Module scope persists across remounts of the same page session (e.g. tab
// switch, week navigation) but resets on a full page reload, so a blocked
// feature fires trackPremiumFeatureBlocked at most once per page-view
// session instead of once per gate mount — LS-5874.
const blockedFeaturesTrackedThisSession = new Set<string>();

/** Test-only: clears session-scoped dedup state between test cases. */
export function __resetPremiumGateTrackingForTests(): void {
  blockedFeaturesTrackedThisSession.clear();
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
  isUserLoaded = true,
  featureName,
  featureDescription,
  children,
  hideBlurredContentFromAssistiveTech = false,
}: PremiumGateProps): React.ReactNode {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  // Live monthly-equivalent price (annual total / 12). Falls back to display
  // values from FALLBACK_ANNUAL_TOTAL_CENTS when Stripe prices are unavailable.
  const { annualMonthlyEquivalent, loading: pricesLoading } = useStripePrices();

  useEffect(() => {
    if (
      isUserLoaded &&
      !isPremium &&
      !blockedFeaturesTrackedThisSession.has(featureName)
    ) {
      blockedFeaturesTrackedThisSession.add(featureName);
      trackPremiumFeatureBlocked(featureName);
    }
  }, [featureName, isPremium, isUserLoaded]);

  function handleUpgradeClick() {
    trackPremiumFeatureClick(featureName);
    setShowUpgradeModal(true);
  }

  // Always render children in the same structural position (inner YStack inside
  // outer YStack) so React can reconcile without unmounting when isPremium
  // transitions from false → true during the useGetUserByIdQuery loading phase.
  // Previously the early `return children` created a different tree shape than
  // the blur-wrapper branch, causing remounts that reset controlled-input state
  // (e.g. PlayerSearchInput's query/open on the Compare page — LS-4143).
  return (
    <>
      <YStack
        width="100%"
        maxWidth="100%"
        position={isPremium ? undefined : 'relative'}
        overflow={isPremium ? undefined : 'hidden'}
        borderRadius={isPremium ? undefined : '$4'}
        minHeight={isPremium ? undefined : 240}
        style={isPremium ? undefined : { minWidth: 0 }}
      >
        {/* Content — blurred tease for free users, normal for premium */}
        <YStack
          width="100%"
          maxWidth="100%"
          pointerEvents={isPremium ? undefined : 'none'}
          aria-hidden={
            !isPremium && hideBlurredContentFromAssistiveTech ? true : undefined
          }
          style={
            isPremium
              ? undefined
              : { filter: 'blur(6px)', userSelect: 'none', minWidth: 0 }
          }
          opacity={isPremium ? undefined : 0.45}
        >
          {children}
        </YStack>

        {/* Gradient overlay with lock card — only rendered for free users */}
        {!isPremium && (
          <YStack
            data-testid="premium-feature-gate"
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
              maxWidth="100%"
              backgroundColor={withAlpha(SURFACE_CARD, 0.92)}
              borderWidth={1}
              borderColor={withAlpha(BRAND_GOLD, 0.45)}
              borderRadius="$5"
              paddingHorizontal="$4"
              $gtSm={{ paddingHorizontal: '$6' }}
              paddingVertical="$5"
              marginHorizontal="$3"
              style={{
                boxShadow: `0 8px 32px ${withAlpha(BRAND_NAVY, 0.5)}`,
                boxSizing: 'border-box',
              }}
            >
              <Lock size={30} color={BRAND_GOLD_LIGHT} />
              <YStack alignItems="center" gap="$1" maxWidth="100%">
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
                  width="100%"
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
              {pricesLoading ? (
                <PriceSkeleton width={80} height={14} radius={4} />
              ) : (
                <Text fontSize="$2" color={BRAND_GOLD_LIGHT} textAlign="center">
                  From {annualMonthlyEquivalent}/mo
                </Text>
              )}
            </YStack>
          </YStack>
        )}
      </YStack>

      {!isPremium && (
        <UpgradeModal
          open={showUpgradeModal}
          onOpenChange={setShowUpgradeModal}
          featureName={featureName}
          featureDescription={featureDescription}
        />
      )}
    </>
  );
}
