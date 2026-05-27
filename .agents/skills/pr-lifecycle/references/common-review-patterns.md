# Common Review Patterns

These issues appear repeatedly in reviewer bot CHANGES_REQUESTED cycles. Knowing them eliminates most review cycles. Patterns #1–28 were cataloged from earlier analysis; #29–43 from 100-PR analysis (May 2026, 47/100 PRs affected).

## Pattern Summary

| #   | Pattern                                                          | Fix                                                                                                   | Caught by              |
| --- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------- |
| 1   | `jest.doMock('@legacy-sports/utils', ...)` for `getDbOptions`    | Change to `@legacy-sports/utils/node` + `...jest.requireActual(...)` spread                           | Manual                 |
| 2   | `postData.includes('getleague')` matches `getLeagueTeams` etc.   | Use quoted `'"getleague"'` or reorder specific-first                                                  | Manual                 |
| 3   | Header comment overclaims test coverage                          | Audit actual test names and trim header to match                                                      | Manual                 |
| 4   | Missing UNAUTHENTICATED guard test                               | Add test calling resolver with `user: null`, assert `UNAUTHENTICATED`                                 | Manual                 |
| 5   | `route.fallback()` leaks to real network                         | Replace with `route.fulfill({ json: { data: {} } })`                                                  | `lint-review-patterns` |
| 6   | `LOGGER.error({ error })` — Rollbar ignores wrapped object       | Use `LOGGER.error('message', error)` with Error as direct arg                                         | `lint-review-patterns` |
| 7   | `data: null` mock response                                       | Use `{ data: { queryName: null } }` or `{ data: { queryName: [] } }`                                  | Manual                 |
| 8   | Wrong GraphQL field names in mocks                               | Check actual `.graphql` query files for correct field names                                           | Manual                 |
| 9   | Test name doesn't match assertion                                | Rename test to describe what it actually asserts                                                      | Manual                 |
| 10  | Process/scope comments (PR title, splitting)                     | Resolve thread directly — no code change needed                                                       | Manual                 |
| 11  | Silent error swallowing in catch blocks                          | Return `{ success: false, error }` or re-throw                                                        | `lint-review-patterns` |
| 12  | Git ref injection via args starting with `-`                     | Validate ref doesn't start with `-` before passing to git                                             | `lint-review-patterns` |
| 13  | Missing pagination for Jira/GitHub API queries                   | Add `maxResults`/`perPage` and handle nextPage cursor                                                 | Manual                 |
| 14  | `shell: true` with user input enables injection                  | Use array args with `shell: false`                                                                    | `lint-review-patterns` |
| 15  | Codegen output manually edited                                   | Fix source `.graphql` or schema and run `make codegen`                                                | Manual                 |
| 16  | PR description doesn't explain codegen diff                      | Add explanation in PR body when generated files change                                                | Manual                 |
| 17  | MCP tools return success on partial failure                      | Set `isError: true` and report `{ total, succeeded, failed }`                                         | Manual                 |
| 18  | Docs reference nonexistent MCP tools                             | Verify tool names exist in `tools/mcp/*/src/` before referencing                                      | Manual                 |
| 19  | Dev/prod ternary forgets staging                                 | Use `{ dev: X, staging: Y, prod: Z }[env]`                                                            | `lint-review-patterns` |
| 20  | Unbounded tool output                                            | Cap with `.slice(0, N)` and include `{ truncated: true, total }`                                      | `lint-review-patterns` |
| 21  | Nullable GraphQL field in string interpolation / aria-label      | Null-check or provide fallback before interpolating                                                   | Manual                 |
| 22  | `role="button"` without `tabIndex={0}`                           | Add `tabIndex={0}` and `onKeyDown`; prefer native `<button>`                                          | `lint-review-patterns` |
| 23  | Collapsed content stays in accessibility tree                    | Add `aria-hidden`, `visibility: hidden`, `pointerEvents: none` when hidden                            | Manual                 |
| 24  | `transition: 'all'` instead of specific properties               | Enumerate only the properties being transitioned                                                      | `lint-review-patterns` |
| 25  | Inline hex literal instead of `colors.ts` constant               | Import and use named constant from `apps/web/src/constants/colors.ts`                                 | `lint-review-patterns` |
| 26  | `throw new Error()` in GraphQL resolver for input validation     | Use `UserInputError` from `lambdas/db/src/schema/graphql-errors.ts`                                   | `lint-review-patterns` |
| 27  | `localStorage`/`sessionStorage` write without try/catch          | Wrap in try/catch — storage throws in private mode and on quota exceeded                              | `lint-review-patterns` |
| 28  | Unsafe `as 'literal-union'` cast on unvalidated external data    | Use type guard with allowed-values array instead of bare `as` assertion                               | Manual                 |
| 29  | ⭐ LOGGER.error/warn non-Error 2nd arg (13/100 PRs)              | Pass raw `Error` instance as 2nd arg; extra context goes in 3rd arg                                   | `lint-review-patterns` |
| 30  | Missing/incomplete test coverage for new logic                   | Every new component/resolver/mutation/bug-fix needs a spec covering the changed behavior              | Manual                 |
| 31  | PR description does not match diff                               | Read your diff before pushing; explain all generated-file changes                                     | Manual                 |
| 32  | Missing range/null validation on GraphQL mutation arguments      | Guard numeric ranges, null/undefined, and enum values with `UserInputError`                           | Manual                 |
| 33  | Loading state not reset after mutation failure                   | Use `finally { setLoading(false) }` — not only in success path                                        | Manual                 |
| 34  | Missing authorization check (auth ≠ authz)                       | After auth check, also verify user membership/ownership of the requested resource                     | Manual                 |
| 35  | Drizzle `integer` for BIGINT column (overflow)                   | Use `bigint('col', { mode: 'number' })` for DB BIGINT columns                                         | Manual                 |
| 36  | Multi-column sort with single-column cursor                      | Cursor must encode all `orderBy` columns, not just `id`                                               | Manual                 |
| 37  | Weak test assertions (`toBeDefined()` instead of value)          | Assert the concrete expected value, not just existence                                                | Manual                 |
| 38  | Duplicate constant across packages (DRY violation)               | Define once in a shared lib; import everywhere                                                        | Manual                 |
| 39  | ⚠️ Committed symlink / local absolute path                       | Check `file <new-file>` before staging; add to `.gitignore`                                           | Manual                 |
| 40  | `console.*` / `process.stdout.write` in app code                 | Use `LOGGER` from `@legacy-sports/logging` (exceptions: CLI, migrations, build scripts)               | ESLint                 |
| 41  | Error message leaked to UI                                       | Show generic string to user; log real error with `LOGGER.error`                                       | Manual                 |
| 42  | Terraform resource rename without `moved {}` block               | Add `moved { from = old.name; to = new.name }` to avoid destroy+recreate                              | Manual                 |
| 43  | Shell variable empty after `\|\| true` pattern                   | Provide explicit fallback: `cmd \| echo "default"`                                                    | Manual                 |
| 44  | PR touches `apps/web-e2e/**` without a passing Playwright report | Dispatch `run-playwright-tests.yml` or run locally; paste report URL/evidence in PR body before merge | Manual                 |

## Pattern Details

### #1 — jest.doMock wrong module path

`getDbOptions` lives in `@legacy-sports/utils/node`, not `@legacy-sports/utils` (the browser-compatible root). Mocking only `getDbOptions` without spreading other exports also breaks sibling imports.

```typescript
// Wrong — browser-compatible root, no spread
jest.doMock('@legacy-sports/utils', () => ({ getDbOptions: jest.fn() }));

// Correct — Node-specific path with requireActual spread
jest.doMock('@legacy-sports/utils/node', () => ({
  ...jest.requireActual('@legacy-sports/utils/node'),
  getDbOptions: jest.fn(),
}));
```

Reference: `lambdas/db/src/schema/playoff.resolver.spec.ts` for correct pattern.

### #2 — Broad postData.includes() matching

A check like `postData.includes('getleague')` matches `getleagueteams`, `getleaguemembers`, etc. Use `extractOperationName()` from `apps/web-e2e/src/fixtures/shared-mocks.ts` or quote the operation name.

```typescript
// Wrong — Matches getleague, getleagueteams, getleaguemembers...
if (postData.includes('getleague')) { ... }

// Correct — Exact match via quoted JSON field
if (postData.includes('"getleague"')) { ... }

// Best — use the helper
const op = extractOperationName(route);
if (op === 'GetLeague') { ... }
```

### #5 — route.fallback() in the wrong layer

Within the 3-layer mock architecture (test → auth.ts → baseline), test handlers should use `route.fallback()` to cascade to the next layer — this is correct. But `route.continue()` is **always forbidden** in E2E tests. See `.agents/skills/testing/SKILL.md` for the full layer architecture.

### #6 — LOGGER.error() error wrapping

`RollbarOutputDestination` scans args for `arg instanceof Error` to extract stack traces. Wrapping in `{ error }` hides the Error instance.

```typescript
// Wrong — Rollbar synthesizes generic Error, loses stack trace
LOGGER.error('Failed to load', { error });

// Correct — Rollbar extracts original stack trace
LOGGER.error('Failed to load', error);
LOGGER.error('Failed to load', error, { userId });
```

Reference: `lib/rollbar/src/lib/RollbarOutputDestination.ts` lines 33–34.

### #7 — Mock response data structure

Apollo client expects `response.data.operationName`, not `response.operationName`. Always wrap in `{ data: { ... } }`. Check `apps/web-e2e/src/fixtures/shared-mocks.ts` for correct baseline patterns.

```typescript
// Wrong — Missing data wrapper
route.fulfill({ json: { getLeagueById: null } });

// Correct structure
route.fulfill({ json: { data: { league: null } } });
```

---

## MCP Tool & Infrastructure Patterns (from 100-PR analysis, March 2026)

These patterns appear frequently in PRs that add or modify MCP tools, Terraform, and platform infrastructure.

### #11 — Silent error swallowing in catch blocks

Empty `catch {}` or catch blocks that return success hide failures from agents and users.

```typescript
// Bad
catch {}
catch (e) { return { success: true }; }

// Good
catch (e) { return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: e.message }) }], isError: true }; }
```

### #12 — Argument injection via refs/args starting with `-`

User-supplied git refs or CLI args starting with `-` get interpreted as flags.

```typescript
// Bad — ref could be "--exec=malicious"
const args = ['checkout', ref, '--', path];

// Good
if (ref.startsWith('-')) throw new Error('Invalid ref');
const args = ['checkout', ref, '--', path];
```

### #13 — Missing pagination for Jira/GitHub API queries

Jira defaults to 50 results, GitHub GraphQL to 100. Results silently truncate.

### #14 — `shell: true` with user input enables injection

Pass args as arrays with `shell: false`. Only use `shell: true` on Windows with validated input.

### #15 — Codegen output manually edited

Never edit `*.generated.*` files. Fix the source `.graphql` or schema and run `make codegen`.

### #16 — PR description doesn't explain codegen diff

When generated files change (from rebase/codegen), explain why in the PR description.

### #17 — MCP tools return success on partial failure

Batch operations that fail some items must set `isError: true` and report `{ total, succeeded, failed }`.

### #18 — Docs reference nonexistent MCP tools

Verify tool names exist in `tools/mcp/*/src/` before referencing in docs or skills.

### #19 — Dev/prod ternary forgets staging

Use `{ dev: X, staging: Y, prod: Z }[env]` instead of `env === 'dev' ? X : Y`.

### #20 — Unbounded tool output

Tools returning variable-length data (diffs, logs, file lists) must cap output and indicate truncation.

---

## UI & Component Patterns (from cloud reviewer analysis, April 2026)

These patterns appear consistently in Copilot cloud reviewer comments on UI changes. Local agents must check them during self-review. Patterns #22, #24, #25, #26, and #27 are caught automatically by `make lint-review-patterns`. Patterns #21, #23, and #28 require manual judgment — they cannot be reliably detected by regex.

### #21 — Nullable GraphQL field in string interpolation / aria-label

GraphQL fields typed as nullable (`String` vs `String!`) will produce `"...null..."` when interpolated directly. Always null-check or provide a fallback.

```tsx
// Bad — playerName is nullable (String in schema, not String!)
aria-label={`Draft ${rec.playerName} now`}
<span>{rec.playerName}</span>

// Good
aria-label={rec.playerName ? `Draft ${rec.playerName} now` : 'Draft player'}
<span>{rec.playerName ?? 'Unknown player'}</span>
```

**When to check**: any new string interpolation or JSX render using a field from a GraphQL query result. Cross-reference the `.graphql` file to confirm `!` non-null.

### #22 — `role="button"` without `tabIndex` (keyboard inaccessible)

Non-button elements with `role="button"` are not focusable by keyboard without `tabIndex={0}`. Also requires a `:focus-visible` style.

```tsx
// Bad — keyboard users can't reach this
<div role="button" onClick={toggle}>Label</div>

// Good — or better: use a native <button>
<div role="button" tabIndex={0} onKeyDown={handleKey} onClick={toggle}>Label</div>
```

**When to check**: any `role="button"` added to a non-`<button>` element.

### #23 — Collapsed content stays in accessibility tree

Animating height/opacity does not remove content from the tab order or screen reader tree. Apply `aria-hidden` and disable pointer events when content is collapsed.

```tsx
// Bad — hidden content still reachable by keyboard/screen reader
<div style={{ height: isCollapsed ? 0 : 'auto', overflow: 'hidden' }}>
  {children}
</div>

// Good
<div
  aria-hidden={isCollapsed}
  style={{ display: 'grid', gridTemplateRows: isCollapsed ? '0fr' : '1fr', transition: 'grid-template-rows 0.3s ease-out' }}
>
  <div style={{ overflow: 'hidden', visibility: isCollapsed ? 'hidden' : 'visible', pointerEvents: isCollapsed ? 'none' : 'auto' }}>
    {children}
  </div>
</div>
```

**When to check**: any new collapsible/accordion component.

### #24 — `transition: 'all'` instead of specific properties

`transition: all` animates unintended properties and can be expensive. Always enumerate the specific properties being transitioned.

```tsx
// Bad — caught by lint-review-patterns (#24)
style={{ transition: 'all 0.15s ease' }}

// Good
style={{ transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease' }}
```

### #25 — Inline hex literals instead of `colors.ts` constants

This codebase centralizes all hex values in `apps/web/src/constants/colors.ts`. Using raw hex in component files creates drift. Caught by `lint-review-patterns` for `.tsx` files.

```tsx
// Bad
backgroundColor: '#ffffff';
color: '#1B3A5C';

// Good
import { BRAND_NAVY, BACKGROUND_PRIMARY } from '../../constants/colors';
backgroundColor: BACKGROUND_PRIMARY;
color: BRAND_NAVY;
```

**When to check**: any inline color value in `apps/web/**/*.tsx` or `lib/shared-components/**/*.tsx`.

### #26 — `throw new Error()` in GraphQL resolvers for input validation

Client input validation errors thrown as plain `Error` surface to GraphQL clients as `INTERNAL_SERVER_ERROR`. Use `UserInputError` from the shared error helpers so clients receive `BAD_USER_INPUT`.

```typescript
// Bad — client sees INTERNAL_SERVER_ERROR
if (!VALID_DRAFT_ORDERS.includes(draftOrder)) {
  throw new Error(`Invalid draftOrder: ${draftOrder}`);
}

// Good — client sees BAD_USER_INPUT
import { UserInputError } from '../graphql-errors';
if (!VALID_DRAFT_ORDERS.includes(draftOrder)) {
  throw new UserInputError(`Invalid draftOrder: ${draftOrder}`);
}
```

**When to check**: any input validation in `lambdas/db/src/schema/**/*.ts` resolver/mutation files.

### #27 — `localStorage` / `sessionStorage` writes without try/catch

Storage APIs throw in private browsing mode and when quota is exceeded. Always wrap writes in try/catch to make persistence best-effort.

```typescript
// Bad — throws and breaks the page in private mode
localStorage.setItem('collapsed', JSON.stringify(sections));

// Good
try {
  localStorage.setItem('collapsed', JSON.stringify(sections));
} catch {
  // Storage unavailable (private mode / quota) — non-critical, ignore
}
```

### #28 — Unsafe `as 'literal-union'` cast on unvalidated external data

Casting unvalidated strings from GraphQL args, user input, or API responses directly to a union type using `as` masks future regressions. Use a type guard or explicit validation instead.

```typescript
// Bad — no runtime check; any string passes the type system
const order = args.draftOrder as 'snake' | 'linear';

// Good — validates and narrows
const VALID_ORDERS = ['snake', 'linear'] as const;
type DraftOrder = (typeof VALID_ORDERS)[number];
if (!VALID_ORDERS.includes(args.draftOrder as DraftOrder)) {
  throw new UserInputError(`Invalid draftOrder`);
}
const order: DraftOrder = args.draftOrder as DraftOrder; // safe after guard
```

> Full coding standards catalog: [../../standards/references/standards-catalog.md](../../standards/references/standards-catalog.md)

---

## Patterns from 100-PR Analysis (May 2026)

These patterns were identified by analyzing reviewer bot CHANGES_REQUESTED findings across 100 consecutive merged PRs. 47 of 100 PRs triggered at least one review cycle; these patterns account for 78% of all issues. They are ordered by frequency.

### #29 — LOGGER.error/warn called with non-Error second argument ⭐ (most frequent: 13/100 PRs)

The `RollbarOutputDestination` scans arguments for `instanceof Error` to capture stack traces. Any non-Error second argument causes Rollbar to synthesize a generic error with no stack. This includes wrapping the error in an object, passing `err.message` (string), or passing a named shorthand `{ err }`.

```typescript
// All wrong — Rollbar loses the stack trace
LOGGER.error('Failed', { err }); // named shorthand wraps Error in object
LOGGER.error('Failed', { error: err }); // named key wraps Error in object
LOGGER.error('Failed', { error: err.message }); // string, not Error
LOGGER.error('Failed', err.message); // string, not Error
LOGGER.warn('Something odd', { err }); // same issue applies to LOGGER.warn

// Correct — pass the Error instance directly as the second argument
LOGGER.error('Failed', err as Error);
LOGGER.error('Failed', err as Error, { userId }); // extra context as third arg is fine
LOGGER.warn('Something odd', err as Error);
```

**Rule**: the second argument to `LOGGER.error` / `LOGGER.warn` must always be the raw `Error` instance (or omitted). Extra context goes in the _third_ argument as a plain object.

### #30 — Missing or incomplete test coverage for new logic

Shipping new mutations, resolvers, components, or bug fixes without tests — or with tests that only cover the happy path / input validation, not the behavior actually changed.

Sub-patterns caught repeatedly:

- **New component with filtering/search/pagination logic and no spec file** — every new component that has more than simple rendering needs a spec
- **Bug fix where tests only cover input validation, not the fixed behavior** — if the fix is "wrap in a transaction", the test must assert transactional behavior, not just that bad input rejects
- **New mutation with no unauthenticated (`user: null`) test** — see #4 above; applies to every new resolver/mutation, not just public ones
- **New route component with data-fetching logic and no tests** — even if the route renders a child component, the routing/loading/error states need coverage

### #31 — PR description does not match the diff

The reviewer bot reads the PR description as a contract and flags discrepancies. Common triggers:

- Description says `SomeComponent.spec.tsx` was updated; diff shows no change to that file
- Description claims a dynamic `require()` was used; diff shows a static `import`
- Generated `*.generated.ts` files changed but PR description has no explanation
- PR touches multi-file functionality but description only mentions one file

**Rule**: before pushing, read your own diff and verify each claim in the PR description is accurate. When generated files change (even unexpectedly from a rebase), note it in the description.

### #32 — Missing range/null validation on GraphQL mutation arguments

Mutation arguments used directly without range checks allow malformed inputs to reach business logic. The bot flags this as a security/contract violation.

```typescript
// Bad — negative numTeams, out-of-range pickPosition, null values all reach the DB
async initializeMockDraft(_, args: { numTeams: number; userPickPosition: number; pickTimeLimit: number }) {
  return initDraft(args.numTeams, args.userPickPosition, args.pickTimeLimit);
}

// Good — validate before use
if (args.numTeams < 2 || args.numTeams > 20) {
  throw new UserInputError('numTeams must be between 2 and 20');
}
if (args.userPickPosition < 1 || args.userPickPosition > args.numTeams) {
  throw new UserInputError('userPickPosition out of range');
}
```

Also applies to:

- Optional fields that can be `null`/`undefined` — guard before use: `if (args.pitcherStarts == null)` not `if (!args.pitcherStarts)`
- Enum-style string arguments — validate against the allowed set with `UserInputError` (see #26, #28)
- CLI flags that accept file paths — guard against `../` traversal with `path.resolve` + prefix check

### #33 — Loading state not reset after mutation failure

When a mutation fails, UI loading state must be reset to `false` so the user can retry. The bot caught multiple cases where `setLoading(false)` was present only in the success path.

```typescript
// Bad — button stays disabled forever after a failure
const handleSubmit = async () => {
  setLoading(true);
  try {
    await myMutation();
    setLoading(false); // only on success
  } catch (err) {
    LOGGER.error('Mutation failed', err as Error);
    // loading stays true — user can never retry
  }
};

// Good
const handleSubmit = async () => {
  setLoading(true);
  try {
    await myMutation();
  } catch (err) {
    LOGGER.error('Mutation failed', err as Error);
    setError('Something went wrong. Please try again.');
  } finally {
    setLoading(false); // always reset
  }
};
```

### #34 — Missing authorization check (authentication ≠ authorization)

Checking that a user is logged in is not sufficient — every resolver that accepts a `leagueId` or resource ID must also verify that the authenticated user has access to that specific resource.

```typescript
// Bad — any authenticated user can read any league's matchup data
async matchupScores(_, { leagueId }, { user }) {
  if (!user) throw new AuthenticationError('Not authenticated');
  return getMatchupScores(leagueId); // no membership check
}

// Good
async matchupScores(_, { leagueId }, { user }) {
  if (!user) throw new AuthenticationError('Not authenticated');
  const member = await getLeagueMember(leagueId, user.id);
  if (!member) throw new ForbiddenError('Not a member of this league');
  return getMatchupScores(leagueId);
}
```

**When to check**: any resolver that takes a `leagueId`, `teamId`, `draftId`, or similar resource identifier.

### #35 — Wrong numeric type in Drizzle schema (integer vs bigint)

Using `integer` for columns that are `BIGINT` in the database silently overflows for large stat aggregates (career totals, etc.). Use the matching Drizzle type.

```typescript
// Bad — BIGINT column mapped as integer (silent overflow for values > 2^31)
export const careerStats = pgTable('career_stats', {
  totalTackles: integer('total_tackles'),
  soloTackles: integer('solo_tackles'),
});

// Good
export const careerStats = pgTable('career_stats', {
  totalTackles: bigint('total_tackles', { mode: 'number' }),
  soloTackles: bigint('solo_tackles', { mode: 'number' }),
});
```

Also: when adding a `NOT NULL DEFAULT false` column, type it as `boolean` (not `Maybe<boolean>`) in the Drizzle model — the schema guarantees it is never null.

### #36 — Multi-column sort with single-column cursor pagination

When a query sorts by multiple columns, the `after` cursor must include all sort columns — not just `id`. A cursor filtering only on `id` skips or duplicates records across pages when rows share the same leading sort values.

```typescript
// Bad — sorts by (lastName, firstName, id) but cursor only filters by id
const players = await db
  .select()
  .from(footballPlayers)
  .orderBy(asc(lastName), asc(firstName), desc(id))
  .where(after ? lt(id, after) : undefined); // cursor misses lastName/firstName tiebreaks

// Good — cursor encodes all sort columns
const players = await db
  .select()
  .from(footballPlayers)
  .orderBy(asc(lastName), asc(firstName), desc(id))
  .where(
    after
      ? or(
          gt(lastName, after.lastName),
          and(eq(lastName, after.lastName), gt(firstName, after.firstName)),
          and(
            eq(lastName, after.lastName),
            eq(firstName, after.firstName),
            lt(id, after.id),
          ),
        )
      : undefined,
  );
```

### #37 — Weak test assertions (`toBeDefined()` instead of checking the value)

Tests that only assert a variable is defined pass even when the actual value is wrong. Always assert the concrete expected value.

```typescript
// Bad — passes even if scoringFormat is 'standard' or undefined
expect(mutationInput).toBeDefined();
expect(mutationInput.scoringFormat).toBeDefined();

// Good — asserts the actual value being tested
expect(mutationInput.scoringFormat).toBe('half_ppr');
```

Also: off-by-one in depth/truncation tests — if `maxDepth` means "truncate at this depth", assert truncation _at_ `maxDepth`, not `maxDepth - 1`.

For E2E feature-flag fixtures: avoid unconditionally mocking flags to `true` — at minimum have one test exercising the flag-disabled path.

### #38 — Duplicate constants across packages (DRY violation)

Constants like sport defaults, position maps, and roster sizes that appear in more than one package create silent drift. The bot flags these as DRY violations requiring extraction to a shared lib.

```typescript
// Bad — same constant defined in three places
// lambdas/db/src/schema/leagues/sport-validation.ts
const DEFAULT_ROSTER_SIZE_BY_SPORT = { baseball: 25, football: 15 };

// lib/db-client/src/lib/services/LeagueService.ts
const DEFAULT_ROSTER_SIZE_BY_SPORT = { baseball: 25, football: 15 };

// lib/shared-components/src/config/sports.ts
const DEFAULT_ROSTER_SIZE_BY_SPORT = { baseball: 25, football: 15 };

// Good — define once in lib/shared-components or lib/utils, import everywhere
import { DEFAULT_ROSTER_SIZE_BY_SPORT } from '@legacy-sports/shared-components/config/sports';
```

**When to check**: any time you copy a constant from another file rather than importing it. If the receiving package can't import the source package, the constant belongs in a lower-level shared lib.

### #39 — Committed local path / symlink artifact (**CRITICAL**)

Committing a file that is a symlink pointing to an absolute local path (e.g. `D:/code/legacy-sports/certs`) or that embeds a hardcoded local path breaks CI and every other contributor's environment.

```bash
# Check before committing any new files:
git status --short          # look for unexpectedly tracked files
file <new-file>             # on Linux/Mac: reveals if it's a symlink
ls -la <new-file>           # shows symlink target
```

If `git diff --staged` shows a new file entry that is a symlink or contains a Windows absolute path, **remove it from staging** (`git restore --staged <file>`) and add it to `.gitignore`.

### #40 — `console.*` / `process.stdout.write` in application code

All application code (lambdas, resolvers, services, React components, libraries) must use `LOGGER` from `@legacy-sports/logging`. The only exceptions are: `lib/logging/` itself, `apps/cli/`, `lib/db-client/src/cli/`, `lib/db-client/src/scripts/`, migration files, and build-time scripts.

```typescript
// Bad — in a lambda handler, resolver, or shared lib
console.log('Processing event', event);
console.error('Failed to load config', err);
process.stdout.write(JSON.stringify(result) + '\n');

// Good
import { LOGGER } from '@legacy-sports/logging';
LOGGER.info('Processing event', { event });
LOGGER.error('Failed to load config', err as Error);
```

**When to check**: any new file in `lambdas/`, `lib/` (non-CLI), or `apps/web/`. `make pc` will catch `console.*` via ESLint but not `process.stdout.write` — check manually in new files.

### #41 — Error message leaked directly to UI

Internal error messages (from DB queries, GraphQL mutations, external APIs) contain stack traces, query details, or internal paths that must not be shown to users.

```typescript
// Bad — leaks internal mutation error detail to the UI
const [doMutation] = useMutation(MY_MUTATION);
const handleClick = async () => {
  const result = await doMutation();
  if (result.errors) {
    setError(result.errors[0].message); // leaks "Could not find league with id=123 in table..."
  }
};

// Good — show a safe generic message; log the real error
if (result.errors) {
  LOGGER.error('Mutation failed', new Error(result.errors[0].message));
  setError('Something went wrong. Please try again.');
}
```

### #42 — Terraform resource rename without `moved {}` block

Renaming a Terraform resource (e.g. `aws_sqs_queue.old_name` → `aws_sqs_queue.new_name`) causes Terraform to destroy and recreate it, even if the underlying infrastructure is unchanged. Use a `moved {}` block to preserve state.

```hcl
# Bad — plan will show: -/+ aws_sqs_queue.old_name (destroy and recreate)
resource "aws_sqs_queue" "new_name" { ... }

# Good — state is preserved, no destroy
moved {
  from = aws_sqs_queue.old_name
  to   = aws_sqs_queue.new_name
}
resource "aws_sqs_queue" "new_name" { ... }
```

**When to check**: any rename of a Terraform resource or module block address. See `.agents/skills/terraform-permission-planning/SKILL.md`.

### #43 — Shell variable left empty on command failure (GHA scripts)

Wrapping a command with `|| true` suppresses the exit code but leaves the variable as an empty string. Downstream string comparisons then silently misbehave.

```bash
# Bad — HAS_LABEL is "" on jq failure, not "0"
HAS_LABEL=$(jq -r '...' <<< "$LABELS" 2>/dev/null || true)
if [[ "$HAS_LABEL" == "0" ]]; then ...  # never true when jq fails

# Good — provide an explicit fallback
HAS_LABEL=$(jq -r '...' <<< "$LABELS" 2>/dev/null) || HAS_LABEL="0"
# or
HAS_LABEL=$(jq -r '...' <<< "$LABELS" 2>/dev/null || echo "0")
```

Also applies to unquoted variables in `for` loops — `for f in $pattern` expands globs and splits on spaces; quote: `for f in "$pattern"` or use an array.

---

## Quick Self-Review Checklist (all patterns)

Before every push, scan your diff against this checklist:

| Check                                                                                  | Patterns      |
| -------------------------------------------------------------------------------------- | ------------- |
| Every `LOGGER.error`/`.warn` call passes a raw `Error` as the 2nd arg                  | #29           |
| Every new component/resolver/mutation/bug-fix has a spec covering the changed behavior | #30           |
| PR description accurately describes the diff (no missing files, no wrong filenames)    | #31           |
| Generated `*.generated.ts` changes are explained in the PR body                        | #16, #31      |
| GraphQL mutation args have range/null/enum validation with `UserInputError`            | #26, #28, #32 |
| `setLoading(false)` (and equivalent) resets in `finally`, not only in success path     | #33           |
| Every resolver that takes a resource ID checks membership/ownership, not just auth     | #4, #34       |
| Drizzle BIGINT columns use `bigint()`, not `integer()`                                 | #35           |
| Multi-column `orderBy` cursors encode all sort columns                                 | #36           |
| Test assertions check concrete values, not just `toBeDefined()`                        | #37           |
| No constant duplicated across packages — import from shared lib                        | #38           |
| No committed symlinks or files containing `D:/` / `C:/` local paths                    | #39           |
| No `console.*` or `process.stdout.write` in non-CLI app code                           | #40           |
| Error messages shown to users are generic strings, not `err.message`                   | #41           |
| Terraform resource renames use `moved {}` blocks                                       | #42           |
| Shell variables have explicit fallbacks after `\|\| true` patterns                     | #43           |
| No `@ts-ignore` or `eslint-disable` (fix root cause instead)                           | standards     |

---

## CI / Reviewer Infrastructure Recovery Recipes

These are not review findings — they are CI check failures from the reviewer infra itself. They look alarming but each has a single, mechanical recovery. Knowing them prevents wasted "what's broken?" investigation cycles.

### "SHA Sanity Check" failed twice (or more) on the same PR

- **Symptom**: in the check rollup, two or more failed runs of `🔐 SHA Sanity Check` plus a failed `review` check from `Reviewer (W1)`.
- **Root cause**: a force-push (typically a rebase) landed while a `Reviewer (W1)` run was already in flight. The reviewer's recorded base SHA no longer matches HEAD, so the SHA Sanity Check fails and the review run aborts.
- **Recovery**: push a fresh commit (or a rebase that lands a new HEAD SHA) **after** the cancelled run finishes. The next `synchronize` event with `bot:ready-for-review` present fires a clean cycle. Do **not** just re-toggle the label without a new SHA — Reviewer (W1) will fail SHA Sanity again on the same HEAD.
- **Reference PRs**: #4324, #4349, #4359 (2026-05-26 sweep).

### "Verify All Migrations Applied" check failed

- **Symptom**: this single check is failing in CI; the PR otherwise looks fine. Often appears on long-running PRs.
- **Root cause**: a migration was added to `main` after this branch diverged; the workflow detects the gap.
- **Recovery**: rebase to current `main`, run `db_migrate(worktreePath: "<wt>")` locally to confirm a clean apply, then push. Do **not** add a no-op migration — the fix is purely the rebase.
- **Reference PRs**: #4315, #4259 (2026-05-26 sweep).
