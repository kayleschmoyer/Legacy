# Documentation Structure & Lifecycle Policy

How `docs/` is organized, where a new document goes, and how documents are marked stale or archived. The directory inventory itself lives in one place — the table in [README.md](README.md) — and is not repeated here.

## The two layers

| Layer                                   | Audience                                   | Authority for                                                       |
| --------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| `docs/`                                 | Humans (and agents as a reference library) | Architecture, product intent, decisions, incident history, runbooks |
| [`.agents/skills/`](../.agents/skills/) | Agents (entry: [AGENTS.md](../AGENTS.md))  | Operational procedure: how to build, validate, ship, operate        |

When both cover a topic, the skill is operationally authoritative and the doc provides orientation and rationale. Do not restate a skill's procedure in `docs/` (or vice versa) — link to it. The anti-drift rules in [skill-authoring](../.agents/skills/skill-authoring/SKILL.md) (one home per fact, anchors not line numbers, no unmaintained counts, date-stamped volatile facts) apply to `docs/` prose as much as to skills.

## Where a new document goes

| You are writing…                                         | Put it in…                            | Format/authority                                                                                             |
| -------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| An architectural decision (chosen, not proposed)         | `docs/decisions/NNNN-slug.md`         | [ADR artifact spec](../.agents/skills/dev-process/artifacts/adr.md); append-only, supersede rather than edit |
| A design proposal needing review                         | `docs/rfcs/LS-####-slug.md`           | [RFC artifact spec](../.agents/skills/dev-process/artifacts/rfc.md)                                          |
| A postmortem (incident, CVE, revert, Critical-tier work) | `docs/postmortems/YYYY-MM-DD-slug.md` | [postmortems/README.md](postmortems/README.md)                                                               |
| A test plan too large for one PR body                    | `docs/test-plans/`                    | [test-plans/README.md](test-plans/README.md) — default home is still the PR body                             |
| A root-cause analysis of a fixed bug                     | `docs/fixes/`                         | Index it in [fixes/README.md](fixes/README.md)                                                               |
| An oncall/admin procedure                                | `docs/operations/`                    | Runbook format per [operations/README.md](operations/README.md)                                              |
| System design reference                                  | `docs/architecture/`                  | —                                                                                                            |
| Product intent (tiers, pricing, feature promises)        | `docs/product/`                       | Human-owned; agents treat as source of truth                                                                 |
| A how-to for humans                                      | `docs/guides/`                        | If agents need it operationally, it belongs in a skill instead                                               |
| Agent operating procedure                                | `.agents/skills/<name>/`              | [skill-authoring](../.agents/skills/skill-authoring/SKILL.md); lint with `node scripts/lint-skills.js`       |

Never hand-edit `docs/design/` (machine-owned by the sync commands `/sync-designs` and `/pull-design` — see [design/README.md](design/README.md)).

## Status markers

Every directory carries a status in the [README.md directory map](README.md#directory-map): **Current**, **Mixed** (check per-doc dates), **Historical**, **Legacy** (superseded, replacement named), **Machine-owned**, or **Aspirational**.

For an individual stale document, add a banner directly under the H1 rather than deleting it:

```markdown
> **Status: historical (YYYY-MM-DD).** Superseded by [link]. Kept for context.
```

Rules:

- A doc that states point-in-time facts (a launch state, a staged rollout, an open bug) must date-stamp them inline ("as of YYYY-MM-DD"). Undated snapshots become silent lies.
- Do not silently rewrite history in `decisions/` or `postmortems/` — ADRs are superseded by new ADRs; postmortems are immutable records.

## Archive policy

- When a directory accumulates superseded material, move it to `<dir>/archive/` and list it in the directory's README. Precedent: [ci-cd/archive/](ci-cd/archive/).
- Completed-migration summaries live in [migration-history/](migration-history/) — that whole directory is the archive for "how we got here" records.
- Prefer **banner + archive** over deletion when the doc explains a decision or incident; prefer **deletion** when the doc is simply wrong about the current system and teaches nothing (broken runbooks are worse than no runbooks).

## Freshness

- Documentation ships **in the same PR** as the change it describes — enforced as a process gate: [documentation-freshness](../.agents/skills/dev-process/gates/documentation-freshness.md).
- Cite stable anchors and symbols, not line numbers; never write counts of growable sets ("N skills", "N packages") — link the directory instead.
- Every category directory should keep a `README.md` index so status is visible without opening each file.

## Naming conventions

- `kebab-case.md` for new files; prefix by topic when it aids sorting (`ci-*`, `terraform-*`).
- ADRs: `NNNN-slug.md` (zero-padded, sequential). RFCs: `LS-####-slug.md` (ticket-keyed) or `draft-slug.md` before a ticket exists. Postmortems: `YYYY-MM-DD-slug.md`.

## Provenance and maintenance

- 2026-07-02: rewritten from the skills/docs audit (`scratch/skills-audit/`); replaced the 2026-02 version that omitted eight directories and listed shipped ADRs as "planned".
- Verify placement table targets exist: `ls docs/decisions docs/rfcs docs/postmortems docs/test-plans docs/fixes docs/operations docs/product`
- Verify archive precedent: `ls docs/ci-cd/archive`
