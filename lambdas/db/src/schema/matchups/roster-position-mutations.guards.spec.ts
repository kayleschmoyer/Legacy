/**
 * updateMatchupPlayerPosition / swapMatchupPlayerPositions — authentication
 * guard clauses (LS-9738 review finding).
 *
 * Exercises each resolver's UNAUTHENTICATED guard with a mocked Pothos
 * builder (mirrors set-matchup-lineup.guards.spec.ts /
 * set-optimal-lineup.guards.spec.ts). The transaction + write behavior is
 * covered separately by update-matchup-player-position.db.spec.ts and
 * swap-matchup-player-positions.db.spec.ts against a real Postgres instance.
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

/** Capture the updateMatchupPlayerPosition + swapMatchupPlayerPositions resolvers from mutations.ts. */
function captureResolvers(): {
  updateMatchupPlayerPosition: ResolverFn;
  swapMatchupPlayerPositions: ResolverFn;
} {
  jest.resetModules();

  let update: ResolverFn | undefined;
  let swap: ResolverFn | undefined;

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
            if (name === 'updateMatchupPlayerPosition') update = opts.resolve;
            if (name === 'swapMatchupPlayerPositions') swap = opts.resolve;
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
  // mocked-builder resolver test. Mirrors set-matchup-lineup.guards.spec.ts's
  // stub.
  jest.doMock('./types', () => ({
    Matchup: {},
    MatchupPlayer: {},
    MatchupStatus: {},
    CreateMatchupInput: {},
    LineupPositionInput: {},
    AdvanceLeagueWeekResponse: {},
  }));

  require('./mutations');

  if (!update) {
    throw new Error('updateMatchupPlayerPosition resolver not captured');
  }
  if (!swap) {
    throw new Error('swapMatchupPlayerPositions resolver not captured');
  }
  return {
    updateMatchupPlayerPosition: update,
    swapMatchupPlayerPositions: swap,
  };
}

describe('updateMatchupPlayerPosition — authentication guard (LS-9738)', () => {
  it('throws AuthenticationError when context.user is null', async () => {
    const { updateMatchupPlayerPosition } = captureResolvers();
    const ctx = { user: null, db: {} };

    await expect(
      updateMatchupPlayerPosition(
        null,
        { matchupPlayerId: 1, positionId: 1 },
        ctx,
      ),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });
});

describe('swapMatchupPlayerPositions — authentication guard (LS-9738)', () => {
  it('throws AuthenticationError when context.user is null', async () => {
    const { swapMatchupPlayerPositions } = captureResolvers();
    const ctx = { user: null, db: {} };

    await expect(
      swapMatchupPlayerPositions(
        null,
        {
          matchupPlayerIdA: 1,
          positionIdA: 1,
          matchupPlayerIdB: 2,
          positionIdB: 2,
        },
        ctx,
      ),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });
});

export {};
