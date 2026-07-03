import { linkIdentity, unlinkIdentity } from '@legacy-sports/db-client';
import { linkProviderIdentity, unlinkProviderIdentity } from './IdentityLink';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/db-client', () => ({
  linkIdentity: jest.fn(),
  unlinkIdentity: jest.fn(),
}));

const mockLinkIdentity = linkIdentity as jest.Mock;
const mockUnlinkIdentity = unlinkIdentity as jest.Mock;

const db = {} as never;

beforeEach(() => jest.clearAllMocks());

describe('linkProviderIdentity', () => {
  it('returns a generic 409 when the provider account is taken (no enumeration)', async () => {
    mockLinkIdentity.mockResolvedValue({
      ok: false,
      reason: 'PROVIDER_ACCOUNT_TAKEN',
    });

    const result = await linkProviderIdentity(db, 1, {
      provider: 'google',
      providerAccountId: 'sub-1',
      providerEmail: 'a@example.com',
      emailVerified: true,
    });

    expect(result).toEqual({
      ok: false,
      statusCode: 409,
      message: 'Could not link google account',
    });
  });

  it('returns 409 when the user already has that provider linked', async () => {
    mockLinkIdentity.mockResolvedValue({ ok: false, reason: 'ALREADY_LINKED' });

    const result = await linkProviderIdentity(db, 1, {
      provider: 'apple',
      providerAccountId: 'sub-2',
      providerEmail: null,
      emailVerified: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.statusCode).toBe(409);
      expect(result.message).toMatch(/already linked/i);
    }
  });

  it('maps the identity tuple onto linkIdentity and succeeds', async () => {
    mockLinkIdentity.mockResolvedValue({ ok: true, identity: {} });

    const result = await linkProviderIdentity(db, 7, {
      provider: 'discord',
      providerAccountId: 'snowflake',
      providerEmail: 'd@example.com',
      emailVerified: true,
      providerUsername: 'duser',
      providerAvatar: 'hash',
    });

    expect(result).toEqual({ ok: true });
    expect(mockLinkIdentity).toHaveBeenCalledWith(db, {
      userId: 7,
      provider: 'discord',
      providerAccountId: 'snowflake',
      providerEmail: 'd@example.com',
      providerEmailVerified: true,
      providerUsername: 'duser',
      providerAvatar: 'hash',
    });
  });
});

describe('unlinkProviderIdentity', () => {
  it('maps NOT_LINKED to 400', async () => {
    mockUnlinkIdentity.mockResolvedValue({ ok: false, reason: 'NOT_LINKED' });

    const result = await unlinkProviderIdentity(db, 1, 'google');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.statusCode).toBe(400);
  });

  it('maps the last-identity reachability guard to 409', async () => {
    mockUnlinkIdentity.mockResolvedValue({
      ok: false,
      reason: 'LAST_IDENTITY',
    });

    const result = await unlinkProviderIdentity(db, 1, 'google');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.statusCode).toBe(409);
      expect(result.message).toMatch(/only sign-in method/i);
    }
  });

  it('succeeds when the identity is unlinked', async () => {
    mockUnlinkIdentity.mockResolvedValue({ ok: true, rederived: false });

    const result = await unlinkProviderIdentity(db, 9, 'discord');

    expect(result).toEqual({ ok: true });
    expect(mockUnlinkIdentity).toHaveBeenCalledWith(db, 9, 'discord');
  });
});
