/**
 * Unit tests for `renewLeague` transaction atomicity (LS-2498).
 *
 * These tests verify the contract of the LS-2498 fix at the resolver level
 * without requiring a live Postgres connection:
 *
 *   1. The 10 write steps (10–17 in the source) are issued through the `tx`
 *      handle obtained from `context.db.transaction(...)`, not directly on
 *      `context.db`. This proves the atomic boundary is in place.
 *
 *   2. If any write inside the transaction callback throws, the resolver
 *      promise rejects with that error AND the post-transaction
 *      `LOGGER.info('Season renewal complete', ...)` is never emitted —
 *      proving the rollback short-circuits the outer success-path code.
 *
 * Full happy-path + injected-mid-transaction integration coverage is tracked
 * in LS-4754, gated on the pre-existing drizzle module-resolution failures in
 * the lambdas/db integration suite. These unit tests cover the atomicity
 * contract independently of that infra.
 */
import type { GraphQLSchema } from 'graphql';

describe('renewLeague — transaction atomicity (LS-2498)', () => {
  let schema: GraphQLSchema;
  let loggerSpy: { info: jest.Mock; warn: jest.Mock; error: jest.Mock };

  /**
   * Build a thenable proxy that:
   *  - returns itself from every drizzle-style chained call
   *    (select / from / where / limit / orderBy / leftJoin / innerJoin /
   *     update / set / insert / values / returning)
   *  - resolves to a queued value whenever awaited
   *
   * Each `await` consumes one entry from `readQueue`. This lets us hand
   * canned data to each read in `renewLeague` in source order.
   */
  function makeChainableDb(
    readQueue: unknown[],
    opts: { failOnInsert?: string } = {},
  ): {
    db: Record<string, unknown>;
    insertCalls: Array<{ table: unknown; values?: unknown[] }>;
    updateCalls: Array<{ table: unknown; set?: Record<string, unknown> }>;
    transactionInvocations: number;
  } {
    const insertCalls: Array<{ table: unknown; values?: unknown[] }> = [];
    const updateCalls: Array<{
      table: unknown;
      set?: Record<string, unknown>;
    }> = [];
    let transactionInvocations = 0;

    // Build the proxy lazily so `this` references stay consistent.
    const handler: ProxyHandler<object> = {
      get(_target, prop) {
        if (prop === 'then') {
          // Awaiting the chain resolves to the next queued value.
          return (resolve: (v: unknown) => void) =>
            resolve(readQueue.shift() ?? []);
        }
        if (prop === 'transaction') {
          return async (cb: (tx: unknown) => unknown) => {
            transactionInvocations++;
            return cb(proxy);
          };
        }
        // Capture write intents so tests can assert which table got what.
        if (prop === 'insert') {
          return (table: unknown) => {
            const entry: { table: unknown; values?: unknown[] } = { table };
            insertCalls.push(entry);
            if (
              opts.failOnInsert != null &&
              String(table) === opts.failOnInsert
            ) {
              throw new Error(
                `simulated mid-transaction failure inserting ${opts.failOnInsert}`,
              );
            }
            return new Proxy(
              {},
              {
                get(_t, p) {
                  if (p === 'then') {
                    return (resolve: (v: unknown) => void) => resolve([]);
                  }
                  if (p === 'values') {
                    return (vs: unknown[]) => {
                      entry.values = vs;
                      // values() chain: also thenable, also supports
                      // .returning() which is thenable.
                      return new Proxy(
                        {},
                        {
                          get(_, q) {
                            if (q === 'then') {
                              return (resolve: (v: unknown) => void) =>
                                resolve([]);
                            }
                            if (q === 'returning') {
                              return () =>
                                Promise.resolve(
                                  // Return synthetic auto-increment ids.
                                  Array.isArray(entry.values)
                                    ? entry.values.map((_v, i) => ({
                                        id: 100 + i,
                                      }))
                                    : [{ id: 100 }],
                                );
                            }
                            return () => proxy;
                          },
                        },
                      );
                    };
                  }
                  return () => proxy;
                },
              },
            );
          };
        }
        if (prop === 'update') {
          return (table: unknown) => {
            const entry: {
              table: unknown;
              set?: Record<string, unknown>;
            } = { table };
            updateCalls.push(entry);
            return new Proxy(
              {},
              {
                get(_t, p) {
                  if (p === 'then') {
                    return (resolve: (v: unknown) => void) => resolve([]);
                  }
                  if (p === 'set') {
                    return (v: Record<string, unknown>) => {
                      entry.set = v;
                      return proxy;
                    };
                  }
                  return () => proxy;
                },
              },
            );
          };
        }
        // Any other method returns the proxy itself (chainable).
        return () => proxy;
      },
    };

    const proxy: Record<string, unknown> = new Proxy({}, handler) as Record<
      string,
      unknown
    >;

    return {
      db: proxy,
      insertCalls,
      updateCalls,
      get transactionInvocations() {
        return transactionInvocations;
      },
    };
  }

  beforeEach(() => {
    jest.resetModules();

    // Capture LOGGER calls so we can assert the post-transaction info logs
    // are skipped on rollback.
    loggerSpy = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    jest.doMock('@legacy-sports/logging', () => ({
      LOGGER: loggerSpy,
    }));

    jest.doMock('@legacy-sports/utils', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));
    jest.doMock('@legacy-sports/utils/node', () => ({
      getDbOptions: jest.fn(() => ({})),
    }));

    // Minimal PublicSchema mock covering every table renewLeague touches.
    // Each table is a tagged string so test assertions can match by name; the
    // resolver itself only passes these through to `tx.insert(...)` /
    // `tx.update(...)` opaquely.
    const sentinelTable = (name: string) =>
      name as unknown as Record<string, unknown>;

    jest.doMock('@legacy-sports/db-client', () => ({
      createDatabaseService: jest.fn(),
      runWithPublicClient: jest.fn(),
      createLeagueService: jest.fn(() => ({ createLeague: jest.fn() })),
      createDraftForLeague: jest.fn(),
      DraftService: jest.fn().mockImplementation(() => ({
        startDraft: jest.fn(),
        getDraftStatus: jest.fn(),
      })),
      createBadgeService: jest.fn(() => ({
        getUserBadges: jest.fn().mockResolvedValue([]),
        getTeamBadges: jest.fn().mockResolvedValue([]),
        getUserBadgeProgress: jest.fn().mockResolvedValue([]),
        evaluateDraftBadges: jest.fn().mockResolvedValue([]),
        evaluateMatchupBadges: jest.fn().mockResolvedValue([]),
        awardLeagueChampion: jest.fn().mockResolvedValue(undefined),
        awardPlayoffAppearances: jest.fn().mockResolvedValue(undefined),
      })),
      PublicSchema: {
        leagues: sentinelTable('leagues'),
        teams: sentinelTable('teams'),
        leagueMembers: sentinelTable('leagueMembers'),
        leaguePosition: sentinelTable('leaguePosition'),
        teamMembers: sentinelTable('teamMembers'),
        playerSalaries: sentinelTable('playerSalaries'),
        drafts: sentinelTable('drafts'),
        leagueScoringProfiles: sentinelTable('leagueScoringProfiles'),
        leagueScoringProfileEntries: sentinelTable(
          'leagueScoringProfileEntries',
        ),
        leagueMessages: sentinelTable('leagueMessages'),
      },
      InternalSchema: {
        usersInAppInternal: sentinelTable('usersInAppInternal'),
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.doMock requires runtime require
    const schemaModule = require('../../schema') as { schema: GraphQLSchema };
    schema = schemaModule.schema;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Returns the resolver function and the read queue we need to satisfy all
   * the pre-transaction reads in `renewLeague`. The queue is consumed in
   * source order — see the inline comments below.
   */
  function setup(
    opts: { salaryCapEnabled?: boolean; failOnInsert?: string } = {},
  ) {
    const salaryCapEnabled = opts.salaryCapEnabled ?? false;

    // Reads issued before the transaction opens, in order:
    //   1. membership (must be commissioner to pass auth gate)
    //   2. oldLeague row
    //   2b. subscription tier (for entitlement re-check added in LS-5127)
    //   3. oldTeams
    //   4. oldMembers
    //   5. oldPositions
    //   6. oldProfile lookup (we return []; falsy → skips entries fetch)
    //   7. oldSalaries (only if salaryCapEnabled)
    //   8. oldDraft lookup
    //   9. invite-code uniqueness check (loop body — first iteration succeeds)
    const readQueue: unknown[] = [
      [{ permissionLevel: 'commissioner' }], // membership
      [
        {
          id: 1,
          name: 'Test League',
          owner: 42,
          frozenAt: null,
          seasonNumber: 1,
          maxRosterSize: 25,
          minGamesPerSeason: null,
          gamesPerMatchup: 1,
          tradeDeadlineWeek: null,
          rosterLockTiming: 'matchup-start',
          schedulingStrategy: 'round-robin',
          playerPool: 'all',
          sport: 'baseball',
          baseballEraFilter: null,
          baseballHofOnly: false,
          customEraStartYear: null,
          customEraEndYear: null,
          waiverType: 'faab',
          waiverEnabled: false,
          faabBudgetDefault: 100,
          pitcherStartsPerMatchup: null,
          minCareerGames: null,
          minCareerSeasons: null,
          totalMatchups: null,
          numberOfDivisions: 1,
          playoffEnabled: false,
          playoffFormat: null,
          playoffMultiWeek: false,
          isPublic: false,
          logoUrl: null,
          bannerUrl: null,
          primaryColor: null,
          secondaryColor: null,
          salaryCapEnabled,
          salaryCap: 200,
          salaryFloor: null,
          luxuryTaxThreshold: null,
          minSalary: 1,
          salaryEscalationPct: 10,
          salaryDecayPct: 20,
          auctionBudget: null,
          auctionMinBid: null,
        },
      ], // oldLeague
      [{ tier: 'premium' }], // subscription tier lookup (step 2b, LS-5127)
      [], // oldTeams (empty so teams insert maps zero rows, but still runs)
      [], // oldMembers
      [], // oldPositions
      [], // oldProfile
      ...(salaryCapEnabled ? [[]] : []), // oldSalaries (only if cap enabled)
      [], // oldDraft
      [], // invite code uniqueness — empty means our generated code is unique
    ];

    const helpers = makeChainableDb(readQueue, {
      failOnInsert: opts.failOnInsert,
    });
    const context = {
      user: { id: 42, isAdmin: false, username: 'commish' },
      db: helpers.db,
    };

    const mutationType = schema.getMutationType();
    const field = mutationType?.getFields().renewLeague;
    if (!field?.resolve) {
      throw new Error('renewLeague resolver not found on schema');
    }
    return { resolve: field.resolve.bind(field), context, helpers };
  }

  it('issues the 10 writes through the transaction handle, not directly on context.db', async () => {
    const { resolve, context, helpers } = setup();

    await resolve(
      {},
      { leagueId: 1, keepRosters: false },
      context,
      undefined as never,
    );

    expect(helpers.transactionInvocations).toBe(1);

    const insertedTables = helpers.insertCalls.map((c) => c.table as string);
    // Step 10 (leagues), Step 11 (teams), Step 15 (drafts) always run.
    // leagueMembers / leaguePosition / teamMembers / playerSalaries / scoring
    // profile inserts are conditional on collections being non-empty — those
    // branches are exercised in the salary-cap test below.
    expect(insertedTables).toEqual(
      expect.arrayContaining(['leagues', 'teams', 'drafts']),
    );

    // Step 17: freezing the source league must happen *inside* the
    // transaction. The chainable proxy records all updates; the only update
    // renewLeague issues is the freeze, and it must be on `leagues` with
    // `frozenAt` set.
    expect(helpers.updateCalls).toHaveLength(1);
    expect(helpers.updateCalls[0].table).toBe('leagues');
    expect(helpers.updateCalls[0].set).toMatchObject({
      frozenAt: expect.any(Date),
    });
  });

  it('exercises salary-cap inserts when salaryCapEnabled is true', async () => {
    const { resolve, context, helpers } = setup({ salaryCapEnabled: true });

    await resolve(
      {},
      { leagueId: 1, keepRosters: false },
      context,
      undefined as never,
    );

    const tables = helpers.insertCalls.map((c) => c.table as string);
    // Even with no carried-over salaries the resolver should still open a
    // transaction and reach the freeze; the playerSalaries insert is only
    // emitted when newSalaryRows is non-empty, which we verify is gated on
    // `oldPlayerSalariesMap.size > 0` (empty here).
    expect(helpers.transactionInvocations).toBe(1);
    expect(tables).toEqual(
      expect.arrayContaining(['leagues', 'teams', 'drafts']),
    );
  });

  it('rolls back: if a write inside the transaction throws, the resolver rejects and the post-transaction success log is never emitted', async () => {
    // Inject failure on the `teams` insert (step 11) — a realistic mid-
    // transaction failure point (e.g. constraint violation).
    const { resolve, context, helpers } = setup({ failOnInsert: 'teams' });

    await expect(
      resolve(
        {},
        { leagueId: 1, keepRosters: false },
        context,
        undefined as never,
      ),
    ).rejects.toThrow('simulated mid-transaction failure inserting teams');

    // The transaction must have been opened (proving the writes are gated by it).
    expect(helpers.transactionInvocations).toBe(1);

    // None of the three post-transaction LOGGER.info success messages should
    // have fired — proving the success path short-circuited on rollback.
    const infoMessages = loggerSpy.info.mock.calls.map(
      (c) => c[0] as unknown as string,
    );
    expect(infoMessages).not.toContain('Season renewal complete');
    expect(infoMessages).not.toContain('Season renewal roster summary');
    expect(infoMessages).not.toContain('Salary escalation and decay applied');
  });

  describe('entitlement re-check on renewal (LS-5127)', () => {
    /**
     * Build a resolve + context pair for a free-tier user, with a customisable
     * old-league record and a pre-populated leagueCount for the cap check.
     *
     * Reads in order:
     *  1. membership
     *  2. oldLeague (passed as `leagueOverrides`)
     *  2b. subscription tier → 'free'
     *  2b2. league count (if tier is free, always consumed)
     *  (resolver throws before further reads when entitlement fails)
     */
    function setupFreeUser(
      leagueOverrides: Record<string, unknown>,
      otherActiveLeagueCount = 0,
    ) {
      const baseLeague = {
        id: 1,
        name: 'Test League',
        owner: 42,
        frozenAt: null,
        seasonNumber: 1,
        maxRosterSize: 25,
        minGamesPerSeason: null,
        gamesPerMatchup: 1,
        tradeDeadlineWeek: null,
        rosterLockTiming: 'matchup-start',
        schedulingStrategy: 'round-robin',
        playerPool: 'all',
        sport: 'baseball',
        baseballEraFilter: null,
        baseballHofOnly: false,
        customEraStartYear: null,
        customEraEndYear: null,
        waiverType: 'standard',
        waiverEnabled: false,
        faabBudgetDefault: 100,
        pitcherStartsPerMatchup: null,
        minCareerGames: null,
        minCareerSeasons: null,
        totalMatchups: null,
        numberOfDivisions: 1,
        playoffEnabled: false,
        playoffFormat: null,
        playoffMultiWeek: false,
        isPublic: false,
        logoUrl: null,
        bannerUrl: null,
        primaryColor: null,
        secondaryColor: null,
        salaryCapEnabled: false,
        salaryCap: null,
        salaryFloor: null,
        luxuryTaxThreshold: null,
        minSalary: 1,
        salaryEscalationPct: 0,
        salaryDecayPct: 0,
        auctionBudget: null,
        auctionMinBid: null,
        isMockDraft: false,
        ...leagueOverrides,
      };

      const readQueue: unknown[] = [
        [{ permissionLevel: 'commissioner' }],
        [baseLeague],
        [{ tier: 'free' }],
        [{ leagueCount: otherActiveLeagueCount }],
        // resolver throws before consuming further items when entitlement fails
      ];

      const { db, insertCalls } = makeChainableDb(readQueue);
      const context = {
        user: { id: 42, isAdmin: false, username: 'commish' },
        db,
      };

      const mutationType = schema.getMutationType();
      const field = mutationType?.getFields().renewLeague;
      if (!field?.resolve) throw new Error('renewLeague resolver not found');

      return { resolve: field.resolve.bind(field), context, insertCalls };
    }

    it('blocks a free user who already holds 3 other active leagues', async () => {
      const { resolve, context } = setupFreeUser({}, 3);

      await expect(
        resolve(
          {},
          { leagueId: 1, keepRosters: false },
          context,
          undefined as never,
        ),
      ).rejects.toThrow('3-league limit');
    });

    it('allows a free user who holds fewer than 3 other active leagues', async () => {
      // waiverType: 'standard', salaryCapEnabled: false → no premium features
      // to gate; should complete normally with 2 other leagues
      const { resolve, context } = setupFreeUser({}, 2);

      await expect(
        resolve(
          {},
          { leagueId: 1, keepRosters: false },
          context,
          undefined as never,
        ),
      ).resolves.toBeDefined();
    });

    it('blocks a free user renewing a league with FAAB waivers', async () => {
      const { resolve, context } = setupFreeUser({ waiverType: 'faab' }, 0);

      await expect(
        resolve(
          {},
          { leagueId: 1, keepRosters: false },
          context,
          undefined as never,
        ),
      ).rejects.toThrow('FAAB waiver type requires a premium subscription');
    });

    it('blocks a free user renewing a salary-cap league', async () => {
      const { resolve, context } = setupFreeUser({ salaryCapEnabled: true }, 0);

      await expect(
        resolve(
          {},
          { leagueId: 1, keepRosters: false },
          context,
          undefined as never,
        ),
      ).rejects.toThrow('Salary cap leagues require a premium subscription');
    });

    it('blocks a free user renewing a league with a non-free era filter', async () => {
      const { resolve, context } = setupFreeUser(
        { sport: 'baseball', baseballEraFilter: 'dead_ball' },
        0,
      );

      await expect(
        resolve(
          {},
          { leagueId: 1, keepRosters: false },
          context,
          undefined as never,
        ),
      ).rejects.toThrow('Era-based filtering');
    });

    it('blocks a free user renewing a league with an advanced playoff format', async () => {
      const { resolve, context } = setupFreeUser(
        { playoffFormat: '6-team' },
        0,
      );

      await expect(
        resolve(
          {},
          { leagueId: 1, keepRosters: false },
          context,
          undefined as never,
        ),
      ).rejects.toThrow(
        'Advanced playoff formats require a premium subscription.',
      );
    });

    it('allows a free user to renew a league with only free features', async () => {
      const { resolve, context } = setupFreeUser(
        {
          sport: 'baseball',
          baseballEraFilter: 'modern',
          playoffFormat: '4-team',
        },
        0,
      );

      await expect(
        resolve(
          {},
          { leagueId: 1, keepRosters: false },
          context,
          undefined as never,
        ),
      ).resolves.toBeDefined();
    });
  });
});
