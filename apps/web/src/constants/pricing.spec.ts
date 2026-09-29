import { derivePricing } from './pricing';

describe('derivePricing', () => {
  it('derives correct values from default pricing', () => {
    const result = derivePricing(499, 3999);

    expect(result.monthlyPrice).toBe(4.99);
    expect(result.annualTotal).toBe(39.99);
    expect(result.annualMonthlyPrice).toBeCloseTo(3.33, 2);
    expect(result.annualSavingsPct).toBe('33%');
    expect(result.monthlyPriceDisplay).toBe('$4.99');
    expect(result.annualPriceDisplay).toBe('$39.99');
    expect(result.annualMonthlyEquivalent).toBe('$3.33');
  });

  it('handles different price points', () => {
    const result = derivePricing(999, 9588);

    expect(result.monthlyPrice).toBe(9.99);
    expect(result.annualTotal).toBe(95.88);
    // 9588 / 12 / 100 = 7.99
    expect(result.annualMonthlyPrice).toBe(7.99);
    // savings = 1 - 9588 / (999 * 12) = 1 - 9588/11988 = ~20%
    expect(result.annualSavingsPct).toBe('20%');
  });

  it('handles zero monthly and annual prices without NaN', () => {
    const result = derivePricing(0, 0);

    expect(result.monthlyPrice).toBe(0);
    expect(result.annualTotal).toBe(0);
    expect(result.annualSavingsPct).toBe('0%');
  });

  it('clamps savings to 0% when annual is more expensive than monthly * 12', () => {
    // 1 - 6900 / (499 * 12) = -15%
    const result = derivePricing(499, 6900);

    expect(result.annualSavingsPct).toBe('0%');
  });

  it('clamps savings to 100% at most', () => {
    const result = derivePricing(499, 0);

    expect(result.annualSavingsPct).toBe('100%');
  });
});
