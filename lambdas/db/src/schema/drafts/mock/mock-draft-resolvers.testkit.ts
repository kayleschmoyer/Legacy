/**
 * Test kit for the mock-draft resolvers (LS-10076).
 *
 * The resolvers are registered on the Pothos builder as a side effect of
 * importing their modules, so a test cannot reach them through an export.
 * This captures them by mocking `../../builder` with a recorder, exactly as
 * the resolver specs elsewhere in this domain do — everything else (the
 * transaction bodies, the locking, the queries) stays real, so the DB specs
 * can drive the true resolvers against real Postgres.
 */

/** A captured resolver, called with a real db-carrying context by the spec. */
export type CapturedResolver<TResult = unknown> = (
  parent: unknown,
  args: Record<string, unknown>,
  context: unknown,
  info?: unknown,
) => Promise<TResult>;

/** An object payload whose fields the DB specs assert on individually. */
export type ResolverPayload = Record<string, unknown>;

export interface CapturedMockDraftResolvers {
  createMockDraft: CapturedResolver<ResolverPayload>;
  joinMockDraft: CapturedResolver<ResolverPayload>;
  startMockDraft: CapturedResolver;
  leaveMockDraft: CapturedResolver;
  kickMockDraftSeat: CapturedResolver;
  updateMockDraftLobby: CapturedResolver;
  deleteMockDraft: CapturedResolver;
  deleteMyMockDrafts: CapturedResolver<number>;
  draftRoom: CapturedResolver;
  draftMessages: CapturedResolver;
  sendDraftMessage: CapturedResolver;
  expireMockDraftLobbies: CapturedResolver<ResolverPayload>;
  purgeStaleOfflineMockDrafts: CapturedResolver<ResolverPayload>;
}

/** The shape a `t.field({...})` definition has, as far as this kit cares. */
interface FieldDefinition {
  resolve?: CapturedResolver;
}

/**
 * Entitlement answers for the captured resolvers. Real entitlement resolution
 * reads Stripe-backed state the DB specs do not seed, so the gate itself is
 * stubbed here and tested separately; set `unlimitedMockDrafts = false` to
 * exercise the free-tier weekly cap against real `drafts` rows.
 */
export const testEntitlements = {
  unlimitedMockDrafts: true,
  controlAllTeams: true,
};

/**
 * A `t` field-builder stand-in: every DSL call returns its own options, and
 * every property (`t.arg.int`, `t.exposeBoolean`, ...) is another such call.
 * Total rather than enumerated, because the mock-draft modules transitively
 * import other schema modules whose fields use DSL calls this kit never lists.
 */
function fieldBuilder(): unknown {
  const passthrough = (options?: unknown): unknown => options ?? {};
  return new Proxy(passthrough, { get: () => fieldBuilder() });
}

/** An inert type ref: `implement` chains, nothing is registered. */
function inertRef(): { implement: () => unknown } {
  const ref = { implement: (): unknown => ref };
  return ref;
}

/**
 * Import the mock-draft modules with a recording builder and hand back their
 * resolvers. Call inside the spec (it resets the module registry).
 */
export async function captureMockDraftResolvers(): Promise<CapturedMockDraftResolvers> {
  jest.resetModules();

  const captured: Record<string, CapturedResolver> = {};

  const registerField = (
    name: string,
    define: (t: unknown) => unknown,
  ): void => {
    const definition = define(fieldBuilder()) as FieldDefinition | undefined;
    if (definition?.resolve) {
      captured[name] = definition.resolve;
    }
  };

  // Only root fields are recorded. Every other builder call — objectRef,
  // inputType, enumType, scalarType, ... from the transitively imported schema
  // modules (drafts/types -> leagues/types -> scoring) — returns an inert ref,
  // so a new builder method anywhere in that graph cannot break the import.
  const recorded: Record<string, unknown> = {
    queryField: registerField,
    mutationField: registerField,
  };
  jest.doMock('../../builder', () => ({
    builder: new Proxy(recorded, {
      get: (target, prop: string) => (prop in target ? target[prop] : inertRef),
    }),
  }));

  jest.doMock('../../authorization', () => ({
    hasEntitlement: (_context: unknown, entitlement: string) =>
      Promise.resolve(
        entitlement === 'mock_draft_control_all_teams'
          ? testEntitlements.controlAllTeams
          : testEntitlements.unlimitedMockDrafts,
      ),
    requireEntitlement: (_context: unknown, entitlement: string) => {
      if (
        entitlement === 'mock_draft_control_all_teams' &&
        !testEntitlements.controlAllTeams
      ) {
        throw new Error('PREMIUM_REQUIRED');
      }
      return Promise.resolve();
    },
  }));

  await import('./create-mock-draft');
  await import('./join-mock-draft');
  await import('./start-mock-draft');
  await import('./lobby');
  await import('./draft-room');
  await import('./chat');
  await import('./jobs');

  return captured as unknown as CapturedMockDraftResolvers;
}
