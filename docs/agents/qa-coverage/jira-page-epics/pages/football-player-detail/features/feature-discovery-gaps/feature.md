# Feature Discovery Gaps — football-player-detail

**Jira:** LS-7598
**Page:** `football-player-detail` (Epic LS-5270)
**Type:** Bucket Story

## Description

Catch-all bucket for features discovered via code audit (Step 0.4) that were missed
in the original page-doc-driven feature extraction. Each GAP-### bug under this Story
represents a feature that exists in code but was never enumerated in the QA inventory.

This bucket exists for parent-tree correctness only. Engineers may promote individual
GAP bugs into their own Feature Stories if they want to track future findings under them.

## Audit Scope

Files examined during the code audit that produced this bucket:

| File                                                                        | Platform | Notes                                                                            |
| --------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| `apps/web/src/pages/football/FootballPlayerDetailPage.tsx`                  | Web      | Route shell; auth/poll, premium upgrade modal, page meta                         |
| `apps/web/src/pages/football/FootballPlayerDetailPage.spec.tsx`             | Web      | Page-level unit tests                                                            |
| `lib/shared-components/src/features/football/FootballPlayerDetail.tsx`      | Web      | Header + position-gated stat tables (IDP / DST / offense / K), season breakdowns |
| `lib/shared-components/src/features/football/FootballPlayerDetail.spec.tsx` | Web      | Unit tests for the detail component and its render branches                      |

The page is Web-only — there is no native (`apps/app`) football player detail screen, so
every gap below is scoped to Web.

## Existing Feature Stories (already in QA inventory)

| Feature                                       | Jira    | Covers                                                    |
| --------------------------------------------- | ------- | --------------------------------------------------------- |
| Deep Link to Football Player Detail           | LS-5432 | Cold-start / deep-link routing, auth gating, error states |
| Football Game Logs                            | LS-5433 | Game-log table, season filter, bye-week handling          |
| Football Player Header                        | LS-5434 | Team swatch, position chip, name/team rendering, a11y     |
| Passing / Rushing / Receiving Stat Breakdowns | LS-5435 | Offensive career stat tables for QB / RB / WR / TE        |
| Injury Status and News                        | LS-5436 | Injury status badge, news feed, provenance (FPD-029)      |

## GAP Findings

| ID      | Ticket  | Summary                                                     | Severity | Platform | Status      |
| ------- | ------- | ----------------------------------------------------------- | -------- | -------- | ----------- |
| GAP-001 | LS-7637 | IDP (DL/LB/DB) defensive stats table on player detail       | High     | Web      | In Progress |
| GAP-002 | LS-7638 | DST team-defense stats table (Sacks, INT, Pts Allowed/G)    | High     | Web      | In Progress |
| GAP-003 | LS-7639 | Kicker (K) stats table with computed FG% (fgm / fga \* 100) | Medium   | Web      | In Progress |

The `Passing / Rushing / Receiving Stat Breakdowns` feature story (LS-5435) enumerates
only the QB / RB / WR / TE offensive branches. The IDP, DST, and Kicker render branches
in `OffenseStatsTable` / `IdpStatsTable` / `DstStatsTable` are separate, position-gated
paths that the original QA inventory never listed.

## Related

- **Parent epic:** LS-5270 — QA — Page: Football Player Detail
- **GAP-001 source:** `docs/agents/qa-coverage/jira-page-epics/pages/football-player-detail/features/feature-discovery-gaps/variants/non-premium/findings/GAP-001.md`
- **GAP-002 source:** `docs/agents/qa-coverage/jira-page-epics/pages/football-player-detail/features/feature-discovery-gaps/variants/non-premium/findings/GAP-002.md`
- **GAP-003 source:** `docs/agents/qa-coverage/jira-page-epics/pages/football-player-detail/features/feature-discovery-gaps/variants/non-premium/findings/GAP-003.md`
