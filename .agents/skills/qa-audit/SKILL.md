---
name: qa-audit
description: 'How to turn a QA-coverage stub ("Feature: X" Story under a "QA — Page:" Epic) into concrete finding tickets by reading the feature and its real implementation through multiple review lenses. Load when: asked to audit, review, or generate QA findings for a feature-coverage stub ticket, or to fill in a qa-feature-story that currently has no findings.'
metadata:
  scope: 'docs/agents/qa-coverage/**, .agents/skills/plan-ticket/**'
---

# Skill: QA Audit

Turns an empty QA-coverage stub — a `Story` ticket labeled `qa-feature-story`, summary `Feature: <Name>`, parented under a `Epic` labeled `qa-page-epic` — into concrete `Bug`/`Task` finding tickets, by comparing what the feature is documented/expected to do against what the current implementation actually does.

This formalizes a process that previously ran ad hoc (the CLF-xxx and FBH-xxx findings under LS-5263/LS-5267 were produced this way without a codified skill — see Provenance below). It does not generate the Page Epic / Feature Story tickets themselves; that's `.agents/skills/plan-ticket/references/qa-coverage-model.md`'s hierarchy. This skill only fills in the findings layer under an existing Feature Story.

## Before starting: locate ground truth, don't assume it exists

Before reading a `feature.md` under `docs/agents/qa-coverage/jira-page-epics/pages/<page>/features/<feature>/`, verify it's actually on disk (`ls`/`Glob`) — several page trees referenced by real Jira tickets (e.g. `docs/agents/pages/football/`) do not exist in this worktree even though tickets cite them, so the on-disk mirror is not guaranteed to be synced. When the `feature.md` or its referenced page doc (`docs/agents/pages/<sport>/...`) is missing, fall back to reading the Jira ticket's own description (via `jira_view`) for the feature's expected scope, and go straight to the real implementation for ground truth — do not fabricate expected behavior from the page doc's filename alone.

## Workflow

1. **Read the Feature Story ticket** (`jira_view(key, include: ["comments"])`) for its Description — this is the spec of what the feature is supposed to do, including any `## Description` / platform / entitlement fields.
2. **Find the real implementation.** Grep for the feature's component names across `apps/web`, `apps/app`, and `lib/shared-components` — do not assume a football-specific component exists; many football screens reuse baseball-named shared components (e.g. `LeagueDetailFreeAgentsTab` lives under `features/baseball/` but is consumed by both sports) — check for sport-conditional gaps in an ostensibly shared component before concluding a feature is "done."
3. **Apply review lenses.** Pick 2-4 lenses relevant to the feature from: UX QA, Cross-Platform Parity, Senior QA Lead (spec-vs-implementation gap), Automation QA (test coverage vs. real behavior), Performance, Edge Case / Negative Testing, Code Quality, Security. For each lens, ask: does the code match what the Feature Story description promises? Cite exact file paths (and only stable citations — grep for the symbol, don't hardcode a line number that will rot).
4. **Write one finding file per confirmed gap** under `docs/agents/qa-coverage/jira-page-epics/pages/<page>/features/<feature>/variants/<variant>/findings/<PREFIX>-<NNN>.md`, using the template in [references/finding-template.md](references/finding-template.md). Pick a `<PREFIX>` scoped to the page (e.g. `FLD` for football-league-detail) — prefixes are per-page-run, not a single global sequence; check existing findings under the same page dir for the next free number.
5. **File the Jira ticket** for each finding: `jira_create_ticket({ summary: "[<PREFIX>-<NNN>] <title>", description: <finding markdown>, type: "Bug" | "Task", sprint, ... })`. A finding ticket's parent must remain the Page Epic per Jira's type rules (Bug/Task tickets cannot take a Story as `parent` — only Epics accept `parent`); to indicate the finding belongs to a specific Feature Story instead of directly under the epic, use `jira_link_issues({ inwardKey: findingKey, outwardKey: featureStoryKey, linkType: "Relates" })` and note the substitution in the finding's Jira description, matching the convention already used by CLF-xxx/FBH-xxx findings (LS-7686).
6. **Apply labels post-create** (never settable via `jira_create_ticket`): `<prefix-lowercase>-<nnn>`, `feature-<feature-slug>`, `page-<page-slug>`, `qa-finding`, `severity-<level>`, `variant-<variant>`.
7. **Do not implement the fix in this pass.** A QA-audit finding is a Bug/Task ticket ready for a future `work-ticket` dispatch, not a live PR — stop once the finding is filed and linked.

## Gotchas

- A finding with no reproducible gap is not a finding — if a lens turns up nothing, don't force one. (Compare: LS-6157/CLF-038 was filed as "Confirmed safe. No finding," which is a legitimate but non-actionable outcome — prefer not creating that ticket at all rather than filing an empty one, unless the review explicitly needs a record that the check was performed.)
- A recommendation to "file as Story under X" inside a finding (e.g. LS-6151/CLF-032) means the finding itself is a meta-note, not a spec — route it through `.agents/skills/plan-ticket` (`/define`) instead of leaving it as an unscoped Task.
- If the true gap is large enough to need its own acceptance criteria and technical approach (a real feature build, not a bug), don't file it as a `qa-finding` Task alone — flag in the finding that it needs `/define`, per the routing table in [AGENTS.md](../../../AGENTS.md).

## Related skills

- [plan-ticket](../plan-ticket/SKILL.md) — owns the Page Epic → Feature Story hierarchy and ticket-creation mechanics this skill's findings slot into.
- [work-ticket](../work-ticket/SKILL.md) — consumes the Bug/Task findings this skill produces.
- [ui-audit](../ui-audit/SKILL.md) — a different audit process (visual/design-system, screenshot-driven, files bugs via the in-app button) — not this skill's mechanism, but the closest structural analog for a lens-based sweep.

## Provenance and maintenance

- 2026-08-06: authored after finding the CLF-xxx (LS-6124, LS-6151–6158) and FBH-xxx (LS-6255–6257) findings under LS-5263/LS-5267 had no corresponding skill — the process was reconstructed from the finding tickets' own format and `docs/agents/qa-coverage/jira-page-epics/README.md` / `.agents/skills/plan-ticket/references/qa-coverage-model.md`, then applied to LS-5415/5416/5417 (football-league-detail Chat/Commissioner/Free-Agents tabs) to produce FLD-001..003 as the first real usage.
- Verify the parent-linking gotcha still holds: `jira_link_issues` schema and LS-7686 comment history via `jira_view(key: "LS-7686")`.
- Verify finding-file template still matches examples: `Glob docs/agents/qa-coverage/jira-page-epics/pages/*/features/*/variants/*/findings/*.md` and diff a couple against [references/finding-template.md](references/finding-template.md).
