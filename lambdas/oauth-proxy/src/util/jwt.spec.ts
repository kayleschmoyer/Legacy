import { decode, verify } from 'jsonwebtoken';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  readSecret: jest.fn().mockResolvedValue('test-secret'),
}));

jest.mock('./db', () => ({
  getStripeCustomerId: jest.fn().mockResolvedValue(null),
}));

jest.mock('./entitlements', () => ({
  fetchActiveEntitlements: jest.fn().mockResolvedValue([]),
}));

import { type EntitlementKey, ENTITLEMENTS } from '@legacy-sports/utils';
import type { InternalUser } from '@legacy-sports/db-client';
import { createJwt, resolveEntitlements } from './jwt';
import { getStripeCustomerId } from './db';
import { fetchActiveEntitlements } from './entitlements';

const mockedGetStripeCustomerId = getStripeCustomerId as jest.MockedFunction<
  typeof getStripeCustomerId
>;
const mockedFetchActiveEntitlements =
  fetchActiveEntitlements as jest.MockedFunction<
    typeof fetchActiveEntitlements
  >;

describe('createJwt — algorithm pinning (LS-2544)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetStripeCustomerId.mockResolvedValue(null);
    mockedFetchActiveEntitlements.mockResolvedValue([]);
  });

  const user = {
    id: 42,
    accessLevel: 'none',
    canonicalEmail: 'u@example.com',
    username: 'u',
    avatarUrl: null,
    passwordHash: null,
    privacyPolicyAcceptedAt: null,
    subscriptionTier: 'free' as const,
    discordId: null,
    discordUsername: null,
    discordAvatar: null,
    googleId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as InternalUser;

  it('embeds subscriptionTier in the JWT payload', async () => {
    const token = await createJwt(user);
    const payload = decode(token) as Record<string, unknown>;
    expect(payload['subscriptionTier']).toBe('free');
  });

  it('embeds hasPassword=false for OAuth-only accounts (no password hash)', async () => {
    const token = await createJwt(user);
    const payload = decode(token) as Record<string, unknown>;
    expect(payload['hasPassword']).toBe(false);
  });

  it('embeds hasPassword=true when the user has a stored password hash', async () => {
    const token = await createJwt({
      ...user,
      passwordHash: 'hashed-password',
    });
    const payload = decode(token) as Record<string, unknown>;
    expect(payload['hasPassword']).toBe(true);
  });

  it('signs tokens with the HS256 algorithm', async () => {
    const token = await createJwt(user);
    const header = decode(token, { complete: true })?.header;
    expect(header?.alg).toBe('HS256');
  });

  it('verifies successfully under an HS256 allowlist', async () => {
    const token = await createJwt(user);
    expect(() =>
      verify(token, 'test-secret', { algorithms: ['HS256'] }),
    ).not.toThrow();
  });

  it("rejects a forged 'alg: none' token when verified with an algorithm allowlist", () => {
    // Hand-crafted unsigned JWT — header { alg: 'none', typ: 'JWT' }, no signature
    const header = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ id: 42, accessLevel: 'admin' }),
    ).toString('base64url');
    const forged = `${header}.${payload}.`;

    expect(() =>
      verify(forged, 'test-secret', { algorithms: ['HS256'] }),
    ).toThrow();
  });
});

describe('createJwt — entitlements claim (LS-8644)', () => {
  const user = {
    id: 7,
    accessLevel: 'user',
    canonicalEmail: 'p@example.com',
    username: 'p',
    avatarUrl: null,
    passwordHash: null,
    subscriptionTier: 'premium' as const,
  } as unknown as InternalUser;

  const allKeys = Object.values(ENTITLEMENTS) as EntitlementKey[];

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetStripeCustomerId.mockResolvedValue(null);
    mockedFetchActiveEntitlements.mockResolvedValue([]);
  });

  it('embeds the live Stripe entitlements as a plain array claim (AC1/AC5)', async () => {
    mockedGetStripeCustomerId.mockResolvedValue('cus_123');
    mockedFetchActiveEntitlements.mockResolvedValue([
      ENTITLEMENTS.salary_cap_leagues,
      ENTITLEMENTS.trade_analyzer,
    ]);

    const token = await createJwt(user);
    const payload = decode(token) as Record<string, unknown>;
    expect(payload['entitlements']).toEqual([
      ENTITLEMENTS.salary_cap_leagues,
      ENTITLEMENTS.trade_analyzer,
    ]);
    expect(mockedFetchActiveEntitlements).toHaveBeenCalledWith('cus_123');
  });

  it('mints an empty claim for a user with no Stripe customer (AC4)', async () => {
    mockedGetStripeCustomerId.mockResolvedValue(null);

    const token = await createJwt(user);
    const payload = decode(token) as Record<string, unknown>;
    expect(payload['entitlements']).toEqual([]);
    // No Stripe round-trip for a customer-less user.
    expect(mockedFetchActiveEntitlements).not.toHaveBeenCalled();
  });

  it('keeps a full ~23-key entitlement token within cookie/header limits (AC6)', async () => {
    mockedGetStripeCustomerId.mockResolvedValue('cus_full');
    mockedFetchActiveEntitlements.mockResolvedValue(allKeys);

    const token = await createJwt(user, {
      picture: 'https://example.com/a.png',
    });
    const payload = decode(token) as Record<string, unknown>;
    expect(payload['entitlements']).toEqual(allKeys);

    // The full catalog must fit comfortably under the 4KB per-cookie limit
    // (and the ~8KB header limit) so the minted token is always transmittable.
    expect(token.length).toBeLessThan(4096);
  });
});

describe('resolveEntitlements — retry + fallback (LS-8644, LS-8638 RD#1)', () => {
  const user = { id: 9 } as unknown as InternalUser;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetStripeCustomerId.mockResolvedValue('cus_x');
    mockedFetchActiveEntitlements.mockResolvedValue([]);
  });

  it('retries the Stripe read once and succeeds on the second attempt (AC3)', async () => {
    mockedFetchActiveEntitlements
      .mockRejectedValueOnce(new Error('stripe down'))
      .mockResolvedValueOnce([ENTITLEMENTS.optimal_lineup]);

    const result = await resolveEntitlements(user);
    expect(result).toEqual([ENTITLEMENTS.optimal_lineup]);
    expect(mockedFetchActiveEntitlements).toHaveBeenCalledTimes(2);
  });

  it('carries forward the prior claim on persistent failure during refresh (AC3)', async () => {
    mockedFetchActiveEntitlements.mockRejectedValue(new Error('stripe down'));

    const prior = [ENTITLEMENTS.trade_analyzer, ENTITLEMENTS.auction_draft];
    const result = await resolveEntitlements(user, prior);
    expect(result).toEqual(prior);
    expect(mockedFetchActiveEntitlements).toHaveBeenCalledTimes(2);
  });

  it('fails closed to an empty claim on persistent failure at fresh login (AC3)', async () => {
    mockedFetchActiveEntitlements.mockRejectedValue(new Error('stripe down'));

    const result = await resolveEntitlements(user);
    expect(result).toEqual([]);
    expect(mockedFetchActiveEntitlements).toHaveBeenCalledTimes(2);
  });
});
