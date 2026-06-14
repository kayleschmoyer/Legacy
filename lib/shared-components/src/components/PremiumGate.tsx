import React from 'react';
import { Button, Card, Text, XStack, YStack } from 'tamagui';
import { Lock } from '@tamagui/lucide-icons';
import { BRAND_NAVY_LIGHT, withAlpha } from '../utils/colors';

export interface PremiumGateProps {
  /** Whether the current user has premium access. */
  isPremium: boolean;
  /** Feature name displayed in the locked UI. */
  featureName: string;
  /** Optional description shown below the feature name. */
  featureDescription?: string;
  /** Content to render normally for premium users (hidden for free users). */
  children: React.ReactNode;
  /**
   * Optional upgrade callback. When provided, an "Upgrade to Premium" button
   * is shown in the locked UI. Callers supply platform-specific navigation
   * (web: open UpgradeModal; mobile: navigate to subscription-settings).
   */
  onUpgrade?: () => void;
}

/**
 * PremiumGate — cross-platform gate for premium-only sections in shared
 * components.
 *
 * - Premium users: children rendered normally.
 * - Free users: a locked card with lock icon, feature name, optional
 *   description, and an "Upgrade to Premium" button when `onUpgrade` is provided.
 *
 * Platform-specific upgrade actions are injected via the `onUpgrade` prop
 * so this component stays free of web/mobile dependencies.
 */
export function PremiumGate({
  isPremium,
  featureName,
  featureDescription,
  children,
  onUpgrade,
}: PremiumGateProps): React.JSX.Element {
  if (isPremium) {
    return children as React.JSX.Element;
  }

  return (
    <Card
      bordered
      padding="$3"
      backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.04)}
    >
      <YStack gap="$2">
        <XStack alignItems="center" gap="$2">
          <Lock color={BRAND_NAVY_LIGHT} size={16} />
          <Text fontWeight="600">{featureName}</Text>
        </XStack>
        {featureDescription ? (
          <Text fontSize="$2" color="$gray10">
            {featureDescription}
          </Text>
        ) : null}
        <Text fontSize="$2" color="$gray11">
          Available with Premium leagues.
        </Text>
        {onUpgrade ? (
          <Button size="$2" onPress={onUpgrade} alignSelf="flex-start">
            Upgrade to Premium
          </Button>
        ) : null}
      </YStack>
    </Card>
  );
}
