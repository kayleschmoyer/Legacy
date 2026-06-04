import { useEffect, useRef } from 'react';
import { captureWarning } from '@legacy-sports/rollbar/native';
import {
  derivePricing,
  FALLBACK_ANNUAL_TOTAL_CENTS,
  FALLBACK_MONTHLY_PRICE_CENTS,
} from './pricingUtils';
import { useGetStripePricesQuery } from '../../api/db/graphql.generated';

export { derivePricing } from './pricingUtils';

const fallbackPricing = derivePricing(
  FALLBACK_MONTHLY_PRICE_CENTS,
  FALLBACK_ANNUAL_TOTAL_CENTS,
);

export function useStripePrices() {
  const { data, loading, error } = useGetStripePricesQuery({
    // cache-and-network: return cached data immediately while re-fetching in
    // the background on every mount. Matches the web hook behaviour and keeps
    // prices fresh without blocking the UI.
    fetchPolicy: 'cache-and-network',
  });

  const warnedRef = useRef(false);

  const stripePrices = data?.stripePrices;
  const monthly = stripePrices?.monthlyPriceCents;
  const annual = stripePrices?.annualTotalCents;

  // True only when we have no usable live price data and will serve fallback
  // display values. With cache-and-network, an error can coexist with valid
  // cached data, so we must check the actual values — not just error presence.
  const isUsingFallback =
    typeof monthly !== 'number' || typeof annual !== 'number';

  const hasNullPrices = !loading && !error && data != null && isUsingFallback;

  useEffect(() => {
    if (warnedRef.current) return;
    // Only warn when we are actually serving fallback prices. With
    // cache-and-network, error can coexist with valid cached stripePrices —
    // in that case the hook returns live cached values, not the fallback.
    if (error && isUsingFallback) {
      // "Failed to fetch" / "Network request failed" are transient network noise
      // already filtered by the central Rollbar checkIgnore (LS-900). Wrapping
      // them in a custom Error would bypass that filter, so suppress here too.
      // Apollo RetryLink already retries these; the fallback display still renders.
      if (
        error.message === 'Failed to fetch' ||
        error.message === 'Network request failed'
      ) {
        warnedRef.current = true;
        return;
      }
      warnedRef.current = true;
      captureWarning(
        new Error('Stripe prices query failed — using hardcoded fallback'),
        { context: 'useStripePrices', errorMessage: error.message },
      );
    }
  }, [error, isUsingFallback]);

  useEffect(() => {
    if (warnedRef.current) return;
    if (hasNullPrices) {
      warnedRef.current = true;
      captureWarning(
        new Error(
          'Stripe prices query returned null — using hardcoded fallback',
        ),
        { context: 'useStripePrices' },
      );
    }
  }, [hasNullPrices]);

  if (
    !stripePrices ||
    typeof monthly !== 'number' ||
    typeof annual !== 'number'
  ) {
    // No live price data — show hardcoded fallback display values but disable
    // checkout (null price IDs) to prevent charging a mismatched Stripe price.
    return {
      ...fallbackPricing,
      loading,
      monthlyPriceId: null,
      annualPriceId: null,
    };
  }

  // stripePrices is non-null here and the schema marks monthlyPriceId /
  // annualPriceId as non-nullable, so we read them directly.
  return {
    ...derivePricing(monthly, annual),
    loading: false,
    monthlyPriceId: stripePrices.monthlyPriceId,
    annualPriceId: stripePrices.annualPriceId,
  };
}
