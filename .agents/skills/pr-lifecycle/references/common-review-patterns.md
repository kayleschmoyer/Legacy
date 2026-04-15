# Common Copilot Review Patterns

These issues appear in 80%+ of Copilot reviews. Knowing them speeds up fixes.

## Pattern Summary

| #   | Pattern                                                        | Fix                                                                         | Caught by              |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------- |
| 1   | `jest.doMock('@legacy-sports/utils', ...)` for `getDbOptions`  | Change to `@legacy-sports/utils/node` + `...jest.requireActual(...)` spread | Manual                 |
| 2   | `postData.includes('getleague')` matches `getLeagueTeams` etc. | Use quoted `'"getleague"'` or reorder specific-first                        | Manual                 |
| 3   | Header comment overclaims test coverage                        | Audit actual test names and trim header to match                            | Manual                 |
| 4   | Missing UNAUTHENTICATED guard test                             | Add test calling resolver with `user: null`, assert `UNAUTHENTICATED`       | Manual                 |
| 5   | `route.fallback()` leaks to real network                       | Replace with `route.fulfill({ json: { data: {} } })`                        | `lint-review-patterns` |
| 6   | `LOGGER.error({ error })` — Rollbar ignores wrapped object     | Use `LOGGER.error('message', error)` with Error as direct arg               | `lint-review-patterns` |
| 7   | `data: null` mock response                                     | Use `{ data: { queryName: null } }` or `{ data: { queryName: [] } }`        | Manual                 |
| 8   | Wrong GraphQL field names in mocks                             | Check actual `.graphql` query files for correct field names                 | Manual                 |
| 9   | Test name doesn't match assertion                              | Rename test to describe what it actually asserts                            | Manual                 |
| 10  | Process/scope comments (PR title, splitting)                   | Resolve thread directly — no code change needed                             | Manual                 |
| 11  | Silent error swallowing in catch blocks                        | Return `{ success: false, error }` or re-throw                              | `lint-review-patterns` |
| 12  | Git ref injection via args starting with `-`                   | Validate ref doesn't start with `-` before passing to git                   | `lint-review-patterns` |
| 13  | Missing pagination for Jira/GitHub API queries                 | Add `maxResults`/`perPage` and handle nextPage cursor                       | Manual                 |
| 14  | `shell: true` with user input enables injection                | Use array args with `shell: false`                                          | `lint-review-patterns` |
| 15  | Codegen output manually edited                                 | Fix source `.graphql` or schema and run `make codegen`                      | Manual                 |
| 16  | PR description doesn't explain codegen diff                    | Add explanation in PR body when generated files change                      | Manual                 |
| 17  | MCP tools return success on partial failure                    | Set `isError: true` and report `{ total, succeeded, failed }`               | Manual                 |
| 18  | Docs reference nonexistent MCP tools                           | Verify tool names exist in `tools/mcp/*/src/` before referencing            | Manual                 |
| 19  | Dev/prod ternary forgets staging                               | Use `{ dev: X, staging: Y, prod: Z }[env]`                                  | `lint-review-patterns` |
| 20  | Unbounded tool output                                          | Cap with `.slice(0, N)` and include `{ truncated: true, total }`            | `lint-review-patterns` |
| 21  | Nullable GraphQL field in string interpolation / aria-label    | Null-check or provide fallback before interpolating                         | Manual                 |
| 22  | `role="button"` without `tabIndex={0}`                         | Add `tabIndex={0}` and `onKeyDown`; prefer native `<button>`                | `lint-review-patterns` |
| 23  | Collapsed content stays in accessibility tree                  | Add `aria-hidden`, `visibility: hidden`, `pointerEvents: none` when hidden  | Manual                 |
| 24  | `transition: 'all'` instead of specific properties             | Enumerate only the properties being transitioned                            | `lint-review-patterns` |
| 25  | Inline hex literal instead of `colors.ts` constant             | Import and use named constant from `apps/web/src/constants/colors.ts`       | `lint-review-patterns` |
| 26  | `throw new Error()` in GraphQL resolver for input validation   | Use `UserInputError` from `lambdas/db/src/schema/graphql-errors.ts`         | `lint-review-patterns` |
| 27  | `localStorage`/`sessionStorage` write without try/catch        | Wrap in try/catch — storage throws in private mode and on quota exceeded    | `lint-review-patterns` |
| 28  | Unsafe `as 'literal-union'` cast on unvalidated external data  | Use type guard with allowed-values array instead of bare `as` assertion     | Manual                 |

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
