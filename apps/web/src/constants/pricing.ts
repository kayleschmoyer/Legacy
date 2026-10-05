/* ─── Pricing constants — hardcoded fallbacks ─── */

// Fallback values used when live Stripe prices are unavailable.
// Prefer useStripePrices() in React components for live data.
export const FALLBACK_MONTHLY_PRICE_CENTS = 499;
export const FALLBACK_ANNUAL_TOTAL_CENTS = 3999;

export const FALLBACK_CURRENCY = 'USD';

/**
 * Build a currency formatter for a Stripe currency code (case-insensitive).
 * Falls back to USD when the code is not a valid ISO 4217 code so a bad value
 * can never throw during render.
 */
function makeCurrencyFormatter(currency: string): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    });
  } catch {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: FALLBACK_CURRENCY,
    });
  }
}

/** Derive all display values from raw cent amounts. */
export function derivePricing(
  monthlyPriceCents: number,
  annualTotalCents: number,
  currency: string = FALLBACK_CURRENCY,
) {
  const formatter = makeCurrencyFormatter(currency);
  // Stripe amounts are minor units: 2 decimals for usd/eur/gbp, 0 for jpy.
  const minorUnitDivisor =
    10 ** (formatter.resolvedOptions().maximumFractionDigits ?? 2);
  const monthlyPrice = monthlyPriceCents / minorUnitDivisor;
  const annualTotal = annualTotalCents / minorUnitDivisor;
  const annualMonthlyPrice = annualTotalCents / 12 / minorUnitDivisor;
  const hasValidSavingsInputs = monthlyPriceCents > 0 && annualTotalCents >= 0;
  const annualSavings = hasValidSavingsInputs
    ? 1 - annualTotalCents / (monthlyPriceCents * 12)
    : 0;
  const annualSavingsPctValue = Number.isFinite(annualSavings)
    ? Math.min(100, Math.max(0, Math.round(annualSavings * 100)))
    : 0;
  const annualSavingsPct = `${annualSavingsPctValue}%`;

  const formatPrice = (value: number): string => formatter.format(value);

  return {
    monthlyPrice,
    annualTotal,
    annualMonthlyPrice,
    annualSavingsPct,
    monthlyPriceDisplay: formatPrice(monthlyPrice),
    annualPriceDisplay: formatPrice(annualTotal),
    annualMonthlyEquivalent: formatPrice(annualMonthlyPrice),
  };
}

// Static fallback exports for non-React contexts (e.g. tests, SSR).
const fallback = derivePricing(
  FALLBACK_MONTHLY_PRICE_CENTS,
  FALLBACK_ANNUAL_TOTAL_CENTS,
);

export const MONTHLY_PRICE = fallback.monthlyPrice;
export const ANNUAL_TOTAL = fallback.annualTotal;
export const ANNUAL_MONTHLY_PRICE = fallback.annualMonthlyPrice;
export const ANNUAL_SAVINGS_PCT = fallback.annualSavingsPct;
export const MONTHLY_PRICE_DISPLAY = fallback.monthlyPriceDisplay;
export const ANNUAL_PRICE_DISPLAY = fallback.annualPriceDisplay;
export const ANNUAL_MONTHLY_EQUIVALENT = fallback.annualMonthlyEquivalent;
