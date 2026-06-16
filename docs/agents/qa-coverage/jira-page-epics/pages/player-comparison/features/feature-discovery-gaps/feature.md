# Feature Discovery Gaps — player-comparison

**Jira:** LS-7606
**Page:** `player-comparison` (Epic LS-5286)
**Type:** Bucket Story

## Description

Catch-all bucket for features discovered via code audit (Step 0.4) that were missed
in the original page-doc-driven feature extraction. Each GAP-### bug under this Story
represents a feature that exists in code but was never enumerated in the QA inventory.

This bucket exists for parent-tree correctness only. Engineers may promote individual
GAP bugs into their own Feature Stories if they want to track future findings under them.

## Audit Scope

Files examined during the code audit that produced this bucket:

| File                                                                   | Platform       | Notes                                                                                                                                              |
| ---------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/pages/players/PlayerComparisonPage.tsx`                  | Web            | Route shell; wires the shared `PlayerComparison` to web auth, premium gating, navigation, meta                                                     |
| `apps/web/src/pages/players/PlayerComparisonPage.spec.tsx`             | Web            | Page-level unit tests (auth gating, upgrade-modal wiring)                                                                                          |
| `apps/app/src/app/(app)/PlayerComparison.tsx`                          | Android Native | Native screen; wires the shared `PlayerComparison` to mobile premium gating + navigation                                                           |
| `apps/app/src/app/(app)/PlayerComparison.spec.tsx`                     | Android Native | Native screen unit tests (premium gating, loading state)                                                                                           |
| `lib/shared-components/src/features/players/PlayerComparison.tsx`      | Web + Native   | Canonical comparison UI: search/slots, premium gate, scoring projections, career batting/pitching, achievements, season breakdowns, BEST indicator |
| `lib/shared-components/src/features/players/PlayerComparison.spec.tsx` | Web + Native   | Unit tests for the pure stat helpers and leader-detection logic                                                                                    |
| `apps/web-e2e/src/tests/player-comparison*.spec.ts`                    | Web            | Hermetic Playwright E2E coverage (best indicator, achievements, color chips, empty/minimum states, fantasy scoring, stats charts)                  |

The comparison UI was consolidated into the cross-platform `PlayerComparison` feature in
shared-components (LS-7804); the web and native entry points are now thin wrappers. The
GAP findings below were captured against the earlier single-file `PlayerComparisonPage.tsx`
implementation, so their recorded source line numbers reference that pre-consolidation file.

## Existing Feature Stories (already in QA inventory)

| Feature                                | Jira    | Covers                                                                 |
| -------------------------------------- | ------- | ---------------------------------------------------------------------- |
| BEST Indicator on Highest Value        | LS-5568 | Gold ▲ / "BEST" per-row leader highlight, inverted-stat handling, ties |
| Career Achievements Comparison         | LS-5569 | All-Star, MVP, Cy Young, Gold Glove, Silver Slugger, World Series rows |
| Career Batting Comparison Rows         | LS-5570 | Side-by-side career batting stat rows                                  |
| Career Pitching Comparison Rows        | LS-5571 | Side-by-side career pitching stat rows                                 |
| Empty and Minimum-Selection States     | LS-5572 | EmptyState, OnePlayerNudge, minimum-two-player messaging               |
| Fantasy Scoring Projections Comparison | LS-5573 | Projection / avg-points-per-game scoring group                         |
| Player Search and Slot Selection       | LS-5574 | Typeahead search, up-to-4 slot selection, chip add/remove              |
| Premium Gate for Player Comparison     | LS-5575 | Entitlement gating, inline PremiumBanner, upgrade CTA                  |
| Season-by-Season Breakdown per Player  | LS-5576 | Per-player batting/pitching season tables (four most recent seasons)   |
| Color-Coded Player Chips               | LS-5577 | Per-player accent colors across chips and comparison columns           |

## GAP Findings

| ID      | Ticket  | Summary                                                                      | Severity | Platform       | Status      |
| ------- | ------- | ---------------------------------------------------------------------------- | -------- | -------------- | ----------- |
| GAP-001 | LS-7655 | Unauthenticated/anonymous PremiumGate copy variant ("Create a free account") | Medium   | Web            | In Progress |
| GAP-002 | LS-7656 | Page is web-only — no native PlayerComparison screen exists                  | High     | Android Native | In Progress |

The original page-doc-driven feature extraction (LS-5568..5577) enumerates the search,
gating, comparison-table, and breakdown features but never lists the page's variant
surfaces: the distinct anonymous-visitor gate copy shown before sign-in (GAP-001), or the
cross-platform scope question of whether the comparison page is web-only versus reaching
native parity (GAP-002).

## Related

- **Parent epic:** LS-5286 — QA — Page: Player Comparison
- **GAP-001 source:** `docs/agents/qa-coverage/jira-page-epics/pages/player-comparison/features/feature-discovery-gaps/variants/non-premium/findings/GAP-001.md`
- **GAP-002 source:** `docs/agents/qa-coverage/jira-page-epics/pages/player-comparison/features/feature-discovery-gaps/variants/non-premium/findings/GAP-002.md`
