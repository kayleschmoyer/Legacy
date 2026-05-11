# Artifact: RFC (Request for Comments)

A short design document produced before non-trivial work. The RFC is the place to surface alternatives, constraints, and risks **while change is cheap** — before any code is written.

## When required

- Medium-tier and higher entrypoints: 5 (new-feature), 6 (refactor), 8 (migration), 12 (experimentation).
- All spikes (entrypoint 11) — the spike's deliverable _is_ the RFC.
- Any architectural decision that an ADR would otherwise capture standalone.

## When NOT required

- Low-tier entrypoints: 9 (docs-only), 11 (spike with no architectural implication).
- Critical-tier incidents (1, 3, 13) — the postmortem replaces the RFC.
- Bug fixes where the cause is mechanical and the fix is obvious (entrypoint 2 below Medium tier).

## Path

- Draft: `docs/rfcs/draft-<slug>.md`
- Accepted: `docs/rfcs/LS-####-<slug>.md`

The slug is short, kebab-case, and stable (used in URLs). The Jira key is added on acceptance.

## Required sections

| Section                      | Purpose                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| `# Title`                    | Verb phrase: "Migrate draft state to Postgres" not "Postgres for drafts" |
| `## Status`                  | One of: Draft / Accepted / Superseded by [LS-####](#) / Withdrawn        |
| `## Problem`                 | What is broken or missing today, in concrete terms. No solutions yet.    |
| `## Goals`                   | Bulleted list of what success looks like.                                |
| `## Non-goals`               | What we are deliberately not solving.                                    |
| `## Proposal`                | The recommended approach, in enough detail to estimate.                  |
| `## Alternatives Considered` | At least two alternatives + why rejected.                                |
| `## Risks`                   | What can go wrong, and the mitigation.                                   |
| `## Test Plan`               | How we will know the change works (links to or embeds the test plan).    |
| `## Rollout`                 | Migration / feature flag / staged release plan if applicable.            |
| `## Open Questions`          | Unresolved items requiring input. Empty section is OK.                   |

Optional: `## Appendix` for diagrams, benchmarks, raw data.

## Lifecycle

1. **Draft**: Author creates `docs/rfcs/draft-<slug>.md` with `Status: Draft`.
2. **Review**: PR titled `RFC(draft): <title>` opened. Reviewers comment inline. Bot review applies normal rules.
3. **Accepted**: Author moves file to `docs/rfcs/LS-####-<slug>.md`, sets `Status: Accepted`, lands the PR. The RFC is now the source of truth for that decision.
4. **Superseded**: Future RFC sets the previous one's status to `Superseded by [LS-####](path)` in the same PR that introduces the replacement. The old RFC stays in place — never deleted.

## Anti-patterns

- ❌ RFC written _after_ implementation. The RFC is a design tool; retroactive RFCs are documentation-as-theater.
- ❌ "Alternatives Considered: none." If you cannot name a rejected alternative, you have not designed.
- ❌ RFC for a 50-line bug fix. RFCs have overhead; use them when overhead is worth it.

## Tool surface

Planned MCP tools (not yet implemented; spec frozen here for future tooling work):

- `rfc_create({ slug, ticket?, title })` — scaffold the file with required sections, idempotent if already exists.
- `rfc_validate({ path })` — return `{ valid, missingSections, brokenLinks }`.
- `rfc_list_open()` — list all RFCs with `Status: Draft`.
- `rfc_accept({ path, ticket })` — rename `draft-*.md` → `LS-####-*.md` and set `Status: Accepted`.

## Related

- [ADR](adr.md) — for narrow architectural decisions that don't warrant a full RFC.
- [Test plan](test-plan.md) — referenced from the RFC's Test Plan section.
- [Template](../templates/rfc-template.md).
