/**
 * The one sanctioned way to mock `@legacy-sports/db-client` in a spec, in any
 * package.
 *
 * A hand-written `jest.doMock('@legacy-sports/db-client', () => ({ ... }))`
 * factory replaces the WHOLE module with whatever the spec happened to list.
 * Most resolver specs import the full Pothos schema, so every schema module
 * then loads against that partial module — and one that reads a table it did
 * not list at module load (`PublicSchema.drafts.id` inside a top-level `sql`
 * fragment, say) crashes ~40 unrelated suites at import time. Nothing short
 * of running them catches that (LS-10079).
 *
 * `mockDbClientModule` starts from the real module and layers the spec's
 * overrides on top — `PublicSchema` / `InternalSchema` table by table — so the module a schema file
 * sees is never missing an export. Override keys are checked against the real
 * module: a renamed export or table is a type error, not a silent `undefined`.
 *
 * The repo-wide `legacy-sports-db/db-client-mock` lint rule (root
 * eslint.config.mjs; lib/db-client/eslint-rules/db-client-mock.cjs) rejects any
 * other factory for the module, so the partial shape can't come back.
 *
 * Both helpers are installed as globals by ./setup.ts (wired into every
 * project's jest `setupFiles`), so a hoisted `jest.mock` factory can call them
 * whatever the import order. Their types come from ./globals.d.ts, which each
 * project's tsconfig.spec.json includes (LS-10498).
 *
 * @example
 * jest.doMock('@legacy-sports/db-client', () =>
 *   mockDbClientModule({
 *     createDatabaseService: jest.fn(() => ({ statistics: mockStatistics })),
 *     PublicSchema: { leagues: { id: 'id', name: 'name' } },
 *   }),
 * );
 */

type DbClientModule = typeof import('@legacy-sports/db-client');
type SchemaNamespace = 'PublicSchema' | 'InternalSchema';

/**
 * Replacement values for any of the module's exports, and for any of its
 * `PublicSchema` / `InternalSchema` tables. Values are deliberately loose (`jest.fn()` stand-ins
 * rarely match the real signatures); the KEYS are what is checked.
 */
export type DbClientModuleOverrides = {
  [K in Exclude<keyof DbClientModule, SchemaNamespace>]?: unknown;
} & {
  [S in SchemaNamespace]?: { [T in keyof DbClientModule[S]]?: unknown };
};

let loadingActualDbClient = false;

/**
 * The real module, loaded once per spec FILE. Most resolver specs call
 * `jest.resetModules()` before every test and rebuild the whole schema; a
 * fresh real db-client (every drizzle table, every service) per test pushed CI
 * workers past their 2 GB heap (LS-10079). Reusing it within one file keeps
 * the cost to one load per file; a new file — possibly with different
 * dependency mocks — always loads its own.
 */
const actualCache = new Map<string, { testPath: string; module: unknown }>();

function loadActualOncePerFile<T>(moduleName: string, load: () => T): T {
  const testPath = expect.getState().testPath ?? '';
  const cached = actualCache.get(moduleName);
  if (cached && cached.testPath === testPath) return cached.module as T;
  const module = load();
  actualCache.set(moduleName, { testPath, module });
  return module;
}

export function mockDbClientModule(
  overrides: DbClientModuleOverrides = {},
): DbClientModule {
  // Re-entry means a file inside db-client imported its own package barrel
  // ('../index' or '@legacy-sports/db-client') while the real module loads:
  // that import resolves to this mock, the spec's factory runs a second time,
  // and the spec ends up holding different spies than the module it tested.
  if (loadingActualDbClient) {
    throw new Error(
      'mockDbClientModule re-entered: a lib/db-client source file imports ' +
        "the package's own barrel. Import from the defining module instead " +
        '(see lib/db-client/src/lib/DraftUtils.ts, LS-10079).',
    );
  }
  const actual = loadActualOncePerFile('@legacy-sports/db-client', () => {
    loadingActualDbClient = true;
    try {
      return jest.requireActual<DbClientModule>('@legacy-sports/db-client');
    } finally {
      loadingActualDbClient = false;
    }
  });
  const {
    PublicSchema: publicOverrides,
    InternalSchema: internalOverrides,
    ...exportOverrides
  } = overrides;

  // `applyTierChangeSideEffects` (LS-7397) closes over the real downgrade /
  // unfreeze functions, so a spec that stubs those two would otherwise hit the
  // real DB path. Unless the spec overrides the helper itself, rebuild it on top
  // of whichever downgrade / unfreeze functions the spec supplied.
  const tierSideEffects =
    'applyTierChangeSideEffects' in exportOverrides
      ? {}
      : {
          applyTierChangeSideEffects: async (
            userId: number,
            previousTier: 'free' | 'premium' | null,
            newTier: 'free' | 'premium',
            dbOptions: unknown,
          ): Promise<void> => {
            const downgrade = (exportOverrides.handleSubscriptionDowngrade ??
              actual.handleSubscriptionDowngrade) as (
              ...args: unknown[]
            ) => Promise<void>;
            const unfreeze = (exportOverrides.clearLeagueTierFreezes ??
              actual.clearLeagueTierFreezes) as (
              ...args: unknown[]
            ) => Promise<void>;
            if (previousTier === newTier) return;
            if (newTier === 'free') {
              await downgrade(userId, dbOptions);
            } else if (previousTier === 'free') {
              await unfreeze(userId, dbOptions);
            }
          },
        };

  return {
    ...actual,
    ...tierSideEffects,
    ...exportOverrides,
    PublicSchema: { ...actual.PublicSchema, ...publicOverrides },
    InternalSchema: { ...actual.InternalSchema, ...internalOverrides },
  } as DbClientModule;
}

type DrizzleOrmModule = typeof import('drizzle-orm');

/**
 * The `drizzle-orm` twin of {@link mockDbClientModule}. Once db-client is real,
 * its table definitions call drizzle's `sql` at load — so a spec's drizzle
 * mock must be the real module with overrides on top, never a hand-picked
 * subset. Don't override `sql` with a stub: db-client needs the real one.
 */
export function mockDrizzleOrm(
  overrides: { [K in keyof DrizzleOrmModule]?: unknown } = {},
): DrizzleOrmModule {
  const actual = loadActualOncePerFile('drizzle-orm', () =>
    jest.requireActual<DrizzleOrmModule>('drizzle-orm'),
  );
  return { ...actual, ...overrides } as DrizzleOrmModule;
}
