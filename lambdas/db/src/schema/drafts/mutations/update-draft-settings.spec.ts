/**
 * Unit tests for updateDraftSettings entitlement gates (LS-5017, LS-8807)
 *
 * Verifies that auction_draft and historical_era_filters entitlements are
 * enforced before any DB writes — mirroring the identical gate in
 * createLeagueAndTeams (LS-5159).
 *
 * Draft settings became a blanket premium-only feature in LS-5014 (migrated
 * from the raw-tier requirePremium check to requireEntitlement against
 * premium_draft_controls by LS-8807), checked after the ownership/draft-status
 * guards but before the granular auction/era-filter entitlement checks above.
 * A caller without premium_draft_controls therefore never reaches those
 * granular checks — the "free era filter" cases below run as a premium user
 * to isolate what they actually verify: that a free-tier-safe era value
 * doesn't spuriously trip requireEntitlement.
 */

import { ENTITLEMENTS } from '@legacy-sports/utils';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

interface MakeCtxOptions {
  userId?: number;
  tier?: 'free' | 'premium';
  leagueOwner?: number;
  leagueSport?: string;
  leagueRosterContinuity?: string;
  entitlements?: string[];
}

/** Build a minimal context that simulates a free-tier commissioner. */
function makeCtx({
  userId = 1,
  tier = 'free',
  leagueOwner = 1,
  leagueSport = 'baseball',
  leagueRosterContinuity = 'redraft',
  // Both the blanket LS-5014/LS-8807 gate (premium_draft_controls) and the
  // granular auction_draft / historical_era_filters gates (LS-5017) go
  // through requireEntitlement/hasEntitlement, which read the JWT-claim-
  // derived context.user.entitlements (LS-8643) — default premium callers to
  // holding every entitlement exercised by this file's test cases.
  entitlements = tier === 'premium'
    ? [
        ENTITLEMENTS.premium_draft_controls,
        ENTITLEMENTS.auction_draft,
        ENTITLEMENTS.historical_era_filters,
      ]
    : [],
}: MakeCtxOptions = {}) {
  const league = {
    id: 10,
    owner: leagueOwner,
    draftStatus: 'not-started',
    sport: leagueSport,
    rosterContinuity: leagueRosterContinuity,
    playerPool: 'all',
    eraFilter: 'all',
    baseballHofOnly: false,
    customEraStartYear: null,
    customEraEndYear: null,
  };

  const leagueSelectMock = jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([league]),
      }),
    }),
  });
  const tierSelectMock = jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([{ tier }]),
      }),
    }),
  });
  const draftSelectMock = jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([]),
      }),
    }),
  });

  // The resolver issues several differently-shaped `db.select(columns)` calls
  // (league lookup, subscription-tier lookup(s), draft-record lookup) whose
  // relative order shifts with guard ordering and which fields are set on
  // the input — route by the requested column shape instead of call count.
  const db = {
    select: jest.fn((columns?: Record<string, unknown>) => {
      if (columns && 'tier' in columns) return tierSelectMock();
      if (columns && 'owner' in columns) return leagueSelectMock();
      return draftSelectMock();
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ playerPool: 'all' }]),
        }),
      }),
    }),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([
          {
            id: 99,
            leagueId: 10,
            draftMode: 'live',
            selectionMethod: 'standard',
            draftOrder: 'snake',
            pickTimeLimitSeconds: 120,
            scheduledAt: null,
          },
        ]),
      }),
    }),
  };

  return {
    user: { id: userId, username: 'testuser', entitlements },
    db,
    notificationService: null,
  };
}

function captureResolver() {
  jest.resetModules();
  let capturedFn:
    | ((_p: unknown, args: unknown, ctx: unknown) => Promise<unknown>)
    | undefined;

  // Universally callable/chainable no-op: `require('./update-draft-settings')`
  // below loads the FULL schema graph (drafts/types -> leagues/types -> scoring,
  // statistics, ...) as a side effect, and every one of those files invokes
  // arbitrary `builder.*`/`t.*` methods at module-top-level to register their
  // (unrelated) GraphQL types. Hand-picking a fixed method list here breaks
  // every time the schema graph grows a call this mock doesn't know about
  // (LS-8598) — auto-stubbing avoids the whack-a-mole.
  function autoStub(): unknown {
    return new Proxy(() => autoStub(), { get: () => autoStub() });
  }

  jest.doMock('../../builder', () => ({
    builder: new Proxy(
      {
        mutationField: jest.fn((_name: string, fn: (t: unknown) => void) => {
          fn({
            field: (opts: {
              resolve: (
                _p: unknown,
                args: unknown,
                ctx: unknown,
              ) => Promise<unknown>;
            }) => {
              capturedFn = opts.resolve;
            },
            arg: autoStub(),
          });
        }),
      },
      {
        get: (target, prop) =>
          prop in target ? target[prop as keyof typeof target] : autoStub(),
      },
    ),
  }));

  jest.doMock('@legacy-sports/utils/node', () => ({
    getDbOptions: jest.fn(() => ({})),
  }));

  require('./update-draft-settings');

  if (!capturedFn) throw new Error('resolver not captured');
  return capturedFn;
}

describe('updateDraftSettings — entitlement gates (LS-5017)', () => {
  it('blocks a free-tier user from setting selectionMethod=auction', async () => {
    const resolve = captureResolver();
    const ctx = makeCtx({ tier: 'free' });

    await expect(
      resolve(
        null,
        {
          input: {
            leagueId: 10,
            selectionMethod: 'auction',
          },
        },
        ctx,
      ),
    ).rejects.toThrow(/premium/i);
  });

  it('allows a premium user to set selectionMethod=auction', async () => {
    const resolve = captureResolver();
    const ctx = makeCtx({ tier: 'premium' });

    await expect(
      resolve(
        null,
        {
          input: {
            leagueId: 10,
            selectionMethod: 'auction',
          },
        },
        ctx,
      ),
    ).resolves.toBeDefined();
  });

  it('blocks a free-tier user from setting a premium era filter (dead_ball)', async () => {
    const resolve = captureResolver();
    const ctx = makeCtx({ tier: 'free' });

    await expect(
      resolve(
        null,
        {
          input: {
            leagueId: 10,
            eraFilter: 'dead_ball',
          },
        },
        ctx,
      ),
    ).rejects.toThrow(/premium/i);
  });

  // Draft settings are blanket premium-gated (LS-5014), so a free-tier caller
  // never reaches the era-filter entitlement check at all — these run as a
  // premium user to isolate what they actually verify: a free-tier-safe era
  // value doesn't spuriously trip requireEntitlement(historical_era_filters).
  it('does not require the era-filter entitlement for the free era filter (all)', async () => {
    const resolve = captureResolver();
    const ctx = makeCtx({ tier: 'premium' });

    await expect(
      resolve(
        null,
        {
          input: {
            leagueId: 10,
            eraFilter: 'all',
          },
        },
        ctx,
      ),
    ).resolves.toBeDefined();
  });

  it('does not require the era-filter entitlement for the free era filter (modern)', async () => {
    const resolve = captureResolver();
    const ctx = makeCtx({ tier: 'premium' });

    await expect(
      resolve(
        null,
        {
          input: {
            leagueId: 10,
            eraFilter: 'modern',
          },
        },
        ctx,
      ),
    ).resolves.toBeDefined();
  });
});

describe('updateDraftSettings — reverse_standings draft order (LS-8929)', () => {
  it('rejects draftOrder=reverse_standings for a redraft league', async () => {
    const resolve = captureResolver();
    const ctx = makeCtx({ tier: 'premium', leagueRosterContinuity: 'redraft' });

    await expect(
      resolve(
        null,
        { input: { leagueId: 10, draftOrder: 'reverse_standings' } },
        ctx,
      ),
    ).rejects.toThrow(/keeper leagues/i);
  });

  it('allows draftOrder=reverse_standings for a keeper league', async () => {
    const resolve = captureResolver();
    const ctx = makeCtx({ tier: 'premium', leagueRosterContinuity: 'keeper' });

    await expect(
      resolve(
        null,
        { input: { leagueId: 10, draftOrder: 'reverse_standings' } },
        ctx,
      ),
    ).resolves.toBeDefined();
  });
});

describe('updateDraftSettings — authentication guard', () => {
  it('throws AuthenticationError when context.user is null', async () => {
    const resolve = captureResolver();
    const ctx = { ...makeCtx(), user: null };

    await expect(
      resolve(
        null,
        { input: { leagueId: 10, selectionMethod: 'standard' } },
        ctx,
      ),
    ).rejects.toThrow(/Authentication required/i);
  });
});

describe('updateDraftSettings — authorization guard', () => {
  it('throws ForbiddenError when the calling user is not the league owner', async () => {
    const resolve = captureResolver();
    // userId=2 but league owner is 1
    const ctx = makeCtx({ userId: 2, leagueOwner: 1 });

    await expect(
      resolve(
        null,
        { input: { leagueId: 10, selectionMethod: 'standard' } },
        ctx,
      ),
    ).rejects.toThrow(/General Manager/i);
  });
});

describe('updateDraftSettings — draft-status guard', () => {
  it('throws UserInputError when draftStatus is not "not-started"', async () => {
    const resolve = captureResolver();
    // Build a context where the league draftStatus is 'in-progress'
    const league = {
      id: 10,
      owner: 1,
      draftStatus: 'in-progress',
      sport: 'baseball',
      playerPool: 'all',
      eraFilter: 'all',
      baseballHofOnly: false,
      customEraStartYear: null,
      customEraEndYear: null,
    };
    const selectMock = jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([league]),
        }),
      }),
    });
    const ctx = {
      user: { id: 1, username: 'owner' },
      db: { select: selectMock },
      notificationService: null,
    };

    await expect(
      resolve(null, { input: { leagueId: 10, draftMode: 'live' } }, ctx),
    ).rejects.toThrow(/cannot be changed after/i);
  });
});

describe('updateDraftSettings — league chat system message (LS-9217, AC3)', () => {
  it('posts a draft_settings system message to league chat on successful update', async () => {
    const resolve = captureResolver();
    const notifyLeagueChatMessage = jest.fn().mockResolvedValue(undefined);
    const ctx = makeCtx({ tier: 'premium' });
    (ctx as { notificationService: unknown }).notificationService = {
      notifyLeagueChatMessage,
    };

    await resolve(null, { input: { leagueId: 10, draftOrder: 'linear' } }, ctx);

    // makeCtx's db.insert() always returns the same fixed mock object, so
    // re-invoking it here yields the identical `values` jest.fn used
    // internally by the resolver — safe to inspect its recorded calls.
    const valuesMock = (ctx.db as any).insert().values;
    const draftSettingsCall = valuesMock.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as Record<string, unknown>)?.messageType === 'draft_settings',
    );

    expect(draftSettingsCall).toBeDefined();
    expect(draftSettingsCall[0]).toMatchObject({
      leagueId: 10,
      userId: null,
      messageType: 'draft_settings',
    });

    expect(notifyLeagueChatMessage).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        leagueId: 10,
        messageType: 'draft_settings',
      }),
    );
  });
});

describe('updateDraftSettings — commissioner audit log (LS-10736)', () => {
  it('writes an update_draft_settings audit row with the changed fields', async () => {
    const resolve = captureResolver();
    const ctx = makeCtx({ tier: 'premium', userId: 7, leagueOwner: 7 });

    await resolve(null, { input: { leagueId: 10, draftOrder: 'linear' } }, ctx);

    const valuesFn = ctx.db.insert.mock.results[0].value.values as jest.Mock;
    const auditCall = valuesFn.mock.calls.find(
      (call: unknown[]) =>
        (call[0] as Record<string, unknown>)?.action ===
        'update_draft_settings',
    );

    expect(auditCall?.[0]).toEqual({
      leagueId: 10,
      userId: 7,
      action: 'update_draft_settings',
      targetType: 'draft',
      targetId: 99,
      details: { changes: ['order → linear'] },
      reason: null,
    });
  });
});

describe('updateDraftSettings — drafts insert (LS-10318)', () => {
  // drafts.status/created_by/sport are NOT NULL with no column default, so the
  // insert path must supply them explicitly (Rollbar #288).
  it('supplies status, createdBy and sport when it has to create the draft row', async () => {
    const resolve = captureResolver();
    const ctx = makeCtx({ tier: 'premium', userId: 7, leagueOwner: 7 });

    await resolve(
      null,
      { input: { leagueId: 10, draftMode: 'automated' } },
      ctx,
    );

    const valuesFn = ctx.db.insert.mock.results[0].value.values as jest.Mock;
    expect(valuesFn.mock.calls[0][0]).toMatchObject({
      leagueId: 10,
      status: 'not-started',
      createdBy: 7,
      sport: 'baseball',
    });
  });
});

export {};
