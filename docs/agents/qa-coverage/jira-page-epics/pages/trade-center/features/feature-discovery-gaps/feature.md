# Feature Discovery Gaps — trade-center

**Jira:** LS-7615
**Page:** `trade-center` (Epic LS-5299)
**Type:** Bucket Story

## Description

Catch-all bucket for features discovered via code audit (Step 0.4) that were missed
in the original page-doc-driven feature extraction. Each GAP-### bug under this Story
represents a feature that exists in code but was never enumerated in the QA inventory.

This bucket exists for parent-tree correctness only. Engineers may promote individual
GAP bugs into their own Feature Stories if they want to track future findings under them.

## Audit Scope

Files examined during the code audit that produced this bucket:

| File                                                               | Platform       | Notes                               |
| ------------------------------------------------------------------ | -------------- | ----------------------------------- |
| `apps/web/src/pages/trade-center/TradeCenterPage.tsx`              | Web            | League selector page                |
| `apps/app/src/app/(app)/TradeCenterPage.tsx`                       | Android Native | Native league selector              |
| `lib/shared-components/src/features/leagues/TradingCenter.tsx`     | Web + Native   | Shared trade management UI          |
| `lib/shared-components/src/features/leagues/PremiumTradeTools.tsx` | Web + Native   | Premium-gated analyzer / calculator |
| `lib/shared-components/src/features/matchup/LeagueTradeBlock.tsx`  | Web + Native   | Trade block widget                  |

## Existing Feature Stories (already in QA inventory)

| Feature                            | Jira    | Covers                                                         |
| ---------------------------------- | ------- | -------------------------------------------------------------- |
| Cross-League Trade Center Overview | LS-5680 | League selector, TradingCenter panels, empty/error states      |
| Submit New Trade Offer             | LS-5678 | 4-step ProposeTradeDialog, ProposeTrade mutation, cache update |

## GAP Findings

| ID      | Ticket  | Summary                                                                                | Severity | Platform       | Status |
| ------- | ------- | -------------------------------------------------------------------------------------- | -------- | -------------- | ------ |
| GAP-001 | LS-7679 | Mobile trade-center lacks real-time WebSocket refresh                                  | High     | Android Native | Done   |
| GAP-002 | LS-7887 | Premium Trade Tools panel (Trade Analyzer + Value Calculator) absent from QA inventory | Medium   | Web + Native   | To Do  |
| GAP-003 | LS-7888 | League Trade Block asking-price management UI absent from QA inventory                 | Medium   | Web + Native   | To Do  |
| GAP-004 | LS-7889 | Stale-player warning on incoming trade offers absent from QA inventory                 | Medium   | Web + Native   | To Do  |

## Related

- **Parent epic:** LS-5299 — Trade Center (Standalone) QA
- **GAP-001 source:** `docs/agents/qa-coverage/jira-page-epics/pages/trade-center/features/feature-discovery-gaps/variants/non-premium/findings/GAP-001.md`
