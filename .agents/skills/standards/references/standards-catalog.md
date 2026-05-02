# Coding Standards Catalog

Standards extracted from Copilot code review across 100 merged PRs (March 2026). Agents should follow these during implementation.

## Security & Input Validation (14 occurrences)

### Argument injection via git refs/args starting with `-`

Git refs, branch names, and CLI arguments supplied by users or tool parameters can start with `-`, causing them to be interpreted as flags.

**Rule**: Validate that user-supplied git refs, branch names, and command arguments do not start with `-`. Use `--` to separate options from positional arguments in git commands.

```typescript
// Bad
const args = ['ls-tree', ref, '--', path];

// Good
if (ref.startsWith('-')) throw new Error('Invalid ref: must not start with -');
const args = ['ls-tree', ref, '--', path];
```

### `shell: true` enables command injection

Using `child_process.exec` or `spawn({ shell: true })` allows metacharacters in interpolated values to execute arbitrary commands.

**Rule**: Prefer `spawn`/`execFile` with `shell: false` and pass arguments as an array. If `shell: true` is required (e.g., Windows compatibility), escape or validate all interpolated values. Document the security rationale.

### JQL/query injection

Interpolating user input directly into JQL or search queries can break syntax or enable injection.

**Rule**: Validate Jira issue keys with `/^[A-Z]+-\d+$/`. Escape special characters in free-text query fields. Never interpolate raw user input into query strings.

### Path traversal in file parameters

File path parameters passed to tools can contain `../` or absolute paths to escape the intended directory.

**Rule**: Resolve file paths against the intended root directory and reject any path that escapes it: `if (!resolved.startsWith(rootDir)) throw`.

## Generated Files & Codegen (20+ occurrences)

### Never manually edit `*.generated.*` files

This was the single most frequent review comment. Agents edit `graphql.generated.ts` directly, which gets overwritten on the next codegen run.

**Rule**: Never edit files matching `*.generated.*`. Fix the source (`.graphql` files, schema, codegen config) and run `make codegen`.

### Explain codegen changes in PR descriptions

When codegen output changes as a side-effect of rebasing or schema changes, reviewers can't tell if it's expected.

**Rule**: If a PR includes changes to generated files, the PR description must explain why (e.g., "Codegen re-ran after rebase picked up new SeasonBatting fields from main"). If unrelated to the ticket, call it out explicitly.

## Error Handling (12 occurrences)

### Don't swallow errors silently

Empty catch blocks, catch-and-ignore, and `catch {}` patterns make failures invisible.

**Rule**: Every catch block must either re-throw, return an error response with context, or log the error. Never use empty catch blocks. Preserve error cause chains:

```typescript
// Bad
catch {}
catch (e) { /* ignore */ }

// Good
catch (e) { throw new Error('context message', { cause: e }); }
catch (e) { LOGGER.warn('Non-critical failure', e); }
```

### Return `isError` on partial/full failure

MCP tools return success even when batch operations partially fail, preventing agents from detecting issues.

**Rule**: MCP tool handlers must set `isError: true` when the operation fails or partially fails. For batch operations, report `{ total, succeeded, failed }` and set `isError: true` when `failed > 0`.

### Preserve error context and cause

Wrapping errors in new `Error()` drops the original stack trace and context.

**Rule**: Use `{ cause: originalError }` when re-throwing. Don't drop error details:

```typescript
// Bad
throw new Error('operation failed');

// Good
throw new Error('operation failed', { cause: e });
```

## API & Data Patterns (8 occurrences)

### Paginate queries that can exceed default limits

Jira (50 default), GitHub GraphQL (100 default) silently truncate results.

**Rule**: Any list query to Jira REST or GitHub GraphQL must handle pagination. Check `total > startAt + maxResults` (Jira) or `pageInfo.hasNextPage` (GitHub). Never assume results fit in one page.

### Handle all environment variants explicitly

`dev`/`prod` ternaries forget `staging`, causing it to silently fall into the wrong branch.

**Rule**: When writing environment-conditional logic, handle all three environments explicitly. Use a switch/map with exhaustive check:

```typescript
// Bad
const retention = env === 'dev' ? 30 : 90;

// Good
const retention = { dev: 7, staging: 30, prod: 90 }[env];
```

### Jira Cloud REST v3 expects ADF, not plain text

Setting `fields.description` to a raw string returns 400 — Jira Cloud v3 requires Atlassian Document Format.

**Rule**: When setting Jira issue descriptions via REST v3, format as ADF:

```json
{
  "type": "doc",
  "version": 1,
  "content": [
    { "type": "paragraph", "content": [{ "type": "text", "text": "..." }] }
  ]
}
```

## Documentation & Descriptions (9 occurrences)

### Reference only existing MCP tools in docs

Docs reference tool names that don't exist (`ci_auto_fix`, `github_rebase_pr`, `jira_edit_ticket`), misleading agents.

**Rule**: Before referencing an MCP tool name in documentation or skill files, verify it exists in the actual MCP server source code (`tools/mcp/*/src/`). Never speculatively name tools.

### Update comments and docs when behavior changes

Code behavior changes but inline comments, JSDoc, and skill docs still describe the old behavior.

**Rule**: When changing function/tool/workflow behavior, search for all comments and docs that reference that behavior and update them in the same PR. Use grep for function names, tool names, and key terms.

### Align PR description with implementation

PR descriptions claim features or behaviors that differ from what the code actually does.

**Rule**: After writing the PR description, cross-check every claim against the actual code. If the description says "blocks X, Y, Z", verify the code blocks exactly X, Y, Z.

## Output & Response Patterns (6 occurrences)

### Cap unbounded output

Tools returning variable-length output (diffs, logs, file listings) can exceed context limits.

**Rule**: Any tool returning variable-length output must enforce a max size and indicate truncation: `{ lines: [...], truncated: true, totalLines: 5000 }`.

### Use consistent response formats

Tools in the same server use different JSON shapes for success/error responses, different field names for the same concept.

**Rule**: Within an MCP server, use a consistent response schema. All tools should format errors the same way, use the same field names for equivalent concepts (e.g., always `totalLines` not sometimes `totalLines` and sometimes `totalLogLines`).

## Testing & Stories (6 occurrences)

### Assert behavior, not just existence

Tests click a button but don't assert the outcome. Stories render a component but don't verify interaction results.

**Rule**: After simulating user interaction (click, type, submit), assert the expected outcome (state change, DOM update, callback invocation). Use `getByRole` over `getByText` for interactive elements.

### Use deterministic values in Storybook stories

`Math.random()` in story data makes stories non-deterministic and breaks visual regression testing.

**Rule**: Never use `Math.random()`, `Date.now()`, or other non-deterministic values in Storybook stories. Use fixed, representative values. Keep story args JSON-serializable (no `Set`, `Map`, or class instances).

### Use canonical config values in mock data

Mock data uses position codes, team abbreviations, or enum values that don't match the actual config.

**Rule**: When creating mock data, import and use values from the actual config (`SPORT_CONFIGS`, enum definitions) rather than guessing.

## Type Safety (5 occurrences)

### Avoid loose generic types

Using `Record<string, unknown>`, `as never`, `as any` instead of explicit interfaces.

**Rule**: Define explicit TypeScript interfaces for API responses, tool results, and function return values. Don't use `Record<string, unknown>` for structured data — create a named type.

### Use `StyleProp<ViewStyle>` not `ViewStyle` for React Native

Direct `ViewStyle` type doesn't allow arrays, null, or false values that RN style props accept.

**Rule**: React Native style props should be typed as `StyleProp<ViewStyle>` (or `StyleProp<TextStyle>`, etc.), not the raw style type.

## Regex Patterns (3 occurrences)

### Tighten regex to match exact boundaries

Loose patterns match unintended strings (e.g., `/api` matches `/api-docs`, `.tf` matches `.tfvars`).

**Rule**: Anchor regex patterns with appropriate boundaries:

- File extensions: use `\.tf$` not `\.tf`
- URL paths: require path boundary `(/|$)` after prefix
- Word matching: use `\b` or explicit delimiters

## Code Duplication (4 occurrences)

### Extract duplicated logic into shared utilities

Same sanitization, parsing, or classification logic copied across multiple files.

**Rule**: Before implementing logic, search for existing implementations in `lib/utils`, `lib/api`, and sibling files. If you find yourself writing the same logic in two places, extract to a shared helper immediately — don't leave it for a follow-up.

## Platform & Environment (3 occurrences)

### Use platform-appropriate filesystem operations

`unlinkSync()` may fail for Windows directory symlinks. Platform-specific behavior differs.

**Rule**: When writing filesystem operations that may encounter symlinks, use platform-appropriate methods. Test edge cases on the target platform.

### `withAlpha()` requires hex color format

The `withAlpha(color, opacity)` utility only works with `#RRGGBB` hex. Named colors, RGB strings, or other formats produce invalid output.

**Rule**: When using `withAlpha()`, ensure the color argument is `#RRGGBB` hex. For non-hex colors, use CSS `opacity` property or `fill` + `opacity` attributes in SVG instead.

## UI & Component Patterns (from cloud reviewer analysis, April 2026)

These patterns appear consistently in PRs that modify UI components in `apps/web` and `lib/shared-components`. Patterns #22, #24, #25, #26, and #27 are caught automatically by `make lint-review-patterns`; patterns #21, #23, and #28 require manual judgment.

### Nullable GraphQL fields in JSX and aria-labels (#21)

GraphQL fields typed `String` (without `!`) can be `null`. Direct interpolation produces `"...null..."` strings in the UI or aria-labels.

**Rule**: Cross-reference the `.graphql` query file to confirm `!` non-null before interpolating. Always provide a fallback for nullable fields.

```tsx
// Bad — playerName is nullable (String in schema, not String!)
aria-label={`Draft ${rec.playerName} now`}
<span>{rec.playerName}</span>

// Good
aria-label={rec.playerName ? `Draft ${rec.playerName} now` : 'Draft player'}
<span>{rec.playerName ?? 'Unknown player'}</span>
```

**When to check**: any new string interpolation or JSX render using a field from a GraphQL query result.

### `role="button"` without keyboard support (#22)

Non-`<button>` elements with `role="button"` are not focusable by keyboard without `tabIndex={0}`. Also requires a `:focus-visible` style and an `onKeyDown` handler.

**Rule**: Add `tabIndex={0}` and `onKeyDown` when using `role="button"` on a non-button element. Prefer native `<button>` to get this behavior for free.

```tsx
// Bad — keyboard users can't reach this
<div role="button" onClick={toggle}>Label</div>

// Good (or better: use <button>)
<div role="button" tabIndex={0} onKeyDown={handleKeyDown} onClick={toggle}>Label</div>
```

### Collapsed content stays in the accessibility tree (#23)

Animating `height` or `opacity` to visually hide content does not remove it from the tab order or screen reader tree.

**Rule**: When collapsing content, apply `aria-hidden={isCollapsed}`, `visibility: hidden`, and `pointerEvents: none`. The `display: none` or `inert` attribute are also acceptable.

```tsx
// Bad — hidden content is still reachable by keyboard and screen reader
<div style={{ height: isCollapsed ? 0 : 'auto', overflow: 'hidden' }}>
  {children}
</div>

// Good — animate only transform/opacity (never layout-triggering properties)
<div style={{ overflow: 'hidden' }}>
  <div
    aria-hidden={isCollapsed}
    style={{
      opacity: isCollapsed ? 0 : 1,
      transform: isCollapsed ? 'scaleY(0)' : 'scaleY(1)',
      transformOrigin: 'top',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
      visibility: isCollapsed ? 'hidden' : 'visible',
      pointerEvents: isCollapsed ? 'none' : 'auto',
    }}
  >
    {children}
  </div>
</div>
```

### `transition: 'all'` instead of specific properties (#24)

`transition: all` animates unintended properties (including layout-triggering ones) and forces the browser to check every property on every frame.

**Rule**: Always enumerate the specific CSS properties being transitioned. Only animate `transform` and `opacity` for performance; never animate `width`, `height`, `padding`, or `margin`.

```tsx
// Bad
style={{ transition: 'all 0.15s ease' }}

// Good
style={{ transition: 'background-color 0.15s ease, border-color 0.15s ease' }}
```

### Inline hex literals instead of `colors.ts` constants (#25)

Hex values are centralized in per-package color constants files. Raw hex in component files creates drift and defeats theming.

- `apps/web`: `apps/web/src/constants/colors.ts`
- `lib/shared-components`: `lib/shared-components/src/utils/colors.ts` (`lib/shared-components` cannot depend on `apps/web` — Nx module boundaries)

**Rule**: Import and use named constants from the appropriate colors file instead of inline hex strings. Never reach across package boundaries for colors.

```tsx
// Bad
backgroundColor: '#1B3A5C';

// Good — in apps/web
import { BRAND_NAVY } from '../../constants/colors';
backgroundColor: BRAND_NAVY;

// Good — in lib/shared-components
import { BRAND_NAVY } from '../utils/colors';
backgroundColor: BRAND_NAVY;
```

### `throw new Error()` for input validation in GraphQL resolvers (#26)

Client input errors thrown as plain `Error` surface as `INTERNAL_SERVER_ERROR`. Use project-specific error types so clients receive the correct GraphQL error code.

**Rule**: In `lambdas/db/src/schema/**` resolver and mutation files, use `UserInputError` from `../graphql-errors` for all input validation failures.

```typescript
// Bad — client sees INTERNAL_SERVER_ERROR
throw new Error(`Invalid draftOrder: ${draftOrder}`);

// Good — client sees BAD_USER_INPUT
// Note: UserInputError is a function, not a constructor — no `new`
import { UserInputError } from '../graphql-errors';
throw UserInputError(`Invalid draftOrder: ${draftOrder}`);
```

### `localStorage`/`sessionStorage` writes without `try/catch` (#27)

Storage APIs throw synchronously in private browsing mode and when quota is exceeded. An unhandled throw breaks the page.

**Rule**: Wrap all `localStorage` and `sessionStorage` writes in `try/catch`. The catch block should silently ignore — persistence is best-effort, not load-bearing. This is an **approved exception** to the general "every catch must re-throw, log, or return error context" standard; it applies only to client-side storage writes where a failure is never load-bearing.

```typescript
// Bad — throws and breaks the page in private mode
localStorage.setItem('prefs', JSON.stringify(value));

// Good
try {
  localStorage.setItem('prefs', JSON.stringify(value));
} catch {
  // Storage unavailable (private mode / quota) — non-critical
}
```

### Unsafe `as 'literal-union'` cast on unvalidated external data (#28)

Casting strings from GraphQL args, user input, or API responses directly to a union type with `as` bypasses runtime safety. An out-of-range value will satisfy TypeScript but fail at runtime.

**Rule**: Use a type guard with an allowed-values array. Throw `UserInputError` (in resolvers) or a runtime error on invalid input instead of relying on `as`.

```typescript
// Bad — any string passes the type system
const order = args.draftOrder as 'snake' | 'linear';

// Good
const VALID_ORDERS = ['snake', 'linear'] as const;
type DraftOrder = (typeof VALID_ORDERS)[number];
if (!(VALID_ORDERS as readonly string[]).includes(args.draftOrder)) {
  throw UserInputError(`Invalid draftOrder: ${args.draftOrder}`);
}
const order = args.draftOrder as DraftOrder; // safe after guard
```
