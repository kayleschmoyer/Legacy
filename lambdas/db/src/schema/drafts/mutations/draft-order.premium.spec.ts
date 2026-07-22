/**
 * Unit tests: requirePremium gate on setDraftOrder + randomizeDraftOrder (LS-5014)
 *
 * Verifies that both mutations reject unauthenticated callers and free-tier
 * users before any database writes occur.
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

type ResolverFn = (
  _parent: unknown,
  args: unknown,
  ctx: unknown,
) => Promise<unknown>;

/** Capture both mutation resolvers from draft-order.ts. */
function captureResolvers(): {
  setDraftOrder: ResolverFn;
  randomizeDraftOrder: ResolverFn;
} {
  jest.resetModules();

  const captured: Record<string, ResolverFn> = {};

  jest.doMock('../../builder', () => ({
    builder: {
      objectRef: jest.fn(() => ({ implement: jest.fn() })),
      inputType: jest.fn(() => ({ implement: jest.fn() })),
      objectType: jest.fn(),
      queryField: jest.fn(),
      mutationField: jest.fn((name: string, fn: (t: unknown) => void) => {
        fn({
          field: (opts: { resolve: ResolverFn }) => {
            captured[name] = opts.resolve;
          },
          arg: { int: jest.fn(() => ({})), intList: jest.fn(() => ({})) },
        });
      }),
    },
  }));

  jest.doMock('@legacy-sports/utils/node', () => ({
    getDbOptions: jest.fn(() => ({})),
  }));

  // Stub the types module to avoid the transitive scoring.ts → builder.enumType
  // call chain that fails in a mocked builder environment.
  jest.doMock('../types', () => ({ Draft: {} }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
  require('./draft-order');

  if (!captured['setDraftOrder']) throw new Error('setDraftOrder not captured');
  if (!captured['randomizeDraftOrder'])
    throw new Error('randomizeDraftOrder not captured');

  return {
    setDraftOrder: captured['setDraftOrder'],
    randomizeDraftOrder: captured['randomizeDraftOrder'],
  };
}

/**
 * Build a minimal context.
 *
 * requirePremium calls context.db.select().from().where().limit(1) and checks
 * rows[0]?.tier.  Returning an empty array causes tier to fall back to 'free'
 * and requirePremium to throw PremiumRequiredError.
 * Returning [{ tier: 'premium' }] lets the call proceed.
 */
function makeCtx({ subscriptionTier = 'free' } = {}) {
  const tierRows = subscriptionTier === 'premium' ? [{ tier: 'premium' }] : [];

  return {
    user: { id: 1, username: 'testuser' },
    db: {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(tierRows),
          }),
        }),
      }),
      transaction: jest.fn().mockRejectedValue(new Error('Draft not found')),
    },
    notificationService: null,
  };
}

// ── setDraftOrder ─────────────────────────────────────────────────────────────

describe('setDraftOrder — authentication guard (LS-5014)', () => {
  it('throws AuthenticationError when context.user is null', async () => {
    const { setDraftOrder } = captureResolvers();
    const ctx = { ...makeCtx(), user: null };

    await expect(
      setDraftOrder(null, { draftId: 1, teamIds: [1, 2] }, ctx),
    ).rejects.toThrow(/Authentication required/i);
  });
});

describe('setDraftOrder — premium gate (LS-5014)', () => {
  it('rejects a free-tier user with a premium-required error', async () => {
    const { setDraftOrder } = captureResolvers();
    const ctx = makeCtx({ subscriptionTier: 'free' });

    await expect(
      setDraftOrder(null, { draftId: 1, teamIds: [1, 2] }, ctx),
    ).rejects.toThrow(/premium/i);
  });

  it('allows a premium user past the gate (proceeds to mutation logic)', async () => {
    const { setDraftOrder } = captureResolvers();
    const ctx = makeCtx({ subscriptionTier: 'premium' });

    // requirePremium passes; the transaction mock throws "Draft not found" —
    // confirming the call advanced past the premium gate.
    await expect(
      setDraftOrder(null, { draftId: 1, teamIds: [1, 2] }, ctx),
    ).rejects.toThrow(/Draft not found/i);
  });
});

// ── randomizeDraftOrder ───────────────────────────────────────────────────────

describe('randomizeDraftOrder — authentication guard (LS-5014)', () => {
  it('throws AuthenticationError when context.user is null', async () => {
    const { randomizeDraftOrder } = captureResolvers();
    const ctx = { ...makeCtx(), user: null };

    await expect(
      randomizeDraftOrder(null, { draftId: 1 }, ctx),
    ).rejects.toThrow(/Authentication required/i);
  });
});

describe('randomizeDraftOrder — premium gate (LS-5014)', () => {
  it('rejects a free-tier user with a premium-required error', async () => {
    const { randomizeDraftOrder } = captureResolvers();
    const ctx = makeCtx({ subscriptionTier: 'free' });

    await expect(
      randomizeDraftOrder(null, { draftId: 1 }, ctx),
    ).rejects.toThrow(/premium/i);
  });

  it('allows a premium user past the gate (proceeds to mutation logic)', async () => {
    const { randomizeDraftOrder } = captureResolvers();
    const ctx = makeCtx({ subscriptionTier: 'premium' });

    // requirePremium passes; the transaction mock throws "Draft not found" —
    // confirming the call advanced past the premium gate.
    await expect(
      randomizeDraftOrder(null, { draftId: 1 }, ctx),
    ).rejects.toThrow(/Draft not found/i);
  });
});

export {};
