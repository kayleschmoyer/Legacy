/**
 * Unit tests: requireEntitlement(premium_draft_controls) gate on setDraftOrder +
 * randomizeDraftOrder (LS-5014, migrated from the raw-tier requirePremium check
 * to the Stripe entitlement model by LS-8807).
 *
 * Verifies that both mutations reject unauthenticated callers and callers
 * without the entitlement before any database writes occur.
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
 * requireEntitlement -> hasEntitlement reads the memoized gating row
 * (context.db.select({tier, entitlementsUpdatedAt}).from().where().limit(1))
 * to check token freshness, then checks context.user.entitlements for the
 * key. Omitting entitlementsUpdatedAt yields a null marker, which skips the
 * staleness check entirely — the tests below aren't exercising that path.
 */
function makeCtx({ hasEntitlement = false } = {}) {
  return {
    user: {
      id: 1,
      username: 'testuser',
      entitlements: hasEntitlement ? ['premium_draft_controls'] : [],
      iat: Math.floor(Date.now() / 1000),
    },
    db: {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([]),
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

describe('setDraftOrder — entitlement gate (LS-8807)', () => {
  it('rejects a caller without premium_draft_controls with a premium-required error', async () => {
    const { setDraftOrder } = captureResolvers();
    const ctx = makeCtx({ hasEntitlement: false });

    await expect(
      setDraftOrder(null, { draftId: 1, teamIds: [1, 2] }, ctx),
    ).rejects.toMatchObject({ extensions: { code: 'PREMIUM_REQUIRED' } });
  });

  it('allows a caller with premium_draft_controls past the gate (proceeds to mutation logic)', async () => {
    const { setDraftOrder } = captureResolvers();
    const ctx = makeCtx({ hasEntitlement: true });

    // requireEntitlement passes; the transaction mock throws "Draft not
    // found" — confirming the call advanced past the entitlement gate.
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

describe('randomizeDraftOrder — entitlement gate (LS-8807)', () => {
  it('rejects a caller without premium_draft_controls with a premium-required error', async () => {
    const { randomizeDraftOrder } = captureResolvers();
    const ctx = makeCtx({ hasEntitlement: false });

    await expect(
      randomizeDraftOrder(null, { draftId: 1 }, ctx),
    ).rejects.toMatchObject({ extensions: { code: 'PREMIUM_REQUIRED' } });
  });

  it('allows a caller with premium_draft_controls past the gate (proceeds to mutation logic)', async () => {
    const { randomizeDraftOrder } = captureResolvers();
    const ctx = makeCtx({ hasEntitlement: true });

    // requireEntitlement passes; the transaction mock throws "Draft not
    // found" — confirming the call advanced past the entitlement gate.
    await expect(
      randomizeDraftOrder(null, { draftId: 1 }, ctx),
    ).rejects.toThrow(/Draft not found/i);
  });
});

export {};
