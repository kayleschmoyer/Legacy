import { ENTITLEMENTS } from '@legacy-sports/utils';
import { fetchActiveEntitlements, isEntitlementKey } from './entitlements';
import { getStripeClient } from './stripe';

jest.mock('./stripe', () => ({
  getStripeClient: jest.fn(),
}));

const mockedGetStripeClient = getStripeClient as jest.MockedFunction<
  typeof getStripeClient
>;

/**
 * Build a fake Stripe client whose entitlements.activeEntitlements.list yields
 * the given lookup_keys via an async iterator (matching the SDK's
 * auto-pagination contract used by fetchActiveEntitlements).
 */
function stubStripeWithEntitlements(
  lookupKeys: Array<string | null | undefined>,
): jest.Mock {
  // A sync generator is a valid async-iterable source for `for await...of`,
  // matching how fetchActiveEntitlements consumes the Stripe SDK list result.
  const list = jest.fn(function* () {
    for (const lookupKey of lookupKeys) {
      yield { lookup_key: lookupKey };
    }
  });
  mockedGetStripeClient.mockResolvedValue({
    entitlements: { activeEntitlements: { list } },
  } as never);
  return list;
}

describe('isEntitlementKey', () => {
  it('accepts a known catalog key', () => {
    expect(isEntitlementKey(ENTITLEMENTS.salary_cap_leagues)).toBe(true);
  });

  it.each([null, undefined, '', 'not_a_real_entitlement'])(
    'rejects %p',
    (key) => {
      expect(isEntitlementKey(key)).toBe(false);
    },
  );
});

describe('fetchActiveEntitlements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns [] for a null customer without calling Stripe', async () => {
    const list = stubStripeWithEntitlements([]);
    const result = await fetchActiveEntitlements(null);
    expect(result).toEqual([]);
    expect(mockedGetStripeClient).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('returns the catalog keys the customer holds', async () => {
    stubStripeWithEntitlements([
      ENTITLEMENTS.salary_cap_leagues,
      ENTITLEMENTS.trade_analyzer,
    ]);
    const result = await fetchActiveEntitlements('cus_123');
    expect(result).toEqual([
      ENTITLEMENTS.salary_cap_leagues,
      ENTITLEMENTS.trade_analyzer,
    ]);
  });

  it('filters out lookup_keys that are not in the code catalog', async () => {
    stubStripeWithEntitlements([
      ENTITLEMENTS.optimal_lineup,
      'legacy_feature_removed_from_catalog',
      null,
    ]);
    const result = await fetchActiveEntitlements('cus_456');
    expect(result).toEqual([ENTITLEMENTS.optimal_lineup]);
  });

  it('collects entitlements across multiple pages (auto-pagination)', async () => {
    // Simulate a customer holding the full catalog spread across pages — the
    // async iterator hides page boundaries, so every yielded item is collected.
    const allKeys = Object.values(ENTITLEMENTS);
    const list = stubStripeWithEntitlements(allKeys);
    const result = await fetchActiveEntitlements('cus_789');
    expect(result).toEqual(allKeys);
    expect(list).toHaveBeenCalledWith({ customer: 'cus_789', limit: 100 });
  });

  it('returns [] when the customer has no active entitlements', async () => {
    stubStripeWithEntitlements([]);
    const result = await fetchActiveEntitlements('cus_none');
    expect(result).toEqual([]);
  });
});
