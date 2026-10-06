# Feature Discovery Gaps — player-stats

**Jira:** LS-7608
**Page:** `player-stats` (Epic LS-5288)
**Type:** Bucket Story

## Description

Catch-all bucket for features discovered via code audit (Step 0.4) that were missed
in the original page-doc-driven feature extraction. Each GAP-### bug under this Story
represents a feature that exists in code but was never enumerated in the QA inventory.

This bucket exists for parent-tree correctness only. Engineers may promote individual
GAP bugs into their own Feature Stories if they want to track future findings under them.

## Audit Scope

Files examined during the code audit that produced this bucket:

| File                                                                                  | Platform     | Notes                                                                                                              |
| ------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/pages/players/PlayerStatsPage.tsx`                                      | Web          | Route shell (`PlayerStatsRoute`) — share handler, export handler, URL param parsing, stats grid orchestration      |
| `apps/web/src/pages/players/PlayerStatsPage.spec.ts`                                  | Web          | Page-level unit tests (route param validation, filter round-trip assertions)                                       |
| `apps/web/src/pages/players/PlayerStatsRoute.spec.tsx`                                | Web          | Route-level unit tests (export lifecycle, share callbacks, onExport prop wiring)                                   |
| `lib/shared-components/src/features/players/PlayerStatsPage.tsx`                      | Web + Native | Cross-platform `PlayerStatsPage` component; implements `handleShare` (relative URL builder) and the stats grid     |
| `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/PlayerStats.tsx`      | Native       | Mobile screen; delegates to the shared `PlayerStatsPage` component after mounting                                  |
| `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/PlayerStats.spec.tsx` | Native       | Unit tests (component mounting, filter state, navigation callbacks)                                                |
| `apps/web-e2e/src/tests/player-stats.spec.ts`                                         | Web          | Hermetic Playwright E2E coverage (filter application, view mode tabs, page size, column expand, row click, export) |
| `apps/web-e2e/src/tests/player-stats-mocked.spec.ts`                                  | Web          | Mocked Playwright E2E coverage (search, slider interactions, share affordance, URL persistence)                    |

## Existing Feature Stories (already in QA inventory)

| Feature                                    | Jira    | Covers                                                                                            |
| ------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------- |
| Column Visibility Expand/Collapse          | LS-5590 | `statsFormat` toggle between `standard` and `expanded`; user preference persisted in localStorage |
| Export Stats as JSON                       | LS-5591 | Client-side JSON export: Blob creation, programmatic `<a>` click, `revokeObjectURL` cleanup       |
| Hitter Stats Columns                       | LS-5592 | Batting grid column set (G, PA, AB, H, HR, RBI, SB, AVG, OPS in expanded view)                    |
| Page Size Selector                         | LS-5593 | `pageSize` control (10 / 25 / 50 / 100); URL-persisted; guarded against out-of-set values         |
| Pitcher Stats Columns                      | LS-5594 | Pitching grid column set (G, W-L, ERA, IP, SO, BB, WHIP, K/9, BB/9 in expanded view)              |
| Row Click Opens Player Detail Modal        | LS-5595 | Web row click opens `PlayerDetailModal`; mobile pushes to `/PlayerDetail` with player id          |
| Search and Basic Filters                   | LS-5596 | Text search field, position select, team select; draft-vs-applied separation; URL persistence     |
| Share Current View                         | LS-5597 | Three-tier share fallback: Web Share API → clipboard → manual-copy message                        |
| Stat Range Min/Max Sliders                 | LS-5598 | Min Home Runs slider, Min Batting Avg slider, Max ERA slider; draft state; URL persistence        |
| Stats Format User Preference               | LS-5599 | `statsFormat` read from `localStorage`; web-only (mobile hardcoded to `standard`)                 |
| URL-Persisted Filter State                 | LS-5600 | `buildStatsSearchParams` / URL parser round-trip; filter state survives page reload               |
| View Mode Tabs (Combined/Hitters/Pitchers) | LS-5601 | `viewMode` toggle (`combined` / `hitters` / `pitchers`); tab bar; URL persistence                 |

## GAP Findings

| ID      | Ticket  | Summary                                                                     | Severity | Platform | Status |
| ------- | ------- | --------------------------------------------------------------------------- | -------- | -------- | ------ |
| GAP-001 | LS-7659 | Missed feature: Navigator.share fallback chain (share → clipboard → manual) | High     | Web      | Done   |
| GAP-002 | LS-7660 | Missed feature: Blob export via createObjectURL + revokeObjectURL lifecycle | Medium   | Web      | Done   |

The original page-doc-driven feature extraction (LS-5590..5601) enumerated the stats
grid, filter controls, and tab navigation, but never called out the implementation
details of the share or export mechanics. GAP-001 was a pure enumeration gap (the
three-tier share fallback chain existed in code but had no feature variants); GAP-002
surfaced a real code defect (the `revokeObjectURL` call was not guarded with
`try/finally`, so an export error leaked the object URL). Both were discovered during
the audit of `apps/web/src/pages/players/PlayerStatsPage.tsx`.

## Related

- **Parent epic:** LS-5288 — QA — Page: Player Stats
- **GAP-001 source:** `docs/agents/qa-coverage/jira-page-epics/pages/player-stats/features/feature-discovery-gaps/variants/non-premium/findings/GAP-001.md`
- **GAP-002 source:** `docs/agents/qa-coverage/jira-page-epics/pages/player-stats/features/feature-discovery-gaps/variants/non-premium/findings/GAP-002.md`
