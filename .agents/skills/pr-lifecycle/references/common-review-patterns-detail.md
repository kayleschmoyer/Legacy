# Common Review Patterns — Detail

Full explanations, code examples, and rationale for every pattern listed in the [common-review-patterns.md](common-review-patterns.md) checklist. Jump to a pattern via the checklist's numbered links, or scroll — patterns are in the same order.

## #1 — jest.doMock wrong module path

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

## #2 — Broad postData.includes() matching

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

## #4 — Missing UNAUTHENTICATED guard test (backend resolvers only)

Every new resolver or mutation under `lambdas/` must have a test that calls it with `user: null` and asserts the `UNAUTHENTICATED` error code.

**Scope**: applies only to `lambdas/**/*.spec.ts`. Do NOT flag frontend component tests (`apps/app/**`, `apps/web/**`, `lib/**`) — the component mock-based test infrastructure cannot assert server-level error codes. Frontend tests satisfy the requirement by testing the `skip:` guard and graceful null-data handling, not by asserting a server error code.

```typescript
// ✅ Backend (lambdas/) — required pattern
it('throws UNAUTHENTICATED when user is null', async () => {
  const result = await resolvers.Query.getLeague(null, { leagueId: '1' }, { user: null });
  expect(result.extensions.code).toBe('UNAUTHENTICATED');
});

// ✅ Frontend (apps/web/, apps/app/, lib/) — satisfying pattern
it('renders nothing when user is unauthenticated', () => {
  mockUseCurrentUser.mockReturnValue({ user: null });
  render(<Scoreboard leagueId="1" />);
  // Query has skip: !user — nothing fires, component renders graceful empty state
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
```

Reference: LS-7762 — Pattern #4 was incorrectly firing on frontend component tests, causing 5+ bot review cycles on PR #4841.

## #5 — route.fallback() in the wrong layer

Within the 3-layer mock architecture (test → auth.ts → baseline), test handlers should use `route.fallback()` to cascade to the next layer — this is correct. But `route.continue()` is **always forbidden** in E2E tests. See `.agents/skills/testing/SKILL.md` for the full layer architecture.

## #6 — LOGGER.error() error wrapping

`RollbarOutputDestination` scans args for `arg instanceof Error` to extract stack traces. Wrapping in `{ error }` hides the Error instance.

```typescript
// Wrong — Rollbar synthesizes generic Error, loses stack trace
LOGGER.error('Failed to load', { error });

// Correct — Rollbar extracts original stack trace
LOGGER.error('Failed to load', error);
LOGGER.error('Failed to load', error, { userId });
```

Reference: `lib/rollbar/src/lib/RollbarOutputDestination.ts` lines 33–34.

## #7 — Mock response data structure

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

## #11 — Silent error swallowing in catch blocks

Empty `catch {}` or catch blocks that return success hide failures from agents and users.

```typescript
// Bad
catch {}
catch (e) { return { success: true }; }

// Good
catch (e) { return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: e.message }) }], isError: true }; }
```

## #12 — Argument injection via refs/args starting with `-`

User-supplied git refs or CLI args starting with `-` get interpreted as flags.

```typescript
// Bad — ref could be "--exec=malicious"
const args = ['checkout', ref, '--', path];

// Good
if (ref.startsWith('-')) throw new Error('Invalid ref');
const args = ['checkout', ref, '--', path];
```

## #13 — Missing pagination for Jira/GitHub API queries

Jira defaults to 50 results, GitHub GraphQL to 100. Results silently truncate.

## #14 — `shell: true` with user input enables injection

Pass args as arrays with `shell: false`. Only use `shell: true` on Windows with validated input.

## #15 — Codegen output manually edited

Never edit `*.generated.*` files. Fix the source `.graphql` or schema and run `make codegen`.

## #16 — PR description doesn't explain codegen diff

When generated files change (from rebase/codegen), explain why in the PR description.

## #17 — MCP tools return success on partial failure

Batch operations that fail some items must set `isError: true` and report `{ total, succeeded, failed }`.

## #18 — Docs reference nonexistent MCP tools

Verify tool names exist in `tools/mcp/*/src/` before referencing in docs or skills.

## #19 — Dev/prod ternary forgets staging

Use `{ dev: X, staging: Y, prod: Z }[env]` instead of `env === 'dev' ? X : Y`.

## #20 — Unbounded tool output

Tools returning variable-length data (diffs, logs, file lists) must cap output and indicate truncation.

---

## UI & Component Patterns (from cloud reviewer analysis, April 2026)

These patterns appear consistently in Copilot cloud reviewer comments on UI changes. Local agents must check them during self-review. Patterns #22, #24, #25, #26, and #27 are caught automatically by `make lint-review-patterns`. Patterns #21, #23, and #28 require manual judgment — they cannot be reliably detected by regex.

## #21 — Nullable GraphQL field in string interpolation / aria-label

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

## #22 — `role="button"` without `tabIndex` (keyboard inaccessible)

Non-button elements with `role="button"` are not focusable by keyboard without `tabIndex={0}`. Also requires a `:focus-visible` style.

```tsx
// Bad — keyboard users can't reach this
<div role="button" onClick={toggle}>Label</div>

// Good — or better: use a native <button>
<div role="button" tabIndex={0} onKeyDown={handleKey} onClick={toggle}>Label</div>
```

**When to check**: any `role="button"` added to a non-`<button>` element.

## #23 — Collapsed content stays in accessibility tree

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

## #24 — `transition: 'all'` instead of specific properties

`transition: all` animates unintended properties and can be expensive. Always enumerate the specific properties being transitioned.

```tsx
// Bad — caught by lint-review-patterns (#24)
style={{ transition: 'all 0.15s ease' }}

// Good
style={{ transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease' }}
```

## #25 — Hardcoded colors instead of Tamagui theme tokens

Both light and dark themes are supported on every page (epic LS-8518). Raw hex/rgba literals — and imports of the dark-only constants files (`apps/web/src/constants/colors.ts`, `lib/shared-components/src/utils/colors.ts`, being retired under LS-8526) — render identically in both themes and break one of them. So do the banned `$blue1`–`$blue12` tokens and `theme="blue"` (generic Tailwind blue). The theme-compliance ratchet (`make lint-theme-compliance`, LS-8519) fails `custom-checks` on any count increase.

```tsx
// Bad
backgroundColor: '#ffffff';
color: '#1B3A5C';
import { BRAND_NAVY } from '../../constants/colors'; // dark-only constant
backgroundColor: '$blue9'; // banned generic blue

// Good — theme tokens resolve per active theme
backgroundColor: '$background';
color: '$brandNavy';
// Raw-CSS strings (web): use theme-aware CSS vars
background: 'linear-gradient(135deg, var(--surfacePanel), var(--brandNavy))';
```

**When to check**: any color value in `apps/web/**`, `apps/app/**`, or `lib/shared-components/**`. Full token table and `$blue*` replacement map: `.agents/skills/ui/references/brand-colors.md`.

## #26 — `throw new Error()` in GraphQL resolvers for input validation

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

## #27 — `localStorage` / `sessionStorage` writes without try/catch

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

## #28 — Unsafe `as 'literal-union'` cast on unvalidated external data

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

## #29 — LOGGER.error/warn called with non-Error second argument ⭐ (most frequent: 13/100 PRs)

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

## #30 — Missing or incomplete test coverage for new logic

Shipping new mutations, resolvers, components, or bug fixes without tests — or with tests that only cover the happy path / input validation, not the behavior actually changed.

Sub-patterns caught repeatedly:

- **New component with filtering/search/pagination logic and no spec file** — every new component that has more than simple rendering needs a spec
- **Bug fix where tests only cover input validation, not the fixed behavior** — if the fix is "wrap in a transaction", the test must assert transactional behavior, not just that bad input rejects
- **New mutation with no unauthenticated (`user: null`) test** — see #4 above; applies to every new resolver/mutation under `lambdas/`, not just public ones. Frontend component tests satisfy this differently — see #4 detail for the scoping rule.
- **New route component with data-fetching logic and no tests** — even if the route renders a child component, the routing/loading/error states need coverage

## #31 — PR description does not match the diff

The reviewer bot reads the PR description as a contract and flags discrepancies. Common triggers:

- Description says `SomeComponent.spec.tsx` was updated; diff shows no change to that file
- Description claims a dynamic `require()` was used; diff shows a static `import`
- Generated `*.generated.ts` files changed but PR description has no explanation
- PR touches multi-file functionality but description only mentions one file

**Rule**: before pushing, read your own diff and verify each claim in the PR description is accurate. When generated files change (even unexpectedly from a rebase), note it in the description.

## #32 — Missing range/null validation on GraphQL mutation arguments

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

## #33 — Loading state not reset after mutation failure

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

## #34 — Missing authorization check (authentication ≠ authorization)

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

## #35 — Wrong numeric type in Drizzle schema (integer vs bigint)

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

## #36 — Multi-column sort with single-column cursor pagination

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

## #37 — Weak test assertions (`toBeDefined()` instead of checking the value)

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

## #38 — Duplicate constants across packages (DRY violation)

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

## #39 — Committed local path / symlink artifact (**CRITICAL**)

Committing a file that is a symlink pointing to an absolute local path (e.g. `D:/code/legacy-sports/certs`) or that embeds a hardcoded local path breaks CI and every other contributor's environment.

```bash
# Check before committing any new files:
git status --short          # look for unexpectedly tracked files
file <new-file>             # on Linux/Mac: reveals if it's a symlink
ls -la <new-file>           # shows symlink target
```

If `git diff --staged` shows a new file entry that is a symlink or contains a Windows absolute path, **remove it from staging** (`git restore --staged <file>`) and add it to `.gitignore`.

## #40 — `console.*` / `process.stdout.write` in application code

All application code (lambdas, resolvers, services, React components, libraries) must use `LOGGER` from `@legacy-sports/logging`. The only exceptions are: `lib/logging/` itself, `apps/cli/`, `lib/db-client/src/cli/`, `lib/db-client/src/scripts/`, the **top-level `scripts/` directory**, migration files, and build-time scripts.

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

**Do NOT flag `console.*` in `scripts/`.** Many scripts there (bootstrap/toolchain glue
like `preinstall-guard.js`, `modules-pool/*.mjs`, `mcp-mint-token.mjs`) run before
`node_modules` is installed or outside the workspace dependency graph and therefore
**cannot import `@legacy-sports/logging`** — `console.*` is the correct and expected
output mechanism there. The directory is exempt by design (see `AGENTS.md` and
`scripts/README.md`). Separately: if a `scripts/` file _does_ import `@legacy-sports/*`
(a data-operation script), the right review note is not "use `LOGGER`" but "this should
likely be an `apps/cli` command" — see `scripts/README.md` § _Before you add a script_.

**When to check**: any new file in `lambdas/`, `lib/` (non-CLI), or `apps/web/`. `make pc` will catch `console.*` via ESLint but not `process.stdout.write` — check manually in new files.

## #41 — Error message leaked directly to UI

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

## #42 — Terraform resource rename without `moved {}` block

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

**When to check**: any rename of a Terraform resource or module block address. See `.agents/skills/terraform/references/permission-planning.md`.

## #43 — Shell variable left empty on command failure (GHA scripts)

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

## #46 — Gated-feature spec runs as `free` without a gate assertion

Both Playwright suites use a tiered test-user model: **premium is the default**, `free` is reserved for explicit gate assertions, `admin` for admin surfaces. A spec that exercises a premium-gated feature while authenticated as a free user **must** assert that the gate engages — otherwise it silently tests the feature's _locked_ state and a real regression in the unlocked path sails through green. This is the LS-5030 failure mode in seed form (premium-gated specs flipped to free, ~28 specs silently broke repo-wide).

```typescript
// Bad — free user on a premium feature, no gate assertion. Vacuously green.
await useTier(page, 'free');
await page.goto('/players/compare');
await expect(page.getByRole('heading', { name: /compare/i })).toBeVisible(); // passes even if gate is broken

// Good (feature test) — premium is the DEFAULT; usually no opt-in at all.
await page.goto('/players/compare');
await expect(page.getByTestId('comparison-table')).toBeVisible();

// Good (gate test) — free is intentional AND the gate is asserted.
await useTier(page, 'free');
await page.goto('/players/compare');
await expect(page.getByText(/upgrade to premium/i)).toBeVisible(); // ← the gate assertion
```

When reviewing: if a spec calls `useTier(page, 'free')` or pulls `freeJwt` / `freeJwt2`, confirm it asserts the gate (upgrade CTA, `PREMIUM_REQUIRED` error, disabled affordance, `PremiumGate` overlay). If not, switch it back to the premium default. Full convention + integration examples: [Tiered Test-User Model](../../testing/SKILL.md#tiered-test-user-model-premium-default-free-for-gates).

## #47 — Platform-conditional layout instead of viewport breakpoints

UI components are **platform-agnostic**: the same component renders on web (`react-native-web`) and native, and layout adapts solely by viewport width. An `isWeb` / `Platform.OS` branch that changes layout gives mobile-web users the desktop layout and native-tablet users the phone layout — both wrong.

```tsx
// Bad — platform decides layout; breaks mobile web and tablets
import { isWeb } from 'tamagui';
return isWeb ? <SideBySidePanels /> : <StackedPanels />;

// Bad — same mistake, React Native flavor
const columns = Platform.OS === 'web' ? 3 : 1;

// Good — viewport width decides, identically on every platform
const media = useMedia();
return media.gtMd ? <SideBySidePanels /> : <StackedPanels />;

// Good — inline media props for pure restyling
<XStack flexDirection="row" $sm={{ flexDirection: 'column' }} />;
```

Platform branches are acceptable **only** as capability shims (native-only APIs, DOM-only CSS like `backdrop-filter`, font-family resolution) and must never change layout, spacing, visibility, or component structure. Existing `isWeb` layout branches in the codebase are migration debt, not precedent.

**When to check**: any diff adding `isWeb`, `Platform.OS`, `Platform.select`, `.native.tsx`, or `platform-components/` files in `lib/shared-components/**`, `apps/web/**`, or `apps/app/**`. Also flag new UI built directly in `apps/web` or `apps/app` that the other platform will need — it belongs in `lib/shared-components` (see `.agents/skills/shared-components-first/SKILL.md`).

**The same-size escalation of this pattern is a full file-level fork**, not just an inline branch: a new `Mobile<Feature>Screen.tsx` (or similar) sitting next to an existing `<Feature>Screen.tsx` in `lib/shared-components`, duplicating substantial layout/JSX instead of branching by breakpoint inside the shared component. This is worse than an inline `isWeb` branch because it's harder to spot in review (two whole files, not one conditional) and it can re-diverge a component that was already unified — see LS-8794 re-forking `HomeScreen.tsx` after LS-7791 had unified it. "I don't want to risk regressing the other platform mid-build" is not a valid reason to fork; it's exactly what `useMedia`/`$sm`/`$gtMd` branches inside one component are for, since the two render paths are already independent. If a temporary fork is unavoidable, block the PR until a re-merge ticket is filed and linked in a top-of-file comment — a commit-message mention of "tracked separately" without a Jira key does not count. See the "Re-forking an already-unified component" anti-pattern in `.agents/skills/shared-components-first/SKILL.md`.

---

## #48 — New MCP tool where an action param would do, or a superseded tool left registered

**The cost**: a tool definition (name + description + input schema) is advertised to the model up front, so **every registered tool bills every session whether or not it is called**. Measured 2026-08-23: 256 tools, ~89,250 tokens, averaging 349 tokens/tool. Input schemas cost roughly 2× descriptions. The count has only ever gone up — 81 (April) → 173 (June) → 219 (August), with no net removal.

**Two failure modes to catch:**

1. **A new tool where an action param would do.** If the new tool shares a domain noun and most of its schema with an existing tool on the same server, it should be an `action` enum value or an optional param on that tool. Genuinely-different schemas still warrant a separate tool — merging unrelated tools into a wide union of mutually-exclusive optionals is worse than leaving them apart.

2. **A consolidation that leaves the old tool registered.** This is the more expensive mistake and it has already happened twice. `jira_transition` absorbed the claim/bulk actions and grew to 1,361 tokens while `jira_claim_ticket` (622) and `jira_bulk_transition` (171) stayed registered as "thin aliases" — **net +740 tokens for a change intended to save**. Same on github with `github_list_review_comments` (319) and `github_list_pr_inline_comments` (294). A consolidation PR that does not deregister saves nothing.

**When to check**: any diff touching `tools/mcp/**` that adds or changes a `server.tool(` registration, or any diff whose `docs/mcp/api-reference.json` hunk shows a net tool increase.

**Reviewer checklist**:

- Could this be an `action` value or optional param on an existing tool in the same server?
- If it supersedes something: is the old registration removed — from the stdio server **and** the hosted Lambda mirror (`lambda.ts` drifts behind `index.ts`, LS-9509)?
- Are all call sites updated (`.agents/skills/**`, `.claude/commands/**`, `.github/prompts/**`, `docs/**`)? A dangling pointer is worse than the alias was.
- Is `docs/mcp/api-reference.json` regenerated (`make mcp-api-reference`)?
- Does the PR body cite a measured before/after token delta (`scripts/mcp-token-measure`)?
- If tokens dropped, was the CI ceiling lowered in the same commit? Unlocked savings get re-spent by the next tool added.

**Partly automated**: `make lint-mcp-api-reference` fails on exceeding a per-server count/token ceiling, but it cannot tell a justified new tool from one that should have been an action — that judgment stays with the reviewer.

**Standard**: [mcp-tool-consolidation.md](../../create/references/mcp-tool-consolidation.md). Response-payload cost is a separate axis — see pattern #45 and [mcp-response-format.md](../../create/references/mcp-response-format.md).
