# Feature Discovery Gaps — player-detail

**Jira:** LS-7607
**Page:** `player-detail` (Epic LS-5287)
**Type:** Bucket Story

## Description

Catch-all bucket for features discovered via code audit (Step 0.4) that were missed
in the original page-doc-driven feature extraction. Each GAP-### bug under this Story
represents a feature that exists in code but was never enumerated in the QA inventory.

This bucket exists for parent-tree correctness only. Engineers may promote individual
GAP bugs into their own Feature Stories if they want to track future findings under them.

## Audit Scope

Files examined during the code audit that produced this bucket:

| File                                                          | Platform     | Notes                                                                                                                                          |
| ------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/PlayerDetailModal.tsx`               | Web          | Full-featured editorial modal: masthead, hero stats, career grid, dynamic tabs (Career Arc / Batting / Pitching / Fielding)                    |
| `apps/web/src/pages/players/PlayerStatsPage.tsx`              | Web          | Route shell (PlayerDetailPage) — param parsing, brefId resolution, LOGGER.warn telemetry for invalid IDs                                       |
| `apps/web/src/pages/players/PlayerDetailPage.spec.tsx`        | Web          | Page-level unit tests (telemetry for invalid / boundary numeric IDs)                                                                           |
| `apps/app/src/app/(app)/PlayerDetail.tsx`                     | Native       | Mobile screen; delegates to `PlayerDetailById` after `toIntId` parse of the route param                                                        |
| `apps/app/src/app/(app)/PlayerDetail.spec.tsx`                | Native       | Unit tests (param parse, fallback to id=0, component mounting)                                                                                 |
| `lib/shared-components/src/features/players/PlayerDetail.tsx` | Web + Native | Cross-platform `PlayerDetailById` component; used by native screen; also serves as the fallback for direct id-based renders                    |
| `apps/web-e2e/src/tests/player-detail-modal.spec.ts`          | Web          | Hermetic Playwright E2E coverage (hero stats, career summary, position badges, batting/fielding tabs, close/ESC, back nav, error/empty states) |

## Existing Feature Stories (already in QA inventory)

| Feature                                                        | Jira    | Covers                                                                                         |
| -------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| Player Detail Modal                                            | LS-5585 | Editorial modal layout: masthead, portrait avatar, hero stat chips, tabs, close/ESC navigation |
| Hero Stats Chips                                               | LS-5584 | Scoreboard-sized career AVG / HR / RBI chips (batting) and Record / SO / IP chips (pitching)   |
| Eligible Positions Badges                                      | LS-5583 | Position eligibility band below masthead; shows position pills or hides when array is empty    |
| Dynamic Stat Tabs (Career Arc / Batting / Pitching / Fielding) | LS-5582 | Tab bar with data-driven availability; active-tab indicator, overflow scroll                   |
| Deep Linking from Rosters / FA / Draft / Matchups              | LS-5581 | Cold-start / deep-link routing to `/players/:id`; brefId → numeric ID resolution               |
| Career Summary Cards                                           | LS-5580 | Grid of career stat tiles (Games, AVG, HR, RBI, SB for batters; Record, IP, SO for pitchers)   |
| Career Arc Line Chart                                          | LS-5579 | Lazy-loaded `CareerArcChart`; batting/pitching mode toggle for two-way players                 |
| Back Navigation with URL Fallback                              | LS-5578 | "← Back" button returns to `/players/stats`; ESC key also closes and navigates back            |
| Zero-Flicker Player Switching                                  | LS-5589 | `previousData` fallback keeps prior player visible while next player loads                     |
| Season Pitching Stats Table                                    | LS-5588 | Season-by-season pitching table (Year, G, W-L, ERA, IP, SO, BB)                                |
| Season Fielding Stats Table                                    | LS-5587 | Season-by-season fielding table (Year, POS, G, INN, PO, A, E)                                  |
| Season Batting Stats Table                                     | LS-5586 | Season-by-season batting table (Year, G, PA, AB, H, HR, RBI, SB, AVG); newest-first sort       |

## GAP Findings

| ID      | Ticket  | Summary                                                                           | Severity | Platform | Status      |
| ------- | ------- | --------------------------------------------------------------------------------- | -------- | -------- | ----------- |
| GAP-001 | LS-7657 | Invalid/missing playerId param fallback (toIntId default 0)                       | Medium   | Native   | To Do       |
| GAP-002 | LS-7658 | Shared PlayerDetailById component used cross-platform (web/native parity surface) | Medium   | All      | In Progress |

The original page-doc-driven feature extraction (LS-5578..5589) enumerates the web
`PlayerDetailModal` journey but never calls out that the native screen delegates
directly to the cross-platform `PlayerDetailById` shared component, nor that a
regression there silently affects the native player-detail surface without any web
signal. GAP-001 and GAP-002 were discovered during the code audit of
`apps/app/src/app/(app)/PlayerDetail.tsx` and
`lib/shared-components/src/features/players/PlayerDetail.tsx`.

## Related

- **Parent epic:** LS-5287 — QA — Page: Player Detail
- **GAP-001 source:** `docs/agents/qa-coverage/jira-page-epics/pages/player-detail/features/feature-discovery-gaps/variants/non-premium/findings/GAP-001.md`
- **GAP-002 source:** `docs/agents/qa-coverage/jira-page-epics/pages/player-detail/features/feature-discovery-gaps/variants/non-premium/findings/GAP-002.md`
