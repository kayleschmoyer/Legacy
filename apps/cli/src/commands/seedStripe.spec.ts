import type Stripe from 'stripe';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import {
  assertTestModeKey,
  handleSeedStripe,
  PRICES,
  seedStripe,
} from './seedStripe';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Derived from the production sources so the test cannot drift: entitlement
// lookup keys come from @legacy-sports/utils (the single source of truth the
// command imports), and price lookup keys/amounts come from the command's PRICES.
const ENTITLEMENT_KEYS = Object.values(ENTITLEMENTS);

const PRICE_LOOKUP_KEYS: Record<string, { unit_amount: number }> =
  Object.fromEntries(
    PRICES.map((p) => [p.lookup_key, { unit_amount: p.unit_amount }]),
  );

/**
 * Build a jest-spied Stripe mock. When `existing` is true every lookup returns
 * a matching object so the seed skips creation; when false every lookup is
 * empty so the seed creates everything.
 */
function makeStripeMock(existing: boolean) {
  const featureId = (key: string) => `feat_${key}`;
  const productId = 'prod_premium';

  const features = {
    list: jest.fn(({ lookup_key }: { lookup_key: string }) =>
      Promise.resolve({
        data: existing ? [{ id: featureId(lookup_key), lookup_key }] : [],
      }),
    ),
    create: jest.fn(({ lookup_key }: { lookup_key: string }) =>
      Promise.resolve({ id: featureId(lookup_key), lookup_key }),
    ),
  };

  const product = {
    id: productId,
    active: true,
    metadata: { legacy_sports_product: 'premium' },
  };

  // products.list returns Stripe's auto-pagination async iterable.
  const productsList = jest.fn(() => {
    const items = existing ? [product] : [];
    return {
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        for (const item of items) {
          yield item;
        }
      },
    };
  });

  const products = {
    list: productsList,
    create: jest.fn(() => Promise.resolve(product)),
    listFeatures: jest.fn(() =>
      Promise.resolve({
        data: existing
          ? ENTITLEMENT_KEYS.map((key) => ({
              entitlement_feature: { id: featureId(key) },
            }))
          : [],
      }),
    ),
    createFeature: jest.fn(() => Promise.resolve({})),
  };

  const prices = {
    list: jest.fn(({ lookup_keys }: { lookup_keys: string[] }) => {
      const key = lookup_keys[0];
      return Promise.resolve({
        data:
          existing && PRICE_LOOKUP_KEYS[key]
            ? [
                {
                  id: `price_${key}`,
                  active: true,
                  unit_amount: PRICE_LOOKUP_KEYS[key].unit_amount,
                  recurring: {
                    interval: key === 'premium_annual' ? 'year' : 'month',
                  },
                  product: productId,
                },
              ]
            : [],
      });
    }),
    create: jest.fn(({ lookup_key }: { lookup_key: string }) =>
      Promise.resolve({ id: `price_${lookup_key}`, unit_amount: 0 }),
    ),
  };

  const mock = {
    entitlements: { features },
    products,
    prices,
  };

  return { mock: mock as unknown as Stripe, features, products, prices };
}

describe('assertTestModeKey', () => {
  it('throws when the key is missing', () => {
    expect(() => assertTestModeKey(undefined)).toThrow(
      /STRIPE_SECRET_KEY is not set/,
    );
  });

  it('refuses a live-mode key', () => {
    expect(() => assertTestModeKey('sk_live_abc123')).toThrow(
      /Refusing to run against a live-mode key/,
    );
  });

  it('accepts and returns a test-mode key', () => {
    expect(assertTestModeKey('sk_test_abc123')).toBe('sk_test_abc123');
  });
});

describe('handleSeedStripe live-key refusal', () => {
  const original = process.env['STRIPE_SECRET_KEY'];
  afterEach(() => {
    if (original === undefined) {
      delete process.env['STRIPE_SECRET_KEY'];
    } else {
      process.env['STRIPE_SECRET_KEY'] = original;
    }
  });

  it('aborts before doing any work against a live-mode key', async () => {
    process.env['STRIPE_SECRET_KEY'] = 'sk_live_dangerous';
    await expect(handleSeedStripe()).rejects.toThrow(
      /Refusing to run against a live-mode key/,
    );
  });

  it('aborts when STRIPE_SECRET_KEY is unset', async () => {
    delete process.env['STRIPE_SECRET_KEY'];
    await expect(handleSeedStripe()).rejects.toThrow(
      /STRIPE_SECRET_KEY is not set/,
    );
  });
});

describe('seedStripe idempotency', () => {
  it('creates features, product, and prices when none exist', async () => {
    const { mock, features, products, prices } = makeStripeMock(false);

    const result = await seedStripe(mock);

    expect(features.create).toHaveBeenCalledTimes(ENTITLEMENT_KEYS.length);
    expect(products.create).toHaveBeenCalledTimes(1);
    expect(products.createFeature).toHaveBeenCalledTimes(
      ENTITLEMENT_KEYS.length,
    );
    expect(prices.create).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      monthlyPriceId: 'price_premium_monthly',
      annualPriceId: 'price_premium_annual',
    });
  });

  it('skips creation when every object already exists', async () => {
    const { mock, features, products, prices } = makeStripeMock(true);

    const result = await seedStripe(mock);

    expect(features.create).not.toHaveBeenCalled();
    expect(products.create).not.toHaveBeenCalled();
    expect(products.createFeature).not.toHaveBeenCalled();
    expect(prices.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      monthlyPriceId: 'price_premium_monthly',
      annualPriceId: 'price_premium_annual',
    });
  });
});
