# Feature Discovery Gaps — football-players-list

**Jira:** LS-7599
**Page:** `football-players-list` (Epic LS-5271)
**Type:** Bucket Story

## Description

Catch-all bucket for features discovered via code audit (Step 0.4) that were missed
in the original page-doc-driven feature extraction. Each GAP-### bug under this Story
represents a feature that exists in code but was never enumerated in the QA inventory.

This bucket exists for parent-tree correctness only. Engineers may promote individual
GAP bugs into their own Feature Stories if they want to track future findings under them.

## Audit Scope

Files examined during the code audit that produced this bucket:

| File                                                                | Platform       | Notes                                                                                     |
| ------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------- |
| `apps/web/src/pages/football/FootballPlayersPage.tsx`               | Web            | List page: search, position/team filters, pagination, card/table views, compare selection |
| `apps/web/src/pages/football/FootballPlayersComparePage.tsx`        | Web            | Side-by-side 2-player comparison route                                                    |
| `apps/web/src/components/football/FootballPositionFilter.tsx`       | Web            | Position pill filter                                                                      |
| `apps/web/src/components/football/FootballTeamFilter.tsx`           | Web            | Team / conference dropdown filter                                                         |
| `apps/web/src/api/db/football/FootballPlayers.graphql`              | Web            | Web players-list query                                                                    |
| `apps/app/src/api/db/players/FootballPlayers.graphql`               | Android Native | Native players-list query                                                                 |
| `lib/shared-components/src/api/db/getFootballPlayers.query.graphql` | Shared         | Shared players query fragment                                                             |

The list page is Web-first; the native (`apps/app`) counterpart shares the GraphQL
query but has a distinct UI surface (see FPL-030..034, FPL-040).

## Existing Feature Stories (already in QA inventory)

| Feature                            | Jira    | Covers                                                       |
| ---------------------------------- | ------- | ------------------------------------------------------------ |
| NFL Player Name Search             | LS-5442 | Search input, server name matching, accent/wildcard handling |
| NFL Team Filter                    | LS-5443 | Team dropdown, AFC/NFC conference filter, free-agent option  |
| Football Position Filter           | LS-5439 | Position pills, multi-select / FLEX, a11y radiogroup         |
| Mobile Touch-Friendly Filter Chips | LS-5441 | Pill sizing, touch targets, scroll affordance, contrast      |
| Football Stats Columns             | LS-5440 | Per-position stat cards/columns, fantasy points, sort        |
| Compare Football Players           | LS-5438 | 2-player select, compare route, side-by-side stat table      |
| Career and Game Log Navigation     | LS-5437 | Navigation to player detail, career totals, game logs        |

## GAP Findings

| ID      | Ticket  | Summary                                                                          | Severity | Platform | Status |
| ------- | ------- | -------------------------------------------------------------------------------- | -------- | -------- | ------ |
| GAP-001 | LS-7640 | Cursor-based pagination with 'Load more' button and append-vs-replace mode       | High     | Web      | To Do  |
| GAP-002 | LS-7641 | 300ms search debounce with separate debounced cursor reset                       | Medium   | Web      | To Do  |
| GAP-003 | LS-8016 | View-mode toggle (cards/table) persisted to localStorage with responsive default | Low      | Web      | To Do  |

The original page-doc-driven feature extraction (LS-5437..5443) enumerates search,
filters, stats columns, compare, and navigation, but never lists the list page's
client-side state machinery: the cursor-pagination append/replace logic (GAP-001),
the debounce/cursor-reset interaction (GAP-002), or the persisted view-mode toggle
(GAP-003).

## Related

- **Parent epic:** LS-5271 — QA — Page: Football Players List
- **GAP-001 source:** `docs/agents/qa-coverage/jira-page-epics/pages/football-players-list/features/feature-discovery-gaps/variants/non-premium/findings/GAP-001.md`
- **GAP-002 source:** `docs/agents/qa-coverage/jira-page-epics/pages/football-players-list/features/feature-discovery-gaps/variants/non-premium/findings/GAP-002.md`
- **GAP-003 source:** `docs/agents/qa-coverage/jira-page-epics/pages/football-players-list/features/feature-discovery-gaps/variants/non-premium/findings/GAP-003.md`
