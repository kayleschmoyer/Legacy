import {
  PREMIUM_FEATURES,
  premiumFeatureBenefitLabel,
} from './entry/premium-features';

describe('PREMIUM_FEATURES (canonical list, LS-7393)', () => {
  it('has exactly one entry per label', () => {
    const labels = PREMIUM_FEATURES.map((f) => f.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('includes every feature advertised on Pricing and the Upgrade modal', () => {
    const labels = PREMIUM_FEATURES.map((f) => f.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Active leagues',
        'Player comparison',
        'Stats',
        'AI-powered recaps',
        'Draft recommendations',
      ]),
    );
    expect(PREMIUM_FEATURES).toHaveLength(10);
  });

  it('shows the league cap as one row with limits, not two boolean rows (LS-7394)', () => {
    const leagues = PREMIUM_FEATURES.filter((f) => /leagues?$/i.test(f.label));
    expect(leagues.map((f) => f.label)).toContain('Active leagues');
    expect(PREMIUM_FEATURES.map((f) => f.label)).not.toContain(
      'Join up to 3 leagues',
    );
    const row = PREMIUM_FEATURES.find((f) => f.label === 'Active leagues');
    expect(row).toMatchObject({ free: 'Up to 3', premium: 'Unlimited' });
  });

  it('advertises advanced stats and projections in one row (LS-10462)', () => {
    const row = PREMIUM_FEATURES.find((f) => f.label === 'Stats');
    expect(row).toMatchObject({
      free: 'Basic',
      premium: 'Advanced + Projections',
    });
    expect(row && premiumFeatureBenefitLabel(row)).toBe(
      'Advanced stats + projections',
    );
    expect(PREMIUM_FEATURES.map((f) => f.label)).not.toContain(
      'Advanced projections',
    );
  });

  it('never gives the Free tier something Premium lacks', () => {
    expect(PREMIUM_FEATURES.every((f) => f.premium !== false)).toBe(true);
  });
});

describe('premiumFeatureBenefitLabel', () => {
  it('prefers lossLabel and falls back to the comparison label', () => {
    expect(
      premiumFeatureBenefitLabel({
        label: 'Active leagues',
        free: 'Up to 3',
        premium: 'Unlimited',
        lossLabel: 'Unlimited active leagues',
      }),
    ).toBe('Unlimited active leagues');
    expect(
      premiumFeatureBenefitLabel({
        label: 'FAAB waivers',
        free: false,
        premium: true,
      }),
    ).toBe('FAAB waivers');
  });
});
