/**
 * Tests for fresh-from-Stripe entitlement validation (LS-8643).
 *
 * These helpers ignore the token's entitlement claim and read the customer's
 * live Stripe entitlements, for sensitive/irreversible operations tied to a paid
 * capability (epic LS-8638 SHARED CONTRACTS #2).
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/db-client', () =>
  mockDbClientModule({
    createDatabaseService: jest.fn(),
    PublicSchema: {},
    InternalSchema: {
      subscriptions: {
        userId: 'app_internal.subscriptions.user_id',
        stripeCustomerId: 'app_internal.subscriptions.stripe_customer_id',
        createdAt: 'app_internal.subscriptions.created_at',
        id: 'app_internal.subscriptions.id',
      },
    },
  }),
);

const mockList = jest.fn();
jest.mock('../server/stripe', () => ({
  getStripeClient: jest.fn(async () => ({
    entitlements: { activeEntitlements: { list: mockList } },
  })),
}));

import { ENTITLEMENTS } from '@legacy-sports/utils';
import {
  hasFreshEntitlement,
  requireFreshEntitlement,
} from './fresh-entitlements';
import { getStripeClient } from '../server/stripe';

const mockedGetStripeClient = getStripeClient as jest.MockedFunction<
  typeof getStripeClient
>;

// Stub the Stripe active-entitlements auto-pagination with a sync generator —
// a valid async-iterable source for `for await...of`, matching how
// fetchActiveEntitlements consumes the SDK list result.
function stripeYields(lookupKeys: Array<string | null>): void {
  mockList.mockImplementation(function* () {
    for (const lookup_key of lookupKeys) yield { lookup_key };
  });
}

function makeContext(
  user: Record<string, unknown> | null,
  customerId: string | null,
  impersonatedTier?: 'free',
) {
  const mockDb = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          orderBy: jest.fn(() => ({
            limit: jest
              .fn()
              .mockResolvedValue(
                customerId === null ? [] : [{ stripeCustomerId: customerId }],
              ),
          })),
        })),
      })),
    })),
  };
  return {
    user,
    db: mockDb,
    loaders: {},
    isSystemRequest: false,
    impersonatedTier,
  };
}

describe('fresh-from-Stripe entitlement validation (LS-8643)', () => {
  beforeEach(() => jest.clearAllMocks());

  const freeUser = { id: 1, isAdmin: false };
  const adminUser = { id: 2, isAdmin: true };

  describe('hasFreshEntitlement', () => {
    it('returns true when live Stripe grants the entitlement', async () => {
      stripeYields([ENTITLEMENTS.salary_cap_leagues]);
      const ctx = makeContext(freeUser, 'cus_123');
      await expect(
        hasFreshEntitlement(ctx as any, ENTITLEMENTS.salary_cap_leagues),
      ).resolves.toBe(true);
    });

    it('returns false when live Stripe does NOT grant the entitlement', async () => {
      stripeYields([ENTITLEMENTS.trade_analyzer]);
      const ctx = makeContext(freeUser, 'cus_123');
      await expect(
        hasFreshEntitlement(ctx as any, ENTITLEMENTS.salary_cap_leagues),
      ).resolves.toBe(false);
    });

    it('ignores the token claim — a stale claim does not grant access', async () => {
      // The token claim says the user has salary_cap_leagues, but live Stripe
      // has revoked it. Fresh validation must reflect Stripe, not the claim.
      stripeYields([]);
      const staleClaimUser = {
        id: 1,
        isAdmin: false,
        entitlements: [ENTITLEMENTS.salary_cap_leagues],
      };
      const ctx = makeContext(staleClaimUser, 'cus_123');
      await expect(
        hasFreshEntitlement(ctx as any, ENTITLEMENTS.salary_cap_leagues),
      ).resolves.toBe(false);
    });

    it('returns false without calling Stripe when the user has no customer', async () => {
      stripeYields([ENTITLEMENTS.salary_cap_leagues]);
      const ctx = makeContext(freeUser, null);
      await expect(
        hasFreshEntitlement(ctx as any, ENTITLEMENTS.salary_cap_leagues),
      ).resolves.toBe(false);
      expect(mockedGetStripeClient).not.toHaveBeenCalled();
    });

    it('admins are all-entitled without hitting Stripe', async () => {
      const ctx = makeContext(adminUser, 'cus_admin');
      await expect(
        hasFreshEntitlement(ctx as any, ENTITLEMENTS.salary_cap_leagues),
      ).resolves.toBe(true);
      expect(mockedGetStripeClient).not.toHaveBeenCalled();
    });

    it('admin impersonating the free tier is validated against Stripe', async () => {
      stripeYields([]);
      const ctx = makeContext(adminUser, 'cus_admin', 'free');
      await expect(
        hasFreshEntitlement(ctx as any, ENTITLEMENTS.salary_cap_leagues),
      ).resolves.toBe(false);
    });

    it('throws UNAUTHENTICATED when there is no user', async () => {
      const ctx = makeContext(null, null);
      await expect(
        hasFreshEntitlement(ctx as any, ENTITLEMENTS.salary_cap_leagues),
      ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    });
  });

  describe('requireFreshEntitlement', () => {
    it('resolves when Stripe grants the entitlement', async () => {
      stripeYields([ENTITLEMENTS.faab_waiver_type]);
      const ctx = makeContext(freeUser, 'cus_123');
      await expect(
        requireFreshEntitlement(ctx as any, ENTITLEMENTS.faab_waiver_type),
      ).resolves.toBeUndefined();
    });

    it('throws PREMIUM_REQUIRED when Stripe does not grant it', async () => {
      stripeYields([]);
      const ctx = makeContext(freeUser, 'cus_123');
      await expect(
        requireFreshEntitlement(ctx as any, ENTITLEMENTS.faab_waiver_type),
      ).rejects.toMatchObject({ extensions: { code: 'PREMIUM_REQUIRED' } });
    });

    it('uses a custom message when provided', async () => {
      stripeYields([]);
      const ctx = makeContext(freeUser, 'cus_123');
      await expect(
        requireFreshEntitlement(
          ctx as any,
          ENTITLEMENTS.faab_waiver_type,
          'Custom upgrade copy',
        ),
      ).rejects.toMatchObject({
        message: 'Custom upgrade copy',
        extensions: { code: 'PREMIUM_REQUIRED' },
      });
    });
  });
});

export {};
