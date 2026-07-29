/**
 * Resolver-level auth tests for the `designateKeeper` / `undesignateKeeper`
 * mutations (LS-8673). Mirrors the isolated-resolver-capture pattern used by
 * teams/mutations.spec.ts — mocks `../builder` to capture each mutation's
 * `resolve` fn directly, so the UNAUTHENTICATED check can be exercised
 * without standing up a real database.
 */

type Resolver = (...args: unknown[]) => Promise<unknown>;

/** Capture the keepers-domain mutation resolvers. */
async function captureKeeperMutationResolvers(): Promise<
  Record<string, Resolver>
> {
  jest.resetModules();
  const captured: Record<string, { resolve?: Resolver }> = {};

  // `t.arg.<type>(cfg)` stub used while building the `args` object literal —
  // its return value is never inspected, only `t.field(opts)` matters.
  const argStub = new Proxy({}, { get: () => (cfg: unknown) => cfg });
  const tStub = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'arg') return argStub;
        return (cfg: unknown) => cfg; // t.field(opts) => opts
      },
    },
  );

  jest.doMock('../builder', () => ({
    builder: {
      mutationField: (name: string, fn: (t: unknown) => unknown) => {
        captured[name] = fn(tStub) as { resolve?: Resolver };
      },
      objectRef: () => {
        const ref: { implement: () => typeof ref } = {
          implement: () => ref,
        };
        return ref;
      },
    },
  }));

  await import('./mutations');
  const resolvers: Record<string, Resolver> = {};
  for (const [name, opts] of Object.entries(captured)) {
    if (opts.resolve) resolvers[name] = opts.resolve;
  }
  return resolvers;
}

describe('keepers mutations — UNAUTHENTICATED guard (LS-8673)', () => {
  it('designateKeeper throws UNAUTHENTICATED when user is null', async () => {
    const resolvers = await captureKeeperMutationResolvers();
    const designateKeeper = resolvers.designateKeeper;
    if (!designateKeeper) {
      throw new Error('designateKeeper resolver was not captured');
    }

    await expect(
      designateKeeper(
        {},
        { leagueId: 1, playerId: 101 },
        { user: null, db: {} },
        undefined,
      ),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  it('undesignateKeeper throws UNAUTHENTICATED when user is null', async () => {
    const resolvers = await captureKeeperMutationResolvers();
    const undesignateKeeper = resolvers.undesignateKeeper;
    if (!undesignateKeeper) {
      throw new Error('undesignateKeeper resolver was not captured');
    }

    await expect(
      undesignateKeeper(
        {},
        { leagueId: 1, playerId: 101 },
        { user: null, db: {} },
        undefined,
      ),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });
});

export {};
