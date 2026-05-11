# Artifact: ADR (Architecture Decision Record)

A small, immutable record of a single architectural decision and its context. ADRs follow [Michael Nygard's format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions). Once accepted they are **never edited** — only superseded by a new ADR.

## When required

Any decision that:

- Constrains future choices (choosing one library over another, one boundary over another).
- Is non-obvious from the code (a future reader would ask "why did we do this?").
- Has more than one defensible answer.

ADRs are **lighter than RFCs** — use an ADR when the decision is narrow and the alternatives short. Use an RFC when the problem itself needs framing.

ADRs may also be **embedded in an RFC** — every RFC implicitly produces ADRs for its key decisions. Promote those to standalone ADRs when accepted if they constrain choices outside the RFC's scope.

## Path

- `docs/decisions/NNNN-<slug>.md` where `NNNN` is a zero-padded auto-incrementing number (`0001`, `0002`, …).
- Numbers are **never reused**, even when ADRs are superseded.

## Required sections

| Section            | Purpose                                                                       |
| ------------------ | ----------------------------------------------------------------------------- |
| `# NNNN. Title`    | Title is a noun phrase: "Use Apollo Client cache for normalized state"        |
| `Date: YYYY-MM-DD` | Decision date                                                                 |
| `## Status`        | One of: Proposed / Accepted / Deprecated / Superseded by ADR-NNNN             |
| `## Context`       | What forces are at play. What problem is being solved. (No prescription yet.) |
| `## Decision`      | The chosen approach, stated in active voice. "We will…"                       |
| `## Consequences`  | What becomes easier, what becomes harder, what is now constrained.            |

Keep the whole document under 200 lines. ADRs are reference docs, not essays.

## Immutability rule

Once an ADR has `Status: Accepted`, its content is frozen. To change an architectural decision:

1. Create a new ADR (`NNNN+1`) that supersedes the old one.
2. In the same PR, update the old ADR's `Status:` line to `Superseded by ADR-NNNN+1`.
3. Do **not** edit any other line of the old ADR.

This preserves the historical reasoning and prevents the "but the doc said…" confusion.

## Anti-patterns

- ❌ Editing an accepted ADR to "clarify" or "update". Use a new ADR.
- ❌ Combining multiple decisions into one ADR. One decision per ADR — supersession is per-decision.
- ❌ ADR for an obvious choice (e.g., "Use TypeScript"). ADRs document _non-obvious_ choices.
- ❌ ADR without a `Consequences` section. The trade-off is the point.

## Tool surface

MCP tools implemented in `tools/mcp/dev-process-server/` (server: `legacy-sports-dev-process`):

- ✅ `adr_create({ title, slug })` — scaffold next-numbered ADR, idempotent.
- ✅ `adr_supersede({ oldNumber, newNumber })` — atomically update old ADR status and link.
- ✅ `adr_list({ status? })` — list ADRs, optionally filtered.

## Related

- [RFC](rfc.md) — for broader design discussions; ADRs may be promoted out of RFCs.
- [Template](../templates/adr-template.md).
- Industry reference: [adr.github.io](https://adr.github.io/) — the broader ADR community.
