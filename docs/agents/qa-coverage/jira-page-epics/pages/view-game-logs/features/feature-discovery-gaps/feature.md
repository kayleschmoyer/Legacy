# Feature Discovery Gaps — view-game-logs

**Jira:** LS-7684
**Page:** `view-game-logs` (Epic LS-5303)
**Type:** Bucket Story

## Description

Catch-all bucket for features discovered via code audit (Step 0.4) that were missed
in the original page-doc-driven feature extraction. Each GAP-### bug under this Story
represents a feature that exists in code but was never enumerated in the QA inventory.

This bucket exists for parent-tree correctness only. Engineers may promote individual
GAP bugs into their own Feature Stories if they want to track future findings under them.

## Audit Scope

Files examined during the code audit that produced this bucket:

| File                                                                 | Platform     | Notes                                           |
| -------------------------------------------------------------------- | ------------ | ----------------------------------------------- |
| `apps/web/src/pages/players/ViewGameLogsPage.tsx`                    | Web          | Route shell; wires `GameLogsTable` to stats API |
| `lib/shared-components/src/features/stats/GameLogsTable.tsx`         | Web + Native | Filter state machine, table render, API fetch   |
| `lib/shared-components/src/features/stats/GameLogsTable.spec.tsx`    | Web + Native | Unit tests for filters and request body shape   |
| `lib/shared-components/src/features/stats/GameLogsTable.stories.tsx` | Web          | Storybook stories for visual QA                 |

## Existing Feature Stories (already in QA inventory)

No dedicated Feature Story tickets pre-existed for this page. All QA findings are
tracked as Bugs and Tasks directly under the page epic (LS-5303). The VGL-### series
(LS-7459 through LS-7480) constitutes the original enumerated QA inventory.

## GAP Findings

| ID      | Ticket  | Summary                                                              | Severity | Platform     | Status      |
| ------- | ------- | -------------------------------------------------------------------- | -------- | ------------ | ----------- |
| GAP-001 | LS-7691 | Production localhost fallback in stats API URL config for native app | Medium   | Web + Native | In Progress |

## Related

- **Parent epic:** LS-5303 — QA — Page: View Game Logs
- **GAP-001 source:** `apps/web/src/pages/players/ViewGameLogsPage.tsx` (line 19), `@legacy-sports/app-config`
