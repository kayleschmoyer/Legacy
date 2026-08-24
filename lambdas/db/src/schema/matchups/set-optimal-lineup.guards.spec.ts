/**
 * setOptimalLineup — auth/ownership guard clauses (LS-6378).
 *
 * Exercises the resolver's guard ordering with a mocked Pothos builder
 * (mirrors draft-order.entitlement.spec.ts and matchupScores.resolver.spec.ts,
 * whose builder mock needs unionType/enumType too since this resolver's file
 * pulls in matchupScores.ts -> football.ts transitively). The optimizer
 * algorithm itself is covered in isolation by
 * lib/utils/src/lib/lineup-optimizer.spec.ts, and the assignment + write
 * behavior by set-optimal-lineup.db.spec.ts.
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

/** Capture the setOptimalLineup resolver from mutations.ts. */
function captureResolver(): ResolverFn {
  jest.resetModules();

  let captured: ResolverFn | undefined;

  jest.doMock('../builder', () => ({
    builder: {
      objectRef: jest.fn(() => ({ implement: jest.fn() })),
      inputType: jest.fn(() => ({ implement: jest.fn() })),
      objectType: jest.fn(),
      unionType: jest.fn(),
      // football.ts registers enums (e.g. SosTierEnum) at module load time;
      // this spec pulls it in transitively via matchupScores.ts.
      enumType: jest.fn(),
      queryField: jest.fn(),
      mutationField: jest.fn((name: string, fn: (t: unknown) => void) => {
        fn({
          field: (opts: { resolve: ResolverFn }) => {
            if (name === 'setOptimalLineup') captured = opts.resolve;
          },
          arg: Object.assign(
            jest.fn(() => ({})),
            {
              int: jest.fn(() => ({})),
              intList: jest.fn(() => ({})),
              float: jest.fn(() => ({})),
              string: jest.fn(() => ({})),
              boolean: jest.fn(() => ({})),
            },
          ),
        });
      }),
    },
  }));

  // Stub the types module — mutations.ts only needs these names to exist as
  // pass-through refs; their real Pothos definitions aren't exercised by a
  // mocked-builder resolver test. Mirrors draft-order.entitlement.spec.ts's
  // `jest.doMock('../types', () => ({ Draft: {} }))`.
  jest.doMock('./types', () => ({
    Matchup: {},
    MatchupPlayer: {},
    MatchupStatus: {},
    CreateMatchupInput: {},
    AdvanceLeagueWeekResponse: {},
  }));

  require('./mutations');

  if (!captured) throw new Error('setOptimalLineup resolver not captured');
  return captured;
}

function makeCtx({
  hasEntitlement = false,
}: { hasEntitlement?: boolean } = {}) {
  return {
    user: {
      id: 1,
      username: 'testuser',
      entitlements: hasEntitlement ? ['optimal_lineup'] : [],
      iat: Math.floor(Date.now() / 1000),
    },
    db: {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([
              {
                id: 1,
                leagueId: 1,
                weekNumber: 1,
                status: 'scheduled',
                team1Id: 10,
                team2Id: 20,
              },
            ]),
          }),
        }),
      }),
    },
  };
}

describe('setOptimalLineup — authentication guard (LS-6378)', () => {
  it('throws AuthenticationError when context.user is null', async () => {
    const setOptimalLineup = captureResolver();
    const ctx = { ...makeCtx(), user: null };

    await expect(
      setOptimalLineup(null, { matchupId: 1, teamId: 10 }, ctx),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });
});

describe('setOptimalLineup — team ownership guard (LS-6378)', () => {
  it('rejects a caller who does not own the requested team', async () => {
    jest.doMock('../authorization', () => ({
      ...jest.requireActual('../authorization'),
      verifyLeagueMembership: jest.fn().mockResolvedValue({
        leagueId: 1,
        userId: 1,
        teamId: 999, // caller owns a different team than the one requested
        permissionLevel: 'general_manager',
      }),
    }));
    const setOptimalLineup = captureResolver();

    await expect(
      setOptimalLineup(null, { matchupId: 1, teamId: 10 }, makeCtx()),
    ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
  });
});

export {};
