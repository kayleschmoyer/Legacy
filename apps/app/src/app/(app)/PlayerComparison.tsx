import React from 'react';
import { useRouter } from 'expo-router';
import {
  PLAYER_COMPARISON_FEATURE_DESCRIPTION as FEATURE_DESCRIPTION,
  PlayerComparison,
} from '@legacy-sports/shared-components';
import { withPremiumScreen } from '../../features/subscription/withPremiumScreen';

const FEATURE_NAME = 'Player Comparison';

/**
 * Mobile Player Comparison screen. The comparison UI is the canonical,
 * cross-platform `PlayerComparison` feature in shared-components (LS-7804) —
 * the same implementation web renders. This screen wires it to mobile premium
 * gating and navigation, achieving full web/mobile parity (4-player columns,
 * scoring projections, season breakdowns, achievements).
 */
function PlayerComparisonContent({
  isPremium,
}: {
  isPremium: boolean;
}): React.JSX.Element {
  const router = useRouter();
  return (
    <PlayerComparison
      isPremium={isPremium}
      onUpgrade={() => router.navigate('/subscription-settings')}
    />
  );
}

export default withPremiumScreen(PlayerComparisonContent, {
  featureName: FEATURE_NAME,
  featureDescription: FEATURE_DESCRIPTION,
});

export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';
