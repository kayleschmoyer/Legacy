# Feature Discovery Gaps — baseball-league-detail

**Jira:** LS-7594
**Page:** `baseball-league-detail` (Epic LS-5259)
**Type:** Bucket Story

## Description

Catch-all bucket for features discovered via code audit (Step 0.4) that were missed
in the original page-doc-driven feature extraction. Each GAP-### bug under this Story
represents a feature that exists in code but was never enumerated in the QA inventory.

This bucket exists for parent-tree correctness only. Engineers may promote individual
GAP bugs into their own Feature Stories if they want to track future findings under them.

The GAP findings for this page are filed as direct children of the parent epic (LS-5259)
rather than as Jira children of this Story, matching the sibling-page convention (e.g.
player-stats). This doc is the rollup that ties them together.

## Audit Scope

Files examined during the code audit that produced this bucket:

| File                                                                  | Platform       | Notes                                                                                                                       |
| --------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/pages/baseball/league-detail-v2/LeagueDetailPageV2.tsx` | Web            | Web route shell — wires `LeagueWebSocketContext`, `useLeagueWebSocket({ onDraftStarted })`, and the realtime lifecycle hook |
| `apps/web/src/hooks/useLeagueWebSocketLifecycle.ts`                   | Web            | Creates/disposes the shared `WebSocketClient`; reconnect-on-token-refresh and empty-`websocketUrl` disabled paths           |
| `apps/web/src/hooks/useLeagueWebSocket.ts`                            | Web            | `onDraftStarted` / `onReconnect` callback plumbing for the league realtime channel                                          |
| `apps/app/src/app/(app)/baseball/league/[leagueId].tsx`               | Android Native | Mobile league detail screen — native Share sheet for the invite link and Keychain auth-token read                           |
| `apps/app/src/common/auth/AuthHooks.ts`                               | Android Native | `readKeychainValue` — secure-storage read whose error path is swallowed to `null`                                           |
| `lib/shared-components/src/utils/SecureStorage.native.ts`             | Android Native | `getItem` — swallows the underlying `expo-secure-store` error and falls back to the in-memory store                         |

## Existing Feature Stories (already in QA inventory)

| Feature          | Jira    | Covers                                                                          |
| ---------------- | ------- | ------------------------------------------------------------------------------- |
| Commissioner Tab | LS-5340 | Commissioner-only league management controls (settings, danger zone, audit log) |
| Free Agents Tab  | LS-5341 | Available-players list, position filters, search, waiver/FAAB affordances       |
| History Tab      | LS-5342 | Past seasons, champions row, all-time records, season selector                  |
| Matchup Tab      | LS-5343 | Weekly head-to-head panels, projected/actual point totals, week navigation      |
| My Team Tab      | LS-5344 | Team header and roster slots for the signed-in manager                          |
| Overview Tab     | LS-5345 | Hero header (name, week, draft status) and at-a-glance overview summary widgets |
| Roster Tab       | LS-5346 | Lineup slot controls, position swaps, provisional/future-week lineup handling   |
| Standings Tab    | LS-5347 | Standings table (one row per team), rank/W-L columns, division grouping         |
| Trades Tab       | LS-5348 | Trade center heading, propose-trade entry, trade list/proposal UI               |

## GAP Findings

| ID      | Ticket  | Summary                                                                      | Severity | Platform       | Status      |
| ------- | ------- | ---------------------------------------------------------------------------- | -------- | -------------- | ----------- |
| GAP-001 | LS-7625 | Live WebSocket league-realtime channel (draft-started, lifecycle, reconnect) | High     | Web            | In Progress |
| GAP-002 | LS-7626 | Mobile native Share-sheet for league invite link                             | High     | Android Native | In Progress |
| GAP-003 | LS-7627 | Mobile league detail reads auth token from Keychain (`readKeychainValue`)    | High     | Android Native | In Progress |

The original page-doc-driven feature extraction (LS-5340..5348) enumerated the nine
tabs (Overview, My Team, Roster, Matchup, Standings, Free Agents, Trades, History,
Commissioner) but never called out three cross-cutting, code-only capabilities:

- **GAP-001** — the web league realtime WebSocket channel: connect/disconnect,
  reconnect-on-token-refresh, `draft-started → refetchLeague`, and the silent-disable
  case when `env.websocketUrl` is empty. Discovered auditing
  `LeagueDetailPageV2.tsx:30` and the `useLeagueWebSocketLifecycle` / `useLeagueWebSocket` hooks.
- **GAP-002** — the mobile OS Share-sheet for the league invite link, including the
  `EXPO_PUBLIC_APP_BASE_URL ?? 'https://legacysports.app'` fallback that can leak
  production links into non-production builds. Discovered auditing
  `apps/app/src/app/(app)/baseball/league/[leagueId].tsx:237`.
- **GAP-003** — mobile secure-storage (Keychain / Keystore) auth-token read via
  `readKeychainValue`, whose failure path is silently swallowed to `null` at three
  layers, making a genuine secure-storage failure indistinguishable from a logged-out
  user. Discovered auditing `apps/app/src/app/(app)/baseball/league/[leagueId].tsx:56`.

## Related

- **Parent epic:** LS-5259 — QA — Page: Baseball League Detail
- **Bucket Story:** LS-7594 — Feature Discovery Gaps Bucket (baseball-league-detail)
- **GAP-001 ticket:** LS-7625 — source finding to be added at
  `docs/agents/qa-coverage/jira-page-epics/pages/baseball-league-detail/features/feature-discovery-gaps/variants/non-premium/findings/GAP-001.md` if/when created
- **GAP-002 ticket:** LS-7626 — source finding to be added at
  `docs/agents/qa-coverage/jira-page-epics/pages/baseball-league-detail/features/feature-discovery-gaps/variants/non-premium/findings/GAP-002.md` if/when created
- **GAP-003 ticket:** LS-7627 — source finding to be added at
  `docs/agents/qa-coverage/jira-page-epics/pages/baseball-league-detail/features/feature-discovery-gaps/variants/non-premium/findings/GAP-003.md` if/when created
