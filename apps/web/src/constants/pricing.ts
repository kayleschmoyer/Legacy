/* ─── Pricing constants — hardcoded fallbacks ─── */

// Fallback values used when live Stripe prices are unavailable.
// Prefer useStripePrices() in React components for live data.
export const FALLBACK_MONTHLY_PRICE_CENTS = 499;
export const FALLBACK_ANNUAL_TOTAL_CENTS = 3999;

/** Derive all display values from raw cent amounts. */
export function derivePricing(
  monthlyPriceCents: number,
  annualTotalCents: number,
) {
  const monthlyPrice = monthlyPriceCents / 100;
  const annualTotal = annualTotalCents / 100;
  const annualMonthlyPrice = annualTotalCents / 12 / 100;
  const hasValidSavingsInputs = monthlyPriceCents > 0 && annualTotalCents >= 0;
  const annualSavings = hasValidSavingsInputs
    ? 1 - annualTotalCents / (monthlyPriceCents * 12)
    : 0;
  const annualSavingsPct = Number.isFinite(annualSavings)
    ? `${Math.round(annualSavings * 100)}%`
    : '0%';

  const formatPrice = (value: number): string => `$${value.toFixed(2)}`;

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
