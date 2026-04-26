import { derivePricing } from './pricingUtils';

describe('derivePricing', () => {
  describe('default fallback pricing (499 / 3999)', () => {
    const result = derivePricing(499, 3999);

    it('computes monthlyPrice', () => {
      expect(result.monthlyPrice).toBeCloseTo(4.99);
    });

    it('computes annualTotal', () => {
      expect(result.annualTotal).toBeCloseTo(39.99);
    });

    it('computes annualMonthlyPrice', () => {
      expect(result.annualMonthlyPrice).toBeCloseTo(3999 / 12 / 100);
    });

    it('formats monthlyPriceDisplay', () => {
      expect(result.monthlyPriceDisplay).toBe('$4.99');
    });

    it('formats annualPriceDisplay', () => {
      expect(result.annualPriceDisplay).toBe('$39.99');
    });

    it('formats annualMonthlyEquivalent', () => {
      expect(result.annualMonthlyEquivalent).toBe('$3.33');
    });

    it('computes annualSavingsPct', () => {
      // 1 - 3999 / (499 * 12) = 1 - 3999/5988 ≈ 33%
      expect(result.annualSavingsPct).toBe('33%');
    });
  });

  describe('different price points', () => {
    it('handles higher prices', () => {
      const result = derivePricing(999, 7999);
      expect(result.monthlyPriceDisplay).toBe('$9.99');
      expect(result.annualPriceDisplay).toBe('$79.99');
    });

    it('savings percentage rounds correctly', () => {
      // 1 - 7999 / (999 * 12) = 1 - 7999/11988 ≈ 33%
      const result = derivePricing(999, 7999);
      expect(result.annualSavingsPct).toBe('33%');
    });

    it('returns 0% savings when annual equals 12 months of monthly', () => {
      const result = derivePricing(500, 6000);
      expect(result.annualSavingsPct).toBe('0%');
    });
  });

  describe('edge cases', () => {
    it('clamps savings to 0% when annual costs more than monthly × 12', () => {
      // annualTotalCents > monthlyPriceCents * 12 → negative savings → clamp to 0
      const result = derivePricing(100, 2000);
      expect(result.annualSavingsPct).toBe('0%');
    });

    it('clamps savings to 100% when annual is free', () => {
      const result = derivePricing(500, 0);
      expect(result.annualSavingsPct).toBe('100%');
    });

    it('returns 0% savings when monthlyPriceCents is 0 (avoid division by zero)', () => {
      const result = derivePricing(0, 0);
      expect(result.annualSavingsPct).toBe('0%');
    });

    it('returns 0% savings when monthlyPriceCents is 0 and annual is non-zero', () => {
      const result = derivePricing(0, 1000);
      expect(result.annualSavingsPct).toBe('0%');
    });

    it('formats display values with two decimal places', () => {
      const result = derivePricing(100, 1000);
      expect(result.monthlyPriceDisplay).toBe('$1.00');
      expect(result.annualPriceDisplay).toBe('$10.00');
    });
  });
});
