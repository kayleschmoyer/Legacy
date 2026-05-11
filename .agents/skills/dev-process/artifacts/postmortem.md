# Artifact: Postmortem

A blameless writeup of an incident: what happened, why, what we learned, and what we will change. Postmortems are **for the team's future selves**, not for assigning blame.

## When required

- Entrypoint 1 (incident-hotfix) — always.
- Entrypoint 3 (security-cve) — always when a vulnerability was actually exploited or production was affected.
- Entrypoint 13 (revert) — always when reverting a production deploy (vs reverting an unmerged PR).
- Any Critical-tier work — always.

Postmortems for near-misses are **encouraged but not required** — if the team learned something, write it down.

## Path

`docs/postmortems/YYYY-MM-DD-<slug>.md` where `YYYY-MM-DD` is the incident start date.

## Required sections

```markdown
# Postmortem: <Incident Title>

**Date**: YYYY-MM-DD
**Duration**: <e.g. 47 minutes, from 14:03 UTC to 14:50 UTC>
**Severity**: SEV1 | SEV2 | SEV3
**Authors**: @<name> (incident commander), @<name> (root cause investigator)

## Summary

<2–4 sentence executive summary. What broke, who was affected, how it was resolved.>

## Impact

- **Users affected**: <number or range, with confidence level>
- **Data integrity**: <preserved | data loss in <area>, <details>>
- **Revenue impact**: <if applicable>
- **External communication sent**: <Discord posts, status page updates, customer emails, with timestamps>

## Timeline

(All times UTC)

| Time  | Event                                |
| ----- | ------------------------------------ |
| HH:MM | First user report / monitoring alert |
| HH:MM | Incident commander assigned          |
| HH:MM | Root cause hypothesis A formed       |
| HH:MM | Hypothesis A ruled out               |
| HH:MM | Root cause confirmed                 |
| HH:MM | Mitigation deployed                  |
| HH:MM | Recovery confirmed                   |
| HH:MM | All-clear                            |

## Root cause

<The technical root cause, in detail. Diagrams welcome. Distinguish symptom from cause.>

## What went well

- <Things that worked: monitoring caught it fast, runbook was clear, etc.>

## What went wrong

- <Things that delayed resolution or made it worse. No names; focus on systems and decisions.>

## Where we got lucky

- <Things that, if slightly different, would have made this much worse. These are usually the most important learnings.>

## Action items

| Owner | Action            | Due        | Ticket  |
| ----- | ----------------- | ---------- | ------- |
| @name | <Concrete change> | YYYY-MM-DD | LS-#### |
| …     | …                 | …          | …       |

Each action item must have an owner, a due date, and a Jira ticket. Action items without tickets are wishes, not commitments.

## Lessons

<3–5 bullet points the rest of the team should remember. The TL;DR for someone who skims.>
```

## Blameless writing rule

- ✅ "The deploy script silently swallowed the migration failure."
- ❌ "The engineer didn't notice the migration failure."

If a person made a mistake, the question is what allowed the mistake — missing test, unclear UI, no preview, unsafe default. Fix the system, not the person.

## Lifecycle

1. **Draft within 24h** of incident close. Even rough — empty fields are fine, write what you know.
2. **Review within 1 week**: incident commander circulates draft for additions and accuracy fixes.
3. **Publish**: merge to `main`. Postmortems are public artifacts — searchable for the team.
4. **Action items tracked**: weekly until all closed. Postmortems with stale action items are a symptom of the team not actually learning.

## Anti-patterns

- ❌ Naming individuals as cause.
- ❌ "Engineer error" as root cause. The engineer is a symptom; the system is the cause.
- ❌ Postmortem written, action items never filed as tickets. The action items are the deliverable.
- ❌ Skipping the "Where we got lucky" section. This is where the highest-value learnings live.
- ❌ "We will be more careful next time" as an action item. Not actionable.

## Tool surface

MCP tools implemented in `tools/mcp/dev-process-server/` (server: `legacy-sports-dev-process`):

- ✅ `postmortem_create({ date, slug, severity, authors })` — scaffold the file with required sections.
- ✅ `postmortem_action_items({ path? })` — extract action items from one or all postmortems.
- ✅ `postmortem_recent({ days })` — list postmortems from the last N days.

## Related

- [Entrypoint 01: incident-hotfix](../entrypoints/01-incident-hotfix.md).
- [Entrypoint 03: security-cve](../entrypoints/03-security-cve.md).
- [Entrypoint 13: revert](../entrypoints/13-revert.md).
- [Template](../templates/postmortem-template.md).
- Industry reference: [Google SRE postmortem culture](https://sre.google/sre-book/postmortem-culture/).
