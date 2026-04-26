export const FALLBACK_MONTHLY_PRICE_CENTS = 499;
export const FALLBACK_ANNUAL_TOTAL_CENTS = 3999;

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
  const annualSavingsPctValue = Number.isFinite(annualSavings)
    ? Math.min(100, Math.max(0, Math.round(annualSavings * 100)))
    : 0;
  const annualSavingsPct = `${annualSavingsPctValue}%`;

  const fmt = (v: number) => `$${v.toFixed(2)}`;
  return {
    monthlyPrice,
    annualTotal,
    annualMonthlyPrice,
    annualSavingsPct,
    monthlyPriceDisplay: fmt(monthlyPrice),
    annualPriceDisplay: fmt(annualTotal),
    annualMonthlyEquivalent: fmt(annualMonthlyPrice),
  };
}
