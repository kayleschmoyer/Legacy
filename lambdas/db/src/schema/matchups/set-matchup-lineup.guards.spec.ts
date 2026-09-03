/**
 * setMatchupLineup — authentication guard clause (LS-6374).
 *
 * Exercises the resolver's UNAUTHENTICATED guard with a mocked Pothos
 * builder (mirrors set-optimal-lineup.guards.spec.ts). The transaction +
 * write behavior is covered separately by set-matchup-lineup.db.spec.ts
 * against a real Postgres instance.
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

/** Capture the setMatchupLineup resolver from mutations.ts. */
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
            if (name === 'setMatchupLineup') captured = opts.resolve;
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
  // mocked-builder resolver test. Mirrors set-optimal-lineup.guards.spec.ts's
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

  if (!captured) throw new Error('setMatchupLineup resolver not captured');
  return captured;
}

describe('setMatchupLineup — authentication guard (LS-6374)', () => {
  it('throws AuthenticationError when context.user is null', async () => {
    const setMatchupLineup = captureResolver();
    const ctx = { user: null, db: {} };

    await expect(
      setMatchupLineup(
        null,
        {
          matchupId: 1,
          teamId: 10,
          positions: [{ matchupPlayerId: 1, positionId: 1 }],
        },
        ctx,
      ),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });
});

export {};
