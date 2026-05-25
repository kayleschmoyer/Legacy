/**
 * GrowthBook A/B testing and feature flag provider.
 *
 * Wrap the app with <GrowthBookProvider> to enable feature flags and
 * experiments. The SDK fetches feature definitions from GrowthBook Cloud
 * and fires an `experiment_viewed` GA4 event whenever a user is assigned
 * to an experiment variant.
 *
 * Usage:
 *   import { useFeatureIsOn, useFeatureValue } from './GrowthBookProvider';
 *
 *   const showNewPricing = useFeatureIsOn('new-pricing-page');
 *   const ctaText = useFeatureValue('premium-cta-text', 'Upgrade Now');
 *
 * To set targeting attributes (call after user info is available):
 *   import { useGrowthBookAttributes } from './GrowthBookProvider';
 *   useGrowthBookAttributes({ userId, subscriptionTier, ... });
 */

import { type ReactNode, useEffect } from 'react';
import {
  type FeatureDefinition,
  GrowthBookProvider as GBProvider,
  GrowthBook,
} from '@growthbook/growthbook-react';
import { LOGGER } from '@legacy-sports/logging';
import { env } from '../config/environment';

// Re-export hooks so consumers have a single import path if desired
export { useFeatureIsOn, useFeatureValue } from '@growthbook/growthbook-react';

// Allow E2E tests to pre-seed features via window.__gbSeededFeatures (set via
// Playwright addInitScript before navigation). No-op in production where the
// property is never set.
const seededFeatures = (
  typeof globalThis !== 'undefined'
    ? (globalThis as Record<string, unknown>)['__gbSeededFeatures']
    : undefined
) as Record<string, FeatureDefinition> | undefined;

// Singleton GrowthBook instance — created once at module load
export const growthbook = new GrowthBook({
  apiHost: 'https://cdn.growthbook.io',
  clientKey: env.growthbookClientKey ?? '',
  enableDevMode: env.isDev,
  features: seededFeatures,
  trackingCallback: (experiment, result) => {
    // Report to GA4 so experiment results can be analyzed in GA4 Explorations
    if (window.gtag && env.googleAnalyticsMeasurementId) {
      window.gtag('event', 'experiment_viewed', {
        experiment_id: experiment.key,
        variation_id: String(result.variationId),
      });
    }
    LOGGER.info('[GrowthBook] Experiment viewed:', {
      experiment: experiment.key,
      variationId: result.variationId,
    });
  },
});

/**
 * Top-level provider — place this near the root of the React tree.
 * Feature definitions are fetched once on mount and auto-refreshed.
 */
export function GrowthBookProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  useEffect(() => {
    if (!env.growthbookClientKey) return;

    growthbook.loadFeatures({ autoRefresh: true }).catch((err: unknown) => {
      LOGGER.warn(
        '[GrowthBook] Feature load failed (non-fatal):',
        err as object,
      );
    });
  }, []);

  return <GBProvider growthbook={growthbook}>{children}</GBProvider>;
}

/**
 * Hook — call this wherever user attributes are available so GrowthBook
 * can apply targeting conditions (user ID, subscription tier, etc.).
 *
 * Pass a stable (memoized) attributes object to prevent the effect from
 * re-firing on every render.
 *
 * @example
 * const attrs = useMemo(() => ({ id: userId, subscriptionTier }), [userId, subscriptionTier]);
 * useGrowthBookAttributes(attrs);
 */
export function useGrowthBookAttributes(
  attributes: Record<string, unknown>,
): void {
  useEffect(() => {
    void growthbook.setAttributes(
      attributes as Parameters<typeof growthbook.setAttributes>[0],
    );
  }, [attributes]);
}
