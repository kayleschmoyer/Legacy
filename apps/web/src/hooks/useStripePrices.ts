import { useEffect, useRef } from 'react';

import { captureWarning } from '@legacy-sports/rollbar/web';
import { useGetStripePricesQuery } from '../api/db/graphql.generated';
import {
  derivePricing,
  FALLBACK_ANNUAL_TOTAL_CENTS,
  FALLBACK_MONTHLY_PRICE_CENTS,
} from '../constants/pricing';

const fallbackPricing = derivePricing(
  FALLBACK_MONTHLY_PRICE_CENTS,
  FALLBACK_ANNUAL_TOTAL_CENTS,
);

/**
 * Fetches live subscription prices from Stripe via GraphQL
 * and derives all display values. Falls back to hardcoded
 * constants when the query fails or returns null.
 *
 * Also exposes `monthlyPriceId` and `annualPriceId` (Stripe price IDs)
 * so the checkout flow does not depend on build-time env vars.
 */
export function useStripePrices() {
  const { data, loading, error } = useGetStripePricesQuery({
    fetchPolicy: 'cache-and-network',
  });

  const warnedRef = useRef(false);

  useEffect(() => {
    if (warnedRef.current) return;
    if (error) {
      // "Failed to fetch" is transient browser-network noise (connectivity drops,
      // extension interference, tab backgrounding) that the central Rollbar
      // checkIgnore already filters (LS-900). Wrapping it in a custom Error
      // would bypass that filter, so suppress it here too. Apollo RetryLink
      // already retries these requests; the fallback display still renders.
      if (error.message === 'Failed to fetch') {
        warnedRef.current = true;
        return;
      }
      warnedRef.current = true;
      captureWarning(
        new Error('Stripe prices query failed — using hardcoded fallback'),
        { context: 'useStripePrices', errorMessage: error.message },
      );
    }
  }, [error]);

  const stripePrices = data?.stripePrices;
  const monthly = stripePrices?.monthlyPriceCents;
  const annual = stripePrices?.annualTotalCents;

  const hasNullPrices =
    !loading &&
    !error &&
    data != null &&
    (typeof monthly !== 'number' || typeof annual !== 'number');

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

  // All StripePriceInfo fields are non-nullable in the schema, so
  // monthlyPriceId/annualPriceId are null iff stripePrices itself is null —
  // already captured by the hasNullPrices warning above.
  const monthlyPriceId = stripePrices?.monthlyPriceId ?? null;
  const annualPriceId = stripePrices?.annualPriceId ?? null;

  const pricesFailed = !loading && (!!error || hasNullPrices);

  if (typeof monthly !== 'number' || typeof annual !== 'number') {
    return {
      ...fallbackPricing,
      loading,
      pricesFailed,
      monthlyPriceId,
      annualPriceId,
    };
  }

  return {
    ...derivePricing(monthly, annual),
    loading: false,
    pricesFailed: false,
    monthlyPriceId,
    annualPriceId,
  };
}
