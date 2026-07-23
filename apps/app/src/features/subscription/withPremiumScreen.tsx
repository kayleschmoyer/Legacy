import React from 'react';
import { Spinner, YStack } from 'tamagui';
import { PremiumGate } from './PremiumGate';
import { useSubscription } from './useSubscription';

const BRAND_GOLD = '#B8962E';

export interface PremiumScreenOptions {
  /** Feature name used for analytics and upgrade prompt copy. */
  featureName: string;
  /** Optional description displayed in the upgrade overlay. */
  featureDescription?: string;
}

/**
 * withPremiumScreen — Screen-level premium gate HOC.
 *
 * Wraps a screen component with centralized subscription loading, loading-state
 * handling, and the {@link PremiumGate} overlay. Screens that require premium
 * access should use this HOC instead of manually calling `useSubscription` and
 * rendering `PremiumGate` inline.
 *
 * The wrapped component receives an `isPremium` prop injected by the HOC so it
 * can adjust its own internal UI without a second `useSubscription` call.
 *
 * Usage:
 * ```tsx
 * function MyScreenContent({ isPremium }: { isPremium: boolean }) { ... }
 *
 * export default withPremiumScreen(MyScreenContent, {
 *   featureName: 'My Feature',
 *   featureDescription: 'Access advanced stats and more.',
 * });
 * ```
 */
export function withPremiumScreen<P extends object>(
  WrappedComponent: React.ComponentType<P & { isPremium: boolean }>,
  options: PremiumScreenOptions,
): React.FC<P> {
  function PremiumScreen(props: P): React.JSX.Element {
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
      // Screen-level gates always fill the viewport (matching the flex-filled
      // loading state above): wrapped screens size themselves with flex, and
      // without `fill` the free-tier overlay collapses to zero height (LS-8636).
      <PremiumGate
        isPremium={isPremium}
        featureName={options.featureName}
        featureDescription={options.featureDescription}
        fill
      >
        <WrappedComponent {...props} isPremium={isPremium} />
      </PremiumGate>
    );
  }

  const name =
    WrappedComponent.displayName ?? WrappedComponent.name ?? 'Component';
  PremiumScreen.displayName = `withPremiumScreen(${name})`;

  return PremiumScreen;
}
