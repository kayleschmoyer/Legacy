# Gate: Documentation Freshness

Documentation drifts the moment a code change ships without a corresponding doc update. This gate prevents that with a **touch-map** (mechanical: change file X, update doc Y) and a **quarterly audit ritual** (judgment: each area owner re-reads their docs cold).

## The touch-map

When code in the **left column** changes, update the doc in the **right column** in the **same PR**. If you cannot find the relevant doc to update, the area's docs are missing — file a doc ticket as a follow-up.

| Code area                             | Required doc update                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `lib/db-client/migrations/`           | Schema docs, ERD if present, [repo-tooling SKILL.md](../../repo-tooling/SKILL.md) if migration commands change |
| `lib/db-client/src/`                  | Schema docs, downstream codegen consumers                                                                      |
| `apps/web/src/pages/`                 | Sitemap or routing reference; update navigation diagrams                                                       |
| `apps/web/src/pages/auth/`            | [AGENTS.md auth notes](../../../AGENTS.md), security docs                                                      |
| `lambdas/*/src/handler.ts`            | Lambda's own README; deploy docs if config changed                                                             |
| `terraform/`                          | Terraform module README; any SKILL.md referencing the resource                                                 |
| `tools/mcp/<server>/`                 | [mcp-first SKILL.md](../../mcp-first/SKILL.md) tool table                                                      |
| `scripts/`                            | Script docstring; AGENTS.md if it's a workflow script                                                          |
| `.github/workflows/`                  | [workflow-overview SKILL.md](../../workflow-overview/SKILL.md) phase tables                                    |
| `package.json` engines / pnpm version | AGENTS.md environment notes                                                                                    |
| Any new MCP tool                      | [mcp-first SKILL.md](../../mcp-first/SKILL.md) substitution table                                              |
| Any new make target                   | [repo-tooling SKILL.md](../../repo-tooling/SKILL.md)                                                           |
| Any new slash command                 | AGENTS.md slash command list                                                                                   |
| GraphQL schema (`*.graphql`)          | Generated artifacts via `make codegen`; consumer docs                                                          |
| Test tagging conventions              | [test-tagging-guide](../../testing/references/test-tagging-guide.md)                                           |
| Coding standards rule changes         | [standards SKILL.md](../../standards/SKILL.md), top-review-findings table                                      |

This table is **incomplete by design** — extend it as new areas develop reference docs. The pre-PR checklist requires consulting it; missing entries are a doc gap to file.

## The quarterly audit ritual

Once per quarter (calendar Q1 / Q2 / Q3 / Q4), each skill owner:

1. Reads their owned skills cold (no recent context).
2. For each statement, asks: "Is this still true?"
3. Walks through the linked references; do they still resolve and make sense?
4. Files a `docs/<area>` ticket for any gap or staleness found.
5. Records the audit in `docs/dev-process/audits/YYYY-Q[1-4]-<area>.md` (single short file per area per quarter).

The audit is not optional. Skills that go unaudited for a quarter are flagged in the next quarterly review.

## In-PR doc rules

- **No "I'll document it later" tickets.** If the change ships without docs, the docs will not catch up.
- **Code examples in docs must be executable.** Copy them to a scratch file and run them as part of self-review.
- **Linked file paths, env vars, tool names must exist.** Verify with `Glob` or `Grep` before committing.
- **No marketing prose.** Docs are reference material — terse, accurate, scannable.

## When the touch-map is wrong

If you change code in an area where the touch-map says one doc but you discover _another_ doc is also affected, update both in the PR AND extend the touch-map in the same PR. The touch-map should grow with the docs.

## When no doc exists for the touched area

The area lacks reference docs — this is itself a finding. File a doc ticket and reference it in the PR. Do not invent docs ad-hoc; that risks creating doc-shaped material that diverges from the actual reference docs once they exist.

## Tooling spec

Planned (not yet implemented): a CI check `lint-touch-map` that reads the touch-map, identifies which `Code area` rows the PR's diff matches, and verifies that **at least one** of the corresponding `Required doc update` files is also touched. Failures are advisory (label, not block) until the touch-map's coverage is proven sufficient.

## Anti-patterns

- ❌ Skipping the touch-map check because "the doc change is trivial." If it's trivial, do it.
- ❌ Updating only the line you noticed; not auditing the surrounding section for related drift.
- ❌ Adding new code that should be in the touch-map without extending the touch-map. Future PRs will miss it.
- ❌ Quarterly audit logs left empty. The audit is the artifact; without the log it didn't happen.

## Related

- [Spine: Phase 5 Document](../spine.md#phase-5-document)
- [pre-PR checklist](pre-pr-checklist.md)
