# 0009. Dev-process framework: 13 entrypoints, 6-phase spine

Date: 2026-02-20

## Status

Accepted

## Context

PR #3792 introduced the development process framework. Before it, the team had:

- An informal "write a ticket, open a PR" convention — adequate for greenfield
  features but missing structure for incidents, security fixes, spikes, and reverts.
- RFC-based design reviews for large features — useful but heavyweight. Requiring
  an RFC for a one-line bug fix or a docs-only change created friction that caused
  the RFC process to be skipped for medium-sized features that actually needed it.
- No structured artifact format. Postmortems were informal Notion pages; ADRs did
  not exist; test plans were embedded in PR descriptions inconsistently.

The core tension: a single linear workflow cannot right-size to all task types.
An incident needs a different flow from a dependency upgrade; a spike has different
exit criteria than a production bug fix.

**Alternatives considered:**

- **RFC for everything** — consistent but too heavyweight; low-risk docs changes and
  two-line bug fixes do not benefit from a design review cycle.
- **Per-type custom workflows** — 13 separate runbooks with no shared structure.
  Maintainable but agents would have to learn 13 distinct processes; shared steps
  (verify, commit, push, PR, merge) would drift across the 13.
- **Single linear workflow with optional steps** — one runbook with "skip if low
  risk" markers. Simple to follow but "optional" steps tend to be skipped
  consistently, degrading the process into the informal convention it replaced.
- **Entrypoints + shared spine** — each task type has a named entrypoint that
  provides its specific context (artifacts required, risk tier, gates), but all
  entrypoints funnel into the same 6-phase spine. Shared steps are defined once;
  per-type overrides are additive layers.

## Decision

We will structure the development process as **13 named entrypoints** that each feed
into a shared **6-phase spine**.

- **13 entrypoints** (incident-hotfix, bug-investigation, security-cve,
  ci-flaky-triage, new-feature, refactor, dependency-upgrade, migration, docs-only,
  inherited-pr, spike, experimentation, revert) each have a short `SKILL.md` in
  `.agents/skills/dev-process/entrypoints/` that specifies required artifacts and
  risk tier.
- **6-phase spine** (Frame → Design → Implement → Verify → Document → Handoff)
  is the same for all entrypoints. Phases provide exit gates rather than rigid step
  sequences, so high-risk and low-risk tasks both use the same phase names but with
  different gate strictness.
- **Risk tiers** (Low / Medium / High / Critical) determine which gates apply within
  each phase: RFC required, test plan required, postmortem required, etc.
- **Structured artifacts** (RFC in `docs/rfcs/`, ADR in `docs/decisions/`,
  postmortem in `docs/postmortems/`, repro in the MCP server) live at known paths
  so tooling can consume them.
- The framework is a **design layer** (`dev-process` skill). The operational runbook
  for the dominant path (new-feature entrypoint) lives in `workflow-overview`.

## Consequences

### Easier

- An agent or new contributor can answer "what process applies here?" by reading the
  entrypoint decision tree (`entrypoints/README.md`) — one lookup, not a judgment
  call.
- Shared steps (make pc, self-review, PR creation, Jira transition) are defined once
  in the 6-phase spine; entrypoint-specific overrides are additive, not replacements.
- Risk tiers make gate-skipping explicit and auditable: "this is Low risk, so RFC is
  not required" is a documented statement, not a silent omission.
- Structured artifacts at known paths allow CI and agent tooling to verify process
  compliance programmatically (e.g. `testplan_coverage_check`, `adr_list`).

### Harder

- 13 entrypoints is a larger mental model than "open a PR." New contributors must
  understand the framework before they can reliably pick the right entrypoint.
- The spine's 6 phases can feel bureaucratic for genuinely trivial changes (docs
  typo fixes); the `docs-only` entrypoint exists specifically to right-size those,
  but the overhead of even thinking about phases is non-zero.
- Keeping entrypoint docs accurate as processes evolve requires discipline; an
  outdated entrypoint doc is worse than no doc (it actively misleads).

### Now constrained

- **Every task picks exactly one entrypoint before implementation starts.**
  An entrypoint determines which artifacts are required; skipping this choice
  means skipping gate checks silently.
- **Artifacts must live at their canonical paths.** An RFC not in `docs/rfcs/`
  or a postmortem not in `docs/postmortems/` is not visible to MCP tooling and
  does not satisfy the artifact gate.
- **Risk tier is set at the Frame phase and does not change without justification.**
  Downgrading from High to Low mid-implementation to skip a test plan is a
  process violation. If scope shrinks, document the scope change explicitly.
