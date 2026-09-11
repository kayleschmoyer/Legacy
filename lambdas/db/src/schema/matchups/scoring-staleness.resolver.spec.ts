/**
 * Resolver-level tests for the Matchup.scoringIsStale field (LS-9665).
 *
 * The staleness rule itself is unit-tested in db-client
 * (`scoring-staleness.spec.ts`); what these tests pin is the wiring: the field
 * resolves through the league-keyed DataLoader rather than issuing its own
 * query (AC6), and it feeds the rule the right inputs — in particular
 * `hasPersistedScore`, which is what makes an unplayed matchup resolve to null
 * instead of being badged stale (AC5's never-scored case).
 */

const isScoringStale = jest.fn();

/** Capture every field resolver on the Matchup object type. */
async function captureMatchupResolvers(): Promise<
  Record<string, (...args: unknown[]) => unknown>
> {
  jest.resetModules();
  const captured: Record<string, { resolve?: (...a: unknown[]) => unknown }> =
    {};

  // `t` stub: every method returns its first argument, so `t.boolean(opts)`
  // yields the opts object (with `.resolve`).
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
    PublicSchema: {
      matchupPlayers: { matchupId: 'matchupId' },
      matchups: { id: 'id' },
    },
    isScoringStale,
  }));

  jest.doMock('drizzle-orm', () => ({ eq: jest.fn() }));

  // `types.ts` imports `./winProbability`, which pulls in `../scoring` and its
  // module-level `createDatabaseService(getDbOptions())` call. Stub the module
  // so importing the type definitions does not try to build a real DB service.
  jest.doMock('./winProbability', () => ({
    MatchupWinProbabilityType: {},
    resolveMatchupWinProbability: jest.fn(),
  }));

  jest.doMock('../leagues/types', () => ({ Team: {} }));
  jest.doMock('../statistics', () => ({
    GameBattingRef: {},
    GameFieldingRef: {},
    GamePitchingRef: {},
    SeasonBattingRef: {},
    SeasonFieldingRef: {},
    SeasonPitchingRef: {},
  }));
  jest.doMock('../authorization', () => ({ hasEntitlement: jest.fn() }));
  jest.doMock('../entitlements', () => ({ ENTITLEMENTS: {} }));

  await import('./types');
  const resolvers: Record<string, (...args: unknown[]) => unknown> = {};
  for (const [field, opts] of Object.entries(captured)) {
    if (opts.resolve) resolvers[field] = opts.resolve;
  }
  return resolvers;
}

async function captureScoringIsStaleResolver(): Promise<
  (...args: unknown[]) => Promise<unknown>
> {
  const resolvers = await captureMatchupResolvers();
  const resolver = resolvers.scoringIsStale;
  if (!resolver) {
    throw new Error('scoringIsStale field resolver was not captured');
  }
  return resolver as (...args: unknown[]) => Promise<unknown>;
}

const SCORED_AT = new Date('2026-08-01T00:00:00.000Z');
const CHANGED_AT = new Date('2026-08-02T00:00:00.000Z');

const matchup = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  leagueId: 5,
  team1Score: '10.00',
  team2Score: '8.00',
  scoredAt: SCORED_AT,
  ...overrides,
});

const makeContext = (loaded: Date | null) => {
  const load = jest.fn().mockResolvedValue(loaded);
  return {
    ctx: {
      loaders: { latestScoringChangeAt: { load } },
      db: { select: jest.fn(), update: jest.fn() },
    },
    load,
  };
};

describe('Matchup.scoringIsStale field', () => {
  beforeEach(() => {
    isScoringStale.mockReset();
    isScoringStale.mockReturnValue(false);
  });

  it('resolves through the league-keyed loader and issues no query of its own', async () => {
    const resolve = await captureScoringIsStaleResolver();
    const { ctx, load } = makeContext(CHANGED_AT);

    await resolve(matchup(), {}, ctx);

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(5);
    expect(ctx.db.select).not.toHaveBeenCalled();
  });

  it('passes the loaded change timestamp and the row scoredAt to the rule', async () => {
    const resolve = await captureScoringIsStaleResolver();
    const { ctx } = makeContext(CHANGED_AT);
    isScoringStale.mockReturnValue(true);

    await expect(resolve(matchup(), {}, ctx)).resolves.toBe(true);

    expect(isScoringStale).toHaveBeenCalledWith({
      scoredAt: SCORED_AT,
      lastScoringChangeAt: CHANGED_AT,
      hasPersistedScore: true,
    });
  });

  it('reports hasPersistedScore false when neither team has a score', async () => {
    const resolve = await captureScoringIsStaleResolver();
    const { ctx } = makeContext(null);
    isScoringStale.mockReturnValue(null);

    await expect(
      resolve(
        matchup({ team1Score: null, team2Score: null, scoredAt: null }),
        {},
        ctx,
      ),
    ).resolves.toBeNull();

    expect(isScoringStale).toHaveBeenCalledWith({
      scoredAt: null,
      lastScoringChangeAt: null,
      hasPersistedScore: false,
    });
  });

  it('reports hasPersistedScore true when only one team has a score', async () => {
    const resolve = await captureScoringIsStaleResolver();
    const { ctx } = makeContext(null);

    await resolve(matchup({ team2Score: null }), {}, ctx);

    expect(isScoringStale).toHaveBeenCalledWith(
      expect.objectContaining({ hasPersistedScore: true }),
    );
  });

  it('treats a zero score as a persisted score, not a missing one', async () => {
    const resolve = await captureScoringIsStaleResolver();
    const { ctx } = makeContext(null);

    await resolve(matchup({ team1Score: '0.00', team2Score: '0.00' }), {}, ctx);

    expect(isScoringStale).toHaveBeenCalledWith(
      expect.objectContaining({ hasPersistedScore: true }),
    );
  });
});

/**
 * Resolver-level tests for Matchup.scoringChangeLog (LS-9667) — the
 * stale-scoring indicator's "what changed and when" interaction.
 */
describe('Matchup.scoringChangeLog field', () => {
  const entry = (overrides: Record<string, unknown> = {}) => ({
    statDisplayName: 'Home Run',
    previousMultiplier: 2.5,
    newMultiplier: 4,
    changedAt: CHANGED_AT,
    changedByUsername: 'commish_alice',
    ...overrides,
  });

  const makeChangeLogContext = (entries: ReturnType<typeof entry>[]) => {
    const load = jest.fn().mockResolvedValue(entries);
    return {
      ctx: { loaders: { scoringChangeLog: { load } } },
      load,
    };
  };

  it('returns an empty array without querying when the matchup has no persisted score', async () => {
    const resolvers = await captureMatchupResolvers();
    const { ctx, load } = makeChangeLogContext([entry()]);

    await expect(
      resolvers.scoringChangeLog(
        matchup({ team1Score: null, team2Score: null, scoredAt: null }),
        {},
        ctx,
      ),
    ).resolves.toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  it('resolves through the league-keyed loader for a scored matchup', async () => {
    const resolvers = await captureMatchupResolvers();
    const { ctx, load } = makeChangeLogContext([entry()]);

    await resolvers.scoringChangeLog(matchup(), {}, ctx);

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(5);
  });

  it('filters out entries that predate scoredAt', async () => {
    const resolvers = await captureMatchupResolvers();
    const before = entry({
      statDisplayName: 'Old change',
      changedAt: new Date('2026-07-01T00:00:00.000Z'), // before SCORED_AT
    });
    const after = entry({
      statDisplayName: 'Recent change',
      changedAt: CHANGED_AT, // after SCORED_AT
    });
    const { ctx } = makeChangeLogContext([after, before]);

    await expect(
      resolvers.scoringChangeLog(matchup(), {}, ctx),
    ).resolves.toEqual([after]);
  });

  it('returns every entry when scoredAt is null (score predates provenance)', async () => {
    const resolvers = await captureMatchupResolvers();
    const entries = [entry(), entry({ statDisplayName: 'Another stat' })];
    const { ctx } = makeChangeLogContext(entries);

    await expect(
      resolvers.scoringChangeLog(matchup({ scoredAt: null }), {}, ctx),
    ).resolves.toEqual(entries);
  });
});

// Marks this file as a module (it uses only dynamic import + jest.doMock),
// matching the sibling resolver specs. See import/unambiguous.
export {};
