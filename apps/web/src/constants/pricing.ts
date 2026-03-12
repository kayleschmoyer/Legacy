/* ─── Pricing constants — single source of truth ─── */

// Base pricing in cents (single source of truth)
const MONTHLY_PRICE_CENTS = 499;
const ANNUAL_TOTAL_CENTS = 3999;

// Derived numeric prices
export const MONTHLY_PRICE = MONTHLY_PRICE_CENTS / 100;
export const ANNUAL_TOTAL = ANNUAL_TOTAL_CENTS / 100;
/** Per-month cost when billed annually */
export const ANNUAL_MONTHLY_PRICE = ANNUAL_TOTAL_CENTS / 12 / 100;

// Derived savings percentage (annual vs 12× monthly)
const ANNUAL_SAVINGS = 1 - ANNUAL_TOTAL_CENTS / (MONTHLY_PRICE_CENTS * 12);
export const ANNUAL_SAVINGS_PCT = `${Math.round(ANNUAL_SAVINGS * 100)}%`;

const formatPrice = (value: number): string => `$${value.toFixed(2)}`;

/** Pre-formatted display strings */
export const MONTHLY_PRICE_DISPLAY = formatPrice(MONTHLY_PRICE);
export const ANNUAL_PRICE_DISPLAY = formatPrice(ANNUAL_TOTAL);
export const ANNUAL_MONTHLY_EQUIVALENT = formatPrice(ANNUAL_MONTHLY_PRICE);
