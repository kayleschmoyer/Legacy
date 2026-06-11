/**
 * Unit truth table for the shared `resolveOrCreateUser` resolver (LS-7823).
 *
 * Exercises every branch of the multi-provider sign-in flow, per provider
 * (discord / google / apple): returning identity (fast path), brand-new user,
 * safe auto-link of a password-less email owner, and each conflict path
 * (password account, unverified email, owner already has the provider,
 * ambiguous email owner). Also covers canonical-email rule #3 (refresh only
 * from the source provider, skip on collision) and the legacy `discord_*`
 * dual-write. The db-client primitives are mocked so the resolver's control
 * flow is verified in isolation.
 */
import {
  createIdentity,
  createUser,
  getIdentityByProviderAccount,
  getIdentityByUserProvider,
  getUserByCanonicalEmailOrIdentityEmail,
  getUserByEmail,
  getUserById,
  InternalUser,
  InternalUserIdentity,
  linkDiscordAccount,
  linkIdentity,
  setCanonicalEmail,
  touchIdentityOnLogin,
} from '@legacy-sports/db-client';
import { OAuthProvider, resolveOrCreateUser } from './resolveOrCreateUser';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/db-client', () => ({
  createIdentity: jest.fn(),
  createUser: jest.fn(),
  getIdentityByProviderAccount: jest.fn(),
  getIdentityByUserProvider: jest.fn(),
  getUserByCanonicalEmailOrIdentityEmail: jest.fn(),
  getUserByEmail: jest.fn(),
  getUserById: jest.fn(),
  linkDiscordAccount: jest.fn(),
  linkIdentity: jest.fn(),
  setCanonicalEmail: jest.fn(),
  touchIdentityOnLogin: jest.fn().mockResolvedValue(undefined),
}));

const mockGetIdentity = getIdentityByProviderAccount as jest.Mock;
const mockGetIdentityByUserProvider = getIdentityByUserProvider as jest.Mock;
const mockGetUserById = getUserById as jest.Mock;
const mockGetUserByEmail = getUserByEmail as jest.Mock;
const mockEmailOwner = getUserByCanonicalEmailOrIdentityEmail as jest.Mock;
const mockLinkIdentity = linkIdentity as jest.Mock;
const mockCreateUser = createUser as jest.Mock;
const mockCreateIdentity = createIdentity as jest.Mock;
const mockSetCanonicalEmail = setCanonicalEmail as jest.Mock;
const mockTouchIdentity = touchIdentityOnLogin as jest.Mock;
const mockLinkDiscord = linkDiscordAccount as jest.Mock;

// A minimal fake DB handle — the resolver never touches it directly, it only
// passes it to the (mocked) db-client primitives.
const db = {} as never;

function makeUser(overrides: Partial<InternalUser> = {}): InternalUser {
  return {
    id: 1,
    username: 'user',
    canonicalEmail: 'user@example.com',
    passwordHash: null,
    accessLevel: 'none',
    privacyPolicyAcceptedAt: null,
    avatarUrl: null,
    subscriptionTier: 'free',
    discordId: null,
    discordUsername: null,
    discordAvatar: null,
    themePreference: null,
    lastLoginAt: null,
    mfaEnabled: false,
    canonicalEmailSource: null,
    passwordResetToken: null,
    passwordResetExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as InternalUser;
}

function makeIdentity(
  overrides: Partial<InternalUserIdentity> = {},
): InternalUserIdentity {
  return {
    id: 10,
    userId: 1,
    provider: 'google',
    providerAccountId: 'sub-1',
    providerEmail: 'user@example.com',
    providerEmailVerified: true,
    providerUsername: null,
    providerAvatar: null,
    linkedAt: new Date(),
    lastLoginAt: null,
    ...overrides,
  } as InternalUserIdentity;
}

beforeEach(() => {
  jest.clearAllMocks();
});

const PROVIDERS: OAuthProvider[] = ['discord', 'google', 'apple'];

describe('resolveOrCreateUser truth table', () => {
  describe.each(PROVIDERS)('provider=%s', (provider) => {
    it('returning identity → fast path, refreshes identity, returns user', async () => {
      const user = makeUser({ id: 7 });
      mockGetIdentity.mockResolvedValue(
        makeIdentity({ id: 99, userId: 7, provider }),
      );
      mockGetUserById.mockResolvedValue(user);

      const result = await resolveOrCreateUser(db, {
        provider,
        providerAccountId: 'acct-1',
        providerEmail: 'user@example.com',
        emailVerified: true,
      });

      expect(result).toEqual({
        status: 'ok',
        user,
        outcome: 'returning_identity',
      });
      expect(mockTouchIdentity).toHaveBeenCalledWith(
        db,
        99,
        expect.objectContaining({ providerEmail: 'user@example.com' }),
      );
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('brand-new user → creates user + identity, sets canonical source', async () => {
      mockGetIdentity.mockResolvedValue(null);
      mockEmailOwner.mockResolvedValue({ user: null, ambiguous: false });
      const created = makeUser({ id: 42, canonicalEmail: 'new@example.com' });
      mockCreateUser.mockResolvedValue(created);
      mockSetCanonicalEmail.mockResolvedValue(
        makeUser({
          id: 42,
          canonicalEmail: 'new@example.com',
          canonicalEmailSource: provider,
        }),
      );

      const result = await resolveOrCreateUser(db, {
        provider,
        providerAccountId: 'acct-new',
        providerEmail: 'new@example.com',
        emailVerified: true,
        meta: { providerUsername: 'newbie' },
      });

      expect(result.status).toBe('ok');
      if (result.status === 'ok') expect(result.outcome).toBe('new_user');
      expect(mockCreateUser).toHaveBeenCalledWith(db, 'new@example.com');
      expect(mockSetCanonicalEmail).toHaveBeenCalledWith(
        db,
        42,
        'new@example.com',
        provider,
      );
      expect(mockCreateIdentity).toHaveBeenCalledWith(
        db,
        expect.objectContaining({ provider, providerAccountId: 'acct-new' }),
      );
    });

    it('verified email owner, password-less, no provider identity → auto-link', async () => {
      mockGetIdentity.mockResolvedValue(null);
      const owner = makeUser({ id: 5, passwordHash: null });
      mockEmailOwner.mockResolvedValue({ user: owner, ambiguous: false });
      mockGetIdentityByUserProvider.mockResolvedValue(null);
      mockLinkIdentity.mockResolvedValue({
        ok: true,
        identity: makeIdentity(),
      });

      const result = await resolveOrCreateUser(db, {
        provider,
        providerAccountId: 'acct-2',
        providerEmail: 'user@example.com',
        emailVerified: true,
      });

      expect(result.status).toBe('ok');
      if (result.status === 'ok') expect(result.outcome).toBe('auto_linked');
      expect(mockLinkIdentity).toHaveBeenCalled();
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('email owner has a password → conflict (LS-6695 takeover guard)', async () => {
      mockGetIdentity.mockResolvedValue(null);
      mockEmailOwner.mockResolvedValue({
        user: makeUser({ id: 5, passwordHash: 'hash' }),
        ambiguous: false,
      });
      mockGetIdentityByUserProvider.mockResolvedValue(null);

      const result = await resolveOrCreateUser(db, {
        provider,
        providerAccountId: 'acct-3',
        providerEmail: 'user@example.com',
        emailVerified: true,
      });

      expect(result).toEqual({ status: 'conflict' });
      expect(mockLinkIdentity).not.toHaveBeenCalled();
    });

    it('unverified email match → conflict (no auto-link on unverified)', async () => {
      mockGetIdentity.mockResolvedValue(null);
      mockEmailOwner.mockResolvedValue({
        user: makeUser({ id: 5, passwordHash: null }),
        ambiguous: false,
      });
      mockGetIdentityByUserProvider.mockResolvedValue(null);

      const result = await resolveOrCreateUser(db, {
        provider,
        providerAccountId: 'acct-4',
        providerEmail: 'user@example.com',
        emailVerified: false,
      });

      expect(result).toEqual({ status: 'conflict' });
    });

    it('owner already has a different identity for this provider → conflict', async () => {
      mockGetIdentity.mockResolvedValue(null);
      mockEmailOwner.mockResolvedValue({
        user: makeUser({ id: 5, passwordHash: null }),
        ambiguous: false,
      });
      mockGetIdentityByUserProvider.mockResolvedValue(
        makeIdentity({ provider, providerAccountId: 'other-account' }),
      );

      const result = await resolveOrCreateUser(db, {
        provider,
        providerAccountId: 'acct-5',
        providerEmail: 'user@example.com',
        emailVerified: true,
      });

      expect(result).toEqual({ status: 'conflict' });
    });

    it('ambiguous email owner → conflict (fail closed)', async () => {
      mockGetIdentity.mockResolvedValue(null);
      mockEmailOwner.mockResolvedValue({ user: null, ambiguous: true });

      const result = await resolveOrCreateUser(db, {
        provider,
        providerAccountId: 'acct-6',
        providerEmail: 'shared@example.com',
        emailVerified: true,
      });

      expect(result).toEqual({ status: 'conflict' });
    });
  });
});

describe('canonical-email rule #3', () => {
  it('refreshes canonical email when the source provider reports a new verified email', async () => {
    const user = makeUser({
      id: 7,
      canonicalEmail: 'old@example.com',
      canonicalEmailSource: 'google',
    });
    mockGetIdentity.mockResolvedValue(
      makeIdentity({ userId: 7, provider: 'google' }),
    );
    mockGetUserById.mockResolvedValue(user);
    mockGetUserByEmail.mockResolvedValue(null); // no collision
    mockSetCanonicalEmail.mockResolvedValue(
      makeUser({
        id: 7,
        canonicalEmail: 'new@example.com',
        canonicalEmailSource: 'google',
      }),
    );

    const result = await resolveOrCreateUser(db, {
      provider: 'google',
      providerAccountId: 'sub-1',
      providerEmail: 'new@example.com',
      emailVerified: true,
    });

    expect(mockSetCanonicalEmail).toHaveBeenCalledWith(
      db,
      7,
      'new@example.com',
      'google',
    );
    expect(result.status).toBe('ok');
  });

  it('does NOT refresh when the reporting provider is not the canonical source', async () => {
    const user = makeUser({
      id: 7,
      canonicalEmail: 'old@example.com',
      canonicalEmailSource: 'discord', // canonical tracks Discord, not Google
    });
    mockGetIdentity.mockResolvedValue(
      makeIdentity({ userId: 7, provider: 'google' }),
    );
    mockGetUserById.mockResolvedValue(user);

    await resolveOrCreateUser(db, {
      provider: 'google',
      providerAccountId: 'sub-1',
      providerEmail: 'new@example.com',
      emailVerified: true,
    });

    expect(mockSetCanonicalEmail).not.toHaveBeenCalled();
  });

  it('skips the refresh when another account already owns the new email', async () => {
    const user = makeUser({
      id: 7,
      canonicalEmail: 'old@example.com',
      canonicalEmailSource: 'google',
    });
    mockGetIdentity.mockResolvedValue(
      makeIdentity({ userId: 7, provider: 'google' }),
    );
    mockGetUserById.mockResolvedValue(user);
    mockGetUserByEmail.mockResolvedValue(makeUser({ id: 99 })); // collision

    await resolveOrCreateUser(db, {
      provider: 'google',
      providerAccountId: 'sub-1',
      providerEmail: 'taken@example.com',
      emailVerified: true,
    });

    expect(mockSetCanonicalEmail).not.toHaveBeenCalled();
  });
});

describe('Discord legacy-column dual-write', () => {
  it('syncs users.discord_* on a new Discord user', async () => {
    mockGetIdentity.mockResolvedValue(null);
    mockEmailOwner.mockResolvedValue({ user: null, ambiguous: false });
    const created = makeUser({ id: 3, canonicalEmail: 'd@example.com' });
    mockCreateUser.mockResolvedValue(created);
    mockSetCanonicalEmail.mockResolvedValue(
      makeUser({ id: 3, canonicalEmailSource: 'discord' }),
    );

    await resolveOrCreateUser(db, {
      provider: 'discord',
      providerAccountId: 'snowflake-1',
      providerEmail: 'd@example.com',
      emailVerified: true,
      meta: { providerUsername: 'duser', providerAvatar: 'avatarhash' },
    });

    expect(mockLinkDiscord).toHaveBeenCalledWith(
      db,
      3,
      'snowflake-1',
      'duser',
      'avatarhash',
    );
  });

  it('does not dual-write for non-Discord providers', async () => {
    mockGetIdentity.mockResolvedValue(null);
    mockEmailOwner.mockResolvedValue({ user: null, ambiguous: false });
    mockCreateUser.mockResolvedValue(makeUser({ id: 3 }));
    mockSetCanonicalEmail.mockResolvedValue(makeUser({ id: 3 }));

    await resolveOrCreateUser(db, {
      provider: 'google',
      providerAccountId: 'sub-x',
      providerEmail: 'g@example.com',
      emailVerified: true,
    });

    expect(mockLinkDiscord).not.toHaveBeenCalled();
  });
});
