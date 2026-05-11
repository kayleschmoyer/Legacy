# Postmortem: <Incident Title>

**Date**: YYYY-MM-DD
**Duration**: <N minutes, from HH:MM UTC to HH:MM UTC>
**Severity**: SEV1 | SEV2 | SEV3
**Authors**: @<incident commander>, @<root cause investigator>

## Summary

<2–4 sentence executive summary. What broke, who was affected, how it was resolved.>

## Impact

- **Users affected**: <number or range, with confidence level>
- **Data integrity**: <preserved | data loss in <area>, <details>>
- **Revenue impact**: <if applicable>
- **External communication sent**: <Discord posts, status page updates, customer emails — with timestamps>

## Timeline

(All times UTC.)

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

<Technical root cause in detail. Distinguish symptom from cause. Diagrams welcome.>

## What went well

- <Things that worked: monitoring caught it fast, runbook was clear, etc.>

## What went wrong

- <Things that delayed resolution. No names; focus on systems and decisions.>

## Where we got lucky

- <Things that, if slightly different, would have made this much worse. Often the most important section.>

## Action items

| Owner | Action            | Due        | Ticket  |
| ----- | ----------------- | ---------- | ------- |
| @name | <Concrete change> | YYYY-MM-DD | LS-#### |
|       |                   |            |         |

## Lessons

- <3–5 bullets the rest of the team should remember. The TL;DR for someone who skims.>
