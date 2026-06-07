import React from 'react';
import { Spinner, YStack } from 'tamagui';
import { useRouter } from 'expo-router';
import {
  PLAYER_COMPARISON_FEATURE_DESCRIPTION as FEATURE_DESCRIPTION,
  PlayerComparison,
} from '@legacy-sports/shared-components';
import { PremiumGate } from '../../features/subscription/PremiumGate';
import { useSubscription } from '../../features/subscription/useSubscription';

const BRAND_GOLD = '#B8962E';
const FEATURE_NAME = 'Player Comparison';

/**
 * Mobile Player Comparison screen. The comparison UI is the canonical,
 * cross-platform `PlayerComparison` feature in shared-components (LS-7804) —
 * the same implementation web renders. This screen wires it to mobile premium
 * gating and navigation, achieving full web/mobile parity (4-player columns,
 * scoring projections, season breakdowns, achievements).
 */
export default function PlayerComparisonScreen(): React.JSX.Element {
  const router = useRouter();
  const { isPremium, loading } = useSubscription();

  if (loading) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        backgroundColor="$background"
      >
        <Spinner size="large" color={BRAND_GOLD} />
      </YStack>
    );
  }

  return (
    <PremiumGate
      isPremium={isPremium}
      featureName={FEATURE_NAME}
      featureDescription={FEATURE_DESCRIPTION}
    >
      <PlayerComparison
        isPremium={isPremium}
        onUpgrade={() => router.navigate('/subscription-settings')}
      />
    </PremiumGate>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
