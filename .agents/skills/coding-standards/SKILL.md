---
name: coding-standards
description: 'Coding standards derived from 100 PRs of Copilot review findings (March 2026). Covers security, error handling, codegen, API patterns, testing, types, and documentation. Agents should follow these during implementation to avoid common review findings. Load when: writing new code, MCP tools, Terraform, Storybook stories, E2E tests, or modifying docs/skills.'
---

# Skill: Coding Standards

Standards derived from analysis of Copilot code review across 100 merged PRs. These are the most frequent review findings — agents should follow them during implementation, not wait for review to catch violations.

## Quick Reference

| Category     | Rule                                                            | Count |
| ------------ | --------------------------------------------------------------- | ----- |
| **Codegen**  | Never edit `*.generated.*` files — fix source + `make codegen`  | 20+   |
| **Codegen**  | Explain generated file changes in PR description                | 20+   |
| **Security** | Reject git refs/args starting with `-` (argument injection)     | 5     |
| **Security** | Prefer `shell: false` + args array over `shell: true`           | 3     |
| **Security** | Validate/escape JQL inputs, validate Jira keys with regex       | 3     |
| **Security** | Reject path traversal (`../`, absolute paths) in file params    | 3     |
| **Errors**   | Every `catch` must re-throw, log, or return error context       | 5     |
| **Errors**   | MCP tools: set `isError: true` on partial/full failure          | 3     |
| **Errors**   | Preserve error cause chain with `{ cause: e }`                  | 3     |
| **API**      | Paginate Jira (50 limit) and GitHub GraphQL (100 limit) queries | 4     |
| **API**      | Handle `dev`/`staging`/`prod` explicitly — no boolean ternary   | 3     |
| **Docs**     | Verify MCP tool names exist before referencing in docs          | 5     |
| **Docs**     | Update comments/docs when changing behavior                     | 4     |
| **Docs**     | Cross-check PR description against actual implementation        | 4     |
| **Output**   | Cap unbounded tool output, report `truncated: true`             | 3     |
| **Output**   | Use consistent response formats within an MCP server            | 3     |
| **Testing**  | Assert behavior after interaction, not just element existence   | 3     |
| **Testing**  | Deterministic story data — no `Math.random()` or `Date.now()`   | 3     |
| **Testing**  | Use canonical config values in mock data                        | 3     |
| **Types**    | Define explicit interfaces — no `Record<string, unknown>`       | 3     |
| **Regex**    | Anchor patterns: `\.tf$`, `(/\|$)` after prefix, `\b` for words | 3     |
| **Reuse**    | Search for existing utils before writing duplicate logic        | 4     |

### Validation Before Push

> **⚠️ CRITICAL: Run `make pc` before pushing.** Every agent that modifies code must validate before pushing. Skipping saves 5 min but each CI failure costs 40-60 min in re-dispatch + CI queue time. Minimum alternative: `make format && make lint-fix && make typecheck`.

All code must pass `make pc` before being pushed. This runs formatting, linting, type checking, and tests — the same gates CI enforces. Pushing without validation is the #1 cause of avoidable CI failures.

## Detailed Standards

> Full catalog with code examples: [references/standards-catalog.md](references/standards-catalog.md)

### Security & Input Validation

**Argument injection**: Validate that user-supplied git refs, branch names, and CLI args do not start with `-`. Use `--` to separate options from positional arguments.

```typescript
// Bad
const args = ['ls-tree', ref, '--', path];

// Good
if (ref.startsWith('-')) throw new Error('Invalid ref: must not start with -');
const args = ['ls-tree', ref, '--', path];
```

**Shell injection**: Prefer `spawn`/`execFile` with `shell: false` and pass arguments as an array. If `shell: true` is required (Windows), validate all interpolated values.

**Query injection**: Validate Jira keys with `/^[A-Z]+-\d+$/`. Never interpolate raw user input into JQL or search queries.

**Path traversal**: Resolve file paths against the intended root and reject escapes: `if (!resolved.startsWith(rootDir)) throw`.

### Generated Files & Codegen

**Never manually edit `*.generated.*` files.** Fix the source (`.graphql` files, schema, codegen config) and run `make codegen`.

**Explain codegen changes in PR descriptions.** If generated files changed from rebase or schema updates, note why (e.g., "Codegen re-ran after rebase picked up new fields from main").

### Error Handling

**No silent swallowing**: Every catch block must re-throw, return error context, or log. Never `catch {}`.

```typescript
// Bad
catch {}

// Good
catch (e) { throw new Error('context', { cause: e }); }
catch (e) { LOGGER.warn('Non-critical', e); }
```

**MCP partial failure**: Set `isError: true` when batch operations partially fail. Report `{ total, succeeded, failed }`.

**Preserve cause**: Use `{ cause: originalError }` when re-throwing to preserve stack traces.

### API & Data Patterns

**Pagination**: Any list query to Jira REST (50 default) or GitHub GraphQL (100 default) must handle pagination. Never assume results fit in one page.

**Environment handling**: Handle all three environments explicitly:

```typescript
// Bad
const retention = env === 'dev' ? 30 : 90;

// Good
const retention = { dev: 7, staging: 30, prod: 90 }[env];
```

**Jira ADF**: Jira Cloud REST v3 requires Atlassian Document Format for descriptions, not plain text strings.

### Documentation

**Verify MCP tool references**: Before naming an MCP tool in docs/skills, confirm it exists in `tools/mcp/*/src/`.

**Update docs with code**: When changing behavior, grep for all comments/docs referencing it and update in the same PR.

**PR description accuracy**: Cross-check every claim in the PR description against actual code.

### Testing & Stories

**Assert behavior**: After simulating interaction (click, type), assert the expected outcome — not just element existence. Use `getByRole` over `getByText` for interactive elements.

**Deterministic data**: No `Math.random()`, `Date.now()` in stories. Use fixed values. Keep args JSON-serializable (no `Set`, `Map`).

**Canonical mock values**: Import values from actual config (`SPORT_CONFIGS`, enums) rather than guessing position codes or team abbreviations.

### Type Safety

**Explicit interfaces**: Define named interfaces for API responses and tool results. No `Record<string, unknown>` for structured data. No `as never` or `as any`.

**React Native styles**: Use `StyleProp<ViewStyle>`, not raw `ViewStyle`.

### Output & Response

**Cap output**: Tools returning variable-length data must enforce a max size and report `{ truncated: true, totalLines }`.

**Consistent formats**: Within an MCP server, use the same response shape for all tools — same field names, same error format.

### Regex

**Anchor patterns**: `\.tf$` for extensions, `(/|$)` after URL prefixes, `\b` for word boundaries. Loose patterns match unintended strings.

### Code Reuse

**Search before writing**: Check `lib/utils`, `lib/api`, and sibling files for existing implementations. If logic appears in two places, extract to a shared helper immediately.

## Related Skills

- [review](../review/SKILL.md) — self-review checklist (references this skill)
- [fix-copilot-reviews](../fix-copilot-reviews/SKILL.md) — batch-fix Copilot review comments
- [no-lint-disable](../no-lint-disable/SKILL.md) — lint suppression rules
- [no-edit-generated](../no-edit-generated/SKILL.md) — codegen file rules
