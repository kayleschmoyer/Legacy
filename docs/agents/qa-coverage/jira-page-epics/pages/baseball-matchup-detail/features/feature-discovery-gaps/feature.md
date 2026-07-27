# Feature Discovery Gaps — baseball-matchup-detail

**Jira:** LS-7595
**Page:** `baseball-matchup-detail` (Epic LS-5260)
**Type:** Bucket Story

## Description

Catch-all bucket for features discovered via code audit (Step 0.4) that were missed
in the original page-doc-driven feature extraction. Each GAP-### bug under this Story
represents a feature that exists in code but was never enumerated in the QA inventory.

This bucket exists for parent-tree correctness only. Engineers may promote individual
GAP bugs into their own Feature Stories if they want to track future findings under them.

## Audit Scope

Files examined during the code audit that produced this bucket:

| File                                                                    | Platform     | Notes                                                                                                                                                                                      |
| ----------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/pages/matchup/MatchupDetailPage.tsx`                      | Web          | Route shell — wires every `MatchupDetailLayout` slot (header, scoreboard, winProbabilityPanel, rosterEditor, recapPanel, rosterComparison)                                                 |
| `apps/app/src/features/matchup/screens/MatchupDetailScreen.tsx`         | Native       | Mirrors the web wiring for mobile; same slot set minus the web-only `header`                                                                                                               |
| `lib/shared-components/src/features/matchup/MatchupDetailLayout.tsx`    | Web + Native | Shared slot-based layout; documents the fixed 9-slot render order (header, nav, scoreboard, winProbabilityPanel, GamesRemaining, matchup info, rosterEditor, recapPanel, rosterComparison) |
| `lib/shared-components/src/features/matchup/MatchupRecapPanel.tsx`      | Web + Native | "AI Matchup Recap" panel — **undocumented**, see GAP-001                                                                                                                                   |
| `apps/web/src/features/matchup/MatchupRosterEditor.tsx`                 | Web          | Roster editor data wrapper — **undocumented**, see GAP-002                                                                                                                                 |
| `apps/app/src/features/matchup/components/MatchupRosterEditor.tsx`      | Native       | Roster editor data wrapper (mobile) — **undocumented**, see GAP-002                                                                                                                        |
| `lib/shared-components/src/features/roster/MatchupRosterEditorView.tsx` | Web + Native | Shared presentational roster editor view (swap/move interactions)                                                                                                                          |
| `apps/web-e2e/src/tests/matchup-roster-editor.spec.ts`                  | Web          | Hermetic E2E coverage for the roster editor (exists, but the feature has no doc/ticket)                                                                                                    |

Cross-referenced against the four feature docs named in the original ticket report plus
the remaining docs already present in this bucket's `features/` directory (see below),
and against `docs/agents/pages/baseball/league/detail/matchups/detail.md` (the original
page-doc source).

## Existing Feature Stories (already in QA inventory)

This page's `features/` directory in fact already has **nine** feature docs — five more
than the "four existing feature docs" cited in the original LS-7595 report, which was
written before the other five were added:

| Feature                            | Jira    | Covers                                                                    | Layout slot(s)                      |
| ---------------------------------- | ------- | ------------------------------------------------------------------------- | ----------------------------------- |
| Page Meta & Header                 | LS-5354 | Document title/meta, "Matchup Details" heading, "Back to League" button   | `header`                            |
| Matchup Navigation Controls        | LS-5353 | Week navigation controls                                                  | `MatchupNavigationControls` (fixed) |
| Broadcast-Style Scoreboard         | LS-5350 | Split-panel head-to-head scoreboard, week badge, games ratio, status chip | `scoreboard`                        |
| Win Probability Panel              | LS-5358 | Premium win-probability / projected-score panel                           | `winProbabilityPanel`               |
| Games Remaining Visualization      | LS-5351 | Per-game dot progress, progress bar, `{n} left` / `Complete` badge        | `GamesRemaining` (conditional)      |
| Matchup Information Card           | LS-5352 | Start/end time display                                                    | Matchup information (fixed)         |
| Roster Comparison                  | LS-5357 | Read-only side-by-side roster comparison                                  | `rosterComparison`                  |
| Loading / Error / Not Found States | LS-5356 | Pre-layout spinner, error, and not-found states                           | (rendered before layout mounts)     |
| Matchup Roster Editor              | LS-8469 | Ownership/status-gated lineup swap/move editor with pre-flight lock       | `rosterEditor`                      |

## GAP Findings

| ID      | Ticket  | Summary                                                                           | Severity | Platform | Status |
| ------- | ------- | --------------------------------------------------------------------------------- | -------- | -------- | ------ |
| GAP-001 | LS-8468 | AI Matchup Recap panel (`recapPanel` slot) undocumented as its own feature        | Medium   | All      | To Do  |
| GAP-002 | LS-8469 | Matchup Roster Editor panel (`rosterEditor` slot) undocumented as its own feature | Medium   | All      | Done   |

Walking the remaining `MatchupDetailLayout` slots against the nine existing feature
docs above: `header`, `scoreboard`, `winProbabilityPanel`, `GamesRemaining`, matchup
information, `rosterComparison`, and now `rosterEditor` are all covered (table above).
The one slot still with no owning doc is `recapPanel` (GAP-001) — filed as a Jira bug
under the parent epic (LS-5260) and linked to this bucket Story.

GAP-002 was resolved by filing `matchup-roster-editor/feature.md` (LS-8469). No further
gaps were found beyond GAP-001 and GAP-002.

## Related

- **Parent epic:** LS-5260 — QA — Page: Baseball Matchup Detail
- **GAP-001 source:** `docs/agents/qa-coverage/jira-page-epics/pages/baseball-matchup-detail/features/feature-discovery-gaps/variants/non-premium/findings/GAP-001.md`
- **GAP-002 source:** `docs/agents/qa-coverage/jira-page-epics/pages/baseball-matchup-detail/features/feature-discovery-gaps/variants/non-premium/findings/GAP-002.md`
