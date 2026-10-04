import { PREMIUM_FEATURES as CANONICAL_PREMIUM_FEATURES } from '@legacy-sports/shared-components/premium-features';
import { PREMIUM_FEATURES } from './constants';

describe('subscription constants', () => {
  it('re-exports the canonical premium feature list instead of a local copy (LS-7393)', () => {
    expect(PREMIUM_FEATURES).toBe(CANONICAL_PREMIUM_FEATURES);
  });
});
