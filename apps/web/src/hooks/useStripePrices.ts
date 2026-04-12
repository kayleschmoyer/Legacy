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
 */
export function useStripePrices() {
  const { data, loading, error } = useGetStripePricesQuery({
    fetchPolicy: 'cache-and-network',
  });

  const warnedRef = useRef(false);

  useEffect(() => {
    if (warnedRef.current) return;
    if (error) {
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

  if (typeof monthly !== 'number' || typeof annual !== 'number') {
    return { ...fallbackPricing, loading };
  }

  return {
    ...derivePricing(monthly, annual),
    loading: false,
  };
}
