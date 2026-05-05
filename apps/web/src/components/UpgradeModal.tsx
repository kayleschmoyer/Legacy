import React from 'react';
import { Button, Text, XStack, YStack } from 'tamagui';
import { AlertCircle, Check, Star } from '@tamagui/lucide-icons';
import { BaseModal } from './BaseModal';
import {
  AMBER,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  TEXT_MUTED,
  TEXT_PRIMARY,
  withAlpha,
} from '../constants/colors';
import { useStripePrices } from '../hooks/useStripePrices';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PREMIUM_FEATURES = [
  'Player Comparison tool',
  'Matchup Projections',
  'AI Matchup Narratives & Recaps',
  'Mock Draft simulator',
  'Unlimited league creation',
  'Salary cap league settings',
  'FAAB waiver settings',
  'Advanced playoff formats (6/8-team)',
  'Historical era selection',
  'Draft Recommendations panel',
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The specific premium feature the user clicked to open this modal. */
  featureName: string;
  /** Optional description shown in the feature highlight section. */
  featureDescription?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * UpgradeModal — Surfaces the Premium upgrade prompt with pricing and the
 * full list of included features. Opened by PremiumGate when a free user
 * clicks the upgrade CTA.
 */
export function UpgradeModal({
  open,
  onOpenChange,
  featureName,
  featureDescription,
}: UpgradeModalProps) {
  const {
    monthlyPriceDisplay: MONTHLY_PRICE_DISPLAY,
    annualPriceDisplay: ANNUAL_PRICE_DISPLAY,
    annualSavingsPct: ANNUAL_SAVINGS_PCT,
    pricesFailed,
  } = useStripePrices();

  return (
    <BaseModal
      open={open}
      onOpenChange={onOpenChange}
      title="Upgrade to Premium"
      subtitle={`Unlock ${featureName} and more`}
      maxWidth={520}
    >
      <YStack padding="$5" gap="$5">
        {/* ── Triggered feature highlight ── */}
        <YStack
          backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.15)}
          borderWidth={1}
          borderColor={withAlpha(BRAND_GOLD, 0.35)}
          borderRadius="$4"
          padding="$4"
          gap="$2"
        >
          <XStack alignItems="center" gap="$2">
            <Star size={16} color={BRAND_GOLD_LIGHT} />
            <Text color={BRAND_GOLD} fontWeight="bold" fontSize="$4">
              {featureName}
            </Text>
          </XStack>
          <Text color={TEXT_MUTED} fontSize="$3" lineHeight="$3">
            {featureDescription ??
              `${featureName} is available exclusively on the Premium plan.`}
          </Text>
        </YStack>

        {/* ── Pricing ── */}
        <YStack alignItems="center" gap="$1">
          <XStack alignItems="baseline" gap="$1">
            <Text color={TEXT_PRIMARY} fontSize="$9" fontWeight="bold">
              {MONTHLY_PRICE_DISPLAY}
            </Text>
            <Text color={TEXT_MUTED} fontSize="$3">
              / month
            </Text>
          </XStack>
          <Text color={TEXT_MUTED} fontSize="$2">
            or {ANNUAL_PRICE_DISPLAY} / year — save {ANNUAL_SAVINGS_PCT}
          </Text>
          {pricesFailed && (
            <XStack alignItems="center" gap="$1" marginTop="$2">
              <AlertCircle size={12} color={AMBER} />
              <Text color={AMBER} fontSize="$2">
                Pricing information could not be loaded. Displayed prices may be
                outdated.
              </Text>
            </XStack>
          )}
        </YStack>

        {/* ── Full feature list ── */}
        <YStack gap="$3">
          <Text color={TEXT_MUTED} fontSize="$3" fontWeight="600">
            Everything included in Premium:
          </Text>
          <YStack gap="$2">
            {PREMIUM_FEATURES.map((feature) => (
              <XStack key={feature} alignItems="center" gap="$2">
                <Check size={14} color={BRAND_GOLD_LIGHT} />
                <Text color={TEXT_PRIMARY} fontSize="$3">
                  {feature}
                </Text>
              </XStack>
            ))}
          </YStack>
        </YStack>

        {/* ── CTA ── */}
        <YStack gap="$2">
          <Button
            size="$5"
            style={{
              background: `linear-gradient(135deg, ${BRAND_GOLD} 0%, ${BRAND_GOLD_LIGHT} 100%)`,
            }}
            color={BRAND_NAVY}
            fontWeight="bold"
            pressStyle={{ opacity: 0.85, scale: 0.97 }}
            hoverStyle={{ opacity: 0.92 }}
            borderRadius="$4"
            onPress={() => onOpenChange(false)}
          >
            Get Premium
          </Button>
          <Text color={TEXT_MUTED} fontSize="$2" textAlign="center">
            Cancel anytime. No hidden fees.
          </Text>
        </YStack>
      </YStack>
    </BaseModal>
  );
}
