# Feature: Player Detail Modal

**Jira:** LS-5585
**Page:** `player-detail` (Epic LS-5287)
**Platforms:** web, native (see Cross-Platform Render Parity below)
**Entitlement:** none (base feature; premium columns gated separately)

## Description

The Player Detail experience surfaces a single player's full career and season-by-season
statistics. On web it is presented as a full-screen editorial modal (`PlayerDetailModal`);
on native the same journey is served by the cross-platform `PlayerDetailById` shared
component.

**Web entry point:** `apps/web/src/components/PlayerDetailModal.tsx`
**Native entry point:** `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/PlayerDetail.tsx` → `PlayerDetailById`
**Shared component:** `lib/shared-components/src/features/players/PlayerDetail.tsx`

### Web — PlayerDetailModal

The web modal is a full editorial layout built on Tamagui + custom design tokens
(docs/design/kXxk3B29-DRvoJthw6UifA, slice 2 / LS-4622):

- **Masthead:** portrait avatar (initials-based, position-tinted gradient), scoreboard
  name heading, eligible-position badges, season-count eyebrow, optional "open full
  page" ExternalLink button (omitted when rendered as a standalone page)
- **Hero stat chips:** career AVG / HR / RBI for batters; Record / SO / IP for pitchers
- **Career summary grid:** compact stat tiles (Games, AVG, HR, RBI, SB for batters;
  Games, Record, IP, SO for pitchers)
- **Dynamic tab bar:** Career Arc / Batting / Pitching / Fielding — tabs appear only
  when the corresponding data is present
- **Season-by-season tables:** editorial `EditorialTable` with horizontal scroll for
  each stat category (batting headers: Year G PA AB H HR RBI SB AVG; pitching headers:
  Year G W-L ERA IP SO BB; fielding headers: Year POS G INN PO A E)
- **Loading / error / empty states:** spinner with previousData fallback, error card,
  dashed empty-state card

### Native — PlayerDetailById (cross-platform shared component)

The native screen is a thin wrapper:

```tsx
// apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/PlayerDetail.tsx
export default function PlayerDetailScreen() {
  const { playerId } = useLocalSearchParams();
  const id = toIntId(playerId) ?? 0;
  return <PlayerDetailById playerId={id} />;
}
```

`PlayerDetailById` resolves the ID through the `GetPlayerDetailById` GraphQL query
(LS-8824 — it previously used an in-memory mock array, which made every real
`players.id` render "Player not found") and delegates to `PlayerDetail`, which
renders via Tamagui `ScrollView` and displays:

- **Batting Statistics** section (AVG, HR, RBI, Runs, Hits, OBP, SLG) — shown whenever
  batting fields are present on the player record
- **Pitching Statistics** section (ERA, Wins, Losses, Saves) — shown only for players
  with pitching data
- **Loading / error / not-found states:** full-screen spinner, red error text, "Player
  not found" fallback

### Cross-Platform Render Parity

> **GAP-002 (LS-7658):** This parity note was added to resolve the gap discovered
> during the player-detail code audit.

| Aspect                  | Web (`PlayerDetailModal`)                                                  | Native (`PlayerDetailById`)                                   |
| ----------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Component location      | `apps/web/src/components/PlayerDetailModal.tsx`                            | `lib/shared-components/src/features/players/PlayerDetail.tsx` |
| Data source             | GraphQL (`useGetAllPlayerSeasonStatsQuery`)                                | GraphQL (`useGetPlayerDetailByIdQuery`)                       |
| Sections rendered       | Hero stats · Career grid · Career Arc · Batting · Pitching · Fielding tabs | Batting Statistics · Pitching Statistics sections             |
| Loading state           | Spinner + `previousData` fallback                                          | Tamagui `Spinner` full-screen                                 |
| Error state             | Editorial error card                                                       | Red text message                                              |
| Empty / not-found state | Dashed empty-state card ("No season statistics")                           | "Player not found" text                                       |
| Premium gating          | Advanced columns gated separately (see LS-5571+)                           | None                                                          |

**Regression risk:** A change to `PlayerDetailById` or `PlayerDetail` in
`lib/shared-components` affects the **native** player detail surface only. It is
**not** caught by the web Playwright E2E suite in `apps/web-e2e/src/tests/player-detail-modal.spec.ts`,
which exercises `PlayerDetailModal`. Authors of changes to the shared component must
verify both the web modal journey and the native `PlayerDetailById` render path.

## Test Coverage

### Unit tests

**Native screen:** `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/PlayerDetail.spec.tsx`

- `'renders without crashing'` — mounts `PlayerDetailById` with `playerId=1`
- `'parses playerId string to number and passes it to PlayerDetailById'` — verifies
  `toIntId` correctly casts the string route param
- `'defaults to playerId 0 when playerId param is missing'` — validates fallback behavior
- `'defaults to playerId 0 when playerId param is undefined'` — validates undefined fallback

### E2E tests (hermetic — web only)

**File:** `apps/web-e2e/src/tests/player-detail-modal.spec.ts`

`describe('Player Detail Modal @regression')`:

- `'renders when navigating to the /players/:id deep-link route'` — modal opens on the deep-link route
- `'displays career hero stats — AVG, HR, RBI chips'` — hero stat chips render with correct computed AVG
- `'shows eligible position badges'` — position eligibility band renders CF and OF badges
- `'shows Career Batting summary card'` — career batting grid appears with AVG / HR / RBI labels
- `'shows season-by-season batting table with correct headers'` — batting tab shows Year/G/PA/AB/H/HR/RBI/SB/AVG headers and 2023/2024 rows
- `'switching to Fielding tab shows fielding table'` — fielding tab renders POS/INN/PO/A/E headers
- `'shows loading spinner while stats are fetching'` — spinner visible before data, gone after
- `'closes when the Close button is clicked'` — X button closes modal and navigates back

`describe('Player Detail Modal – Pitcher @regression')`:

- `'shows Career Pitching card and pitching tab for a pitcher'` — pitcher journey with SP position badge and ERA/IP/BB table

`describe('Player Detail Modal — Edge Cases @regression')`:

- `'shows empty state when no season stats are available'`
- `'shows error state when the stats query fails'`
- `'pressing Escape closes the modal and navigates back'`
- `'player nav: back button returns to /players/stats'`
- `'batting tab switches back from fielding tab'`
- `'season data rows contain expected year values'`

## Related

- **Epic:** LS-5287 — QA — Page: Player Detail
- **Feature Discovery Gaps bucket:** LS-7607
- **GAP-002 (cross-platform parity):** LS-7658 —
  `docs/agents/qa-coverage/jira-page-epics/pages/player-detail/features/feature-discovery-gaps/variants/non-premium/findings/GAP-002.md`
- **Web modal:** `apps/web/src/components/PlayerDetailModal.tsx`
- **Native screen:** `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/PlayerDetail.tsx`
- **Shared component:** `lib/shared-components/src/features/players/PlayerDetail.tsx`
- **Web E2E tests:** `apps/web-e2e/src/tests/player-detail-modal.spec.ts`
