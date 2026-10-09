/**
 * Unit tests for applyTierChangeSideEffects (LS-7397) — the single home of the
 * tier-change side-effect policy shared by stripe-webhook, apple-iap and db.
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockHandleSubscriptionDowngrade = jest.fn<Promise<void>, unknown[]>();
const mockClearLeagueTierFreezes = jest.fn<Promise<void>, unknown[]>();

jest.mock('./SubscriptionDowngradeService', () => ({
  handleSubscriptionDowngrade: (...args: unknown[]) =>
    mockHandleSubscriptionDowngrade(...args),
  clearLeagueTierFreezes: (...args: unknown[]) =>
    mockClearLeagueTierFreezes(...args),
}));

import { applyTierChangeSideEffects } from './TierChangeSideEffectsService';

const DB_OPTIONS = { region: 'test' } as never;

describe('applyTierChangeSideEffects', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHandleSubscriptionDowngrade.mockResolvedValue(undefined);
    mockClearLeagueTierFreezes.mockResolvedValue(undefined);
  });

  it.each([
    ['free', 'free'],
    ['premium', 'premium'],
  ] as const)(
    'is a no-op when the tier is unchanged (%s → %s)',
    async (prev, next) => {
      await applyTierChangeSideEffects(1, prev, next, DB_OPTIONS);

      expect(mockHandleSubscriptionDowngrade).not.toHaveBeenCalled();
      expect(mockClearLeagueTierFreezes).not.toHaveBeenCalled();
    },
  );

  it('runs the downgrade handler on premium → free', async () => {
    await applyTierChangeSideEffects(7, 'premium', 'free', DB_OPTIONS);

    expect(mockHandleSubscriptionDowngrade).toHaveBeenCalledTimes(1);
    expect(mockHandleSubscriptionDowngrade).toHaveBeenCalledWith(7, DB_OPTIONS);
    expect(mockClearLeagueTierFreezes).not.toHaveBeenCalled();
  });

  it('runs the downgrade handler when the previous tier is unknown (null → free)', async () => {
    await applyTierChangeSideEffects(8, null, 'free', DB_OPTIONS);

    expect(mockHandleSubscriptionDowngrade).toHaveBeenCalledWith(8, DB_OPTIONS);
  });

  it('clears tier freezes on free → premium', async () => {
    await applyTierChangeSideEffects(9, 'free', 'premium', DB_OPTIONS);

    expect(mockClearLeagueTierFreezes).toHaveBeenCalledTimes(1);
    expect(mockClearLeagueTierFreezes).toHaveBeenCalledWith(9, DB_OPTIONS);
    expect(mockHandleSubscriptionDowngrade).not.toHaveBeenCalled();
  });

  it('is a no-op on null → premium', async () => {
    await applyTierChangeSideEffects(10, null, 'premium', DB_OPTIONS);

    expect(mockHandleSubscriptionDowngrade).not.toHaveBeenCalled();
    expect(mockClearLeagueTierFreezes).not.toHaveBeenCalled();
  });
});
