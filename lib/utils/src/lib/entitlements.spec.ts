import { isPremiumFromTier } from './entitlements';

describe('isPremiumFromTier', () => {
  it("returns true only for the 'premium' tier", () => {
    expect(isPremiumFromTier('premium')).toBe(true);
  });

  it.each(['free', '', 'Premium', 'past_due'])(
    'returns false for %p',
    (tier) => {
      expect(isPremiumFromTier(tier)).toBe(false);
    },
  );

  it('returns false for null and undefined', () => {
    expect(isPremiumFromTier(null)).toBe(false);
    expect(isPremiumFromTier(undefined)).toBe(false);
  });
});
