/**
 * Resolver-level entitlement tests for the Matchup.recap field.
 *
 * AI matchup recaps are a Premium feature (ENTITLEMENTS.ai_matchup_recap). The
 * field is nullable and gated server-side as defense-in-depth behind the UI
 * PremiumGate: an unauthenticated or free-tier caller gets `null` instead of the
 * generated narrative (vs. throwing, so the parent `matchup` query stays intact).
 *
 * Gate order in the resolver:
 *   1. Not a completed two-team matchup → null (before any auth/entitlement work).
 *   2. No authenticated user → null.
 *   3. Lacks ai_matchup_recap entitlement → null (no team/DB loads happen).
 *   4. Entitled → proceeds to load teams + players.
 */

const hasEntitlement = jest.fn();

/** Capture the Matchup object type's field resolvers (incl. `recap`). */
async function captureRecapResolver(): Promise<
  (...args: unknown[]) => Promise<unknown>
> {
  jest.resetModules();
  const captured: Record<string, { resolve?: (...a: unknown[]) => unknown }> =
    {};

  // `t` stub: every method returns its first argument, so `t.field(opts)`
  // yields the opts object (with `.resolve`) and the fields function's return
  // value is a map of fieldName → opts.
  const tStub = new Proxy({}, { get: () => (arg: unknown) => arg });

  const captureFields = (opts?: { fields?: (t: unknown) => unknown }) => {
    if (opts?.fields) {
      Object.assign(captured, opts.fields(tStub) as Record<string, unknown>);
    }
  };

  jest.doMock('../builder', () => ({
    builder: {
      enumType: () => ({}),
      inputType: () => ({}),
      objectRef: () => ({ implement: (opts: never) => captureFields(opts) }),
      objectType: (_ref: unknown, opts: never) => captureFields(opts),
    },
  }));

  jest.doMock('@legacy-sports/logging', () => ({
    LOGGER: {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  }));

  jest.doMock('@legacy-sports/narrative', () => ({
    generateMatchupRecap: jest.fn(),
  }));

  jest.doMock('@legacy-sports/db-client', () => ({
    PublicSchema: { matchupPlayers: { matchupId: 'matchupId' } },
  }));

  jest.doMock('drizzle-orm', () => ({ eq: jest.fn() }));

  jest.doMock('../leagues/types', () => ({ Team: {} }));

  jest.doMock('../statistics', () => ({
    GameBattingRef: {},
    GameFieldingRef: {},
    GamePitchingRef: {},
    SeasonBattingRef: {},
    SeasonFieldingRef: {},
    SeasonPitchingRef: {},
  }));

  jest.doMock('../authorization', () => ({ hasEntitlement }));

  jest.doMock('../entitlements', () => ({
    ENTITLEMENTS: { ai_matchup_recap: 'ai_matchup_recap' },
  }));

  await import('./types');
  const recap = captured.recap?.resolve;
  if (!recap) throw new Error('recap field resolver was not captured');
  return recap as (...args: unknown[]) => Promise<unknown>;
}

const COMPLETED = {
  id: 1,
  status: 'completed',
  team1Id: 1,
  team2Id: 2,
  leagueId: 5,
  weekNumber: 3,
};

function makeContext(user: unknown) {
  const teamsLoad = jest.fn().mockResolvedValue({ id: 1, name: 'Team' });
  return {
    ctx: {
      user,
      loaders: { teams: { load: teamsLoad } },
      db: {
        select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
      },
    },
    teamsLoad,
  };
}

describe('Matchup.recap field — entitlement gate', () => {
  beforeEach(() => {
    hasEntitlement.mockReset();
  });

  it('returns null for non-completed matchups without checking entitlement', async () => {
    const recap = await captureRecapResolver();
    const { ctx } = makeContext({ id: 1 });
    await expect(
      recap({ ...COMPLETED, status: 'in_progress' }, {}, ctx),
    ).resolves.toBeNull();
    expect(hasEntitlement).not.toHaveBeenCalled();
  });

  it('returns null for unauthenticated callers', async () => {
    const recap = await captureRecapResolver();
    const { ctx, teamsLoad } = makeContext(null);
    await expect(recap(COMPLETED, {}, ctx)).resolves.toBeNull();
    expect(hasEntitlement).not.toHaveBeenCalled();
    expect(teamsLoad).not.toHaveBeenCalled();
  });

  it('returns null for free-tier callers and never loads recap data', async () => {
    const recap = await captureRecapResolver();
    hasEntitlement.mockResolvedValue(false);
    const { ctx, teamsLoad } = makeContext({ id: 7 });

    await expect(recap(COMPLETED, {}, ctx)).resolves.toBeNull();
    expect(hasEntitlement).toHaveBeenCalledWith(ctx, 'ai_matchup_recap');
    expect(teamsLoad).not.toHaveBeenCalled();
  });

  it('lets entitled callers past the gate (loads teams)', async () => {
    const recap = await captureRecapResolver();
    hasEntitlement.mockResolvedValue(true);
    const { ctx, teamsLoad } = makeContext({ id: 7 });

    // Empty players DB → resolver still returns null, but only AFTER passing the
    // gate and loading teams; teamsLoad being called proves the gate let it by.
    await expect(recap(COMPLETED, {}, ctx)).resolves.toBeNull();
    expect(hasEntitlement).toHaveBeenCalledWith(ctx, 'ai_matchup_recap');
    expect(teamsLoad).toHaveBeenCalled();
  });
});
