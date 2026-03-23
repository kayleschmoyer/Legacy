# Common Copilot Review Patterns

These issues appear in 80%+ of Copilot reviews. Knowing them speeds up fixes.

## Top 10 Pattern Summary

| #   | Pattern                                                        | Fix                                                                         |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | `jest.doMock('@legacy-sports/utils', ...)` for `getDbOptions`  | Change to `@legacy-sports/utils/node` + `...jest.requireActual(...)` spread |
| 2   | `postData.includes('getleague')` matches `getLeagueTeams` etc. | Use quoted `'"getleague"'` or reorder specific-first                        |
| 3   | Header comment overclaims test coverage                        | Audit actual test names and trim header to match                            |
| 4   | Missing UNAUTHENTICATED guard test                             | Add test calling resolver with `user: null`, assert `UNAUTHENTICATED`       |
| 5   | `route.fallback()` leaks to real network                       | Replace with `route.fulfill({ json: { data: {} } })`                        |
| 6   | `LOGGER.error({ error })` — Rollbar ignores wrapped object     | Use `LOGGER.error('message', error)` with Error as direct arg               |
| 7   | `data: null` mock response                                     | Use `{ data: { queryName: null } }` or `{ data: { queryName: [] } }`        |
| 8   | Wrong GraphQL field names in mocks                             | Check actual `.graphql` query files for correct field names                 |
| 9   | Test name doesn't match assertion                              | Rename test to describe what it actually asserts                            |
| 10  | Process/scope comments (PR title, splitting)                   | Resolve thread directly — no code change needed                             |

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

> Full coding standards catalog: [../../standards/references/standards-catalog.md](../../standards/references/standards-catalog.md)
