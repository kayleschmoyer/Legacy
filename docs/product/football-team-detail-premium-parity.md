# Football Team Detail — premium parity investigation (LS-6442)

> Status: **investigation only, no priority decision made**. This is the writeup
> requested by LS-6442 ("needs a strategy call") — a comparison of what baseball's
> Team Detail page offers premium users today vs. football's, and scoped
> candidates for closing the gap. Nothing here has been built. See the LS-6442
> comment thread for the product decision when one is made.

## 1. What baseball's Team Detail page actually has today

`apps/app/src/app/(app)/baseball/team/[teamId].tsx` has exactly **one**
premium-conditioned behavior, and it is not `TeamAssistantManagerSettings`:

- **Projected stats on the Lineup/Rotation roster boards** — `getHitterStats`/
  `getPitcherStats` compute `projected` from `hitterProjections`/
  `pitcherProjections` (built from `useGetMatchupPlayersQuery` + the league's
  scoring settings) and return it **only when `useSubscription().isPremium`**
  (lines ~118, ~270-285). Non-premium users see `actual` only.
  - Note: this gates on the coarse `isPremium` boolean from `useSubscription()`,
    not a specific `ENTITLEMENTS` key via `useHasEntitlement`. Every other
    premium surface in the codebase (per `docs/product/subscription-tiers.md`)
    has moved to per-feature entitlement keys post-LS-8638. This page is a
    holdout — worth its own cleanup ticket, out of scope here.
- **`TeamAssistantManagerSettings`** (rendered in the Settings tab for owners)
  is **not premium-gated** — confirmed by reading the component (no
  `useHasEntitlement`/`isPremium` check anywhere in
  `lib/shared-components/src/features/teams/TeamAssistantManagerSettings.tsx`)
  and by `docs/product/subscription-tiers.md`'s Free features table:

  > Assistant manager invites (team collaboration) | Free | Unlimited
  > assistant-manager invites per team, no cap or entitlement — collaboration/
  > delegation features ... are explicit non-premium decisions, not a marketed
  > Stripe entitlement (LS-6030 / BTD-007).

  So the ticket's implied ambiguity here is already resolved: it's free by a
  documented product decision, not an oversight. **No action needed.**

Football's Team Detail page (`apps/app/src/app/(app)/football/team/[teamId].tsx`)
has **no premium-conditioned behavior at all** — `getPlayerStats` only ever
returns `actual` (line ~613-620), and there is no `useSubscription`/
`useHasEntitlement` import in the file. The real gap is the missing
**projections** parity, not assistant-manager parity.

## 2. Ticket scope note already applied

Per the existing LS-6442 comment (2026-07-22, Brad Krupa): IR slot handling is
**off the table** — "injury/IR features do not exist on this historical-data
platform" (epic LS-8604/LS-8610, "Legacy Sports is a historical-data platform —
players cannot get injured"). Confirmed independently in
`docs/product/subscription-tiers.md`'s change log. This doc does not re-litigate
that; it's excluded from the candidates below.

## 3. Candidate features for football Team Detail parity

### Candidate A — Auto-optimize lineup button

- **Entitlement:** `ENTITLEMENTS.optimal_lineup` already exists in the catalog
  and already has a **complete backend**: `setOptimalLineup` mutation
  (`lambdas/db/src/schema/matchups/mutations.ts`) — hard-gated via
  `requireEntitlement(context, ENTITLEMENTS.optimal_lineup)`, requires team
  ownership and a scheduled matchup, and is already wired into web's
  `MatchupRosterEditor.tsx` (`apps/web/src/features/matchup/MatchupRosterEditor.tsx`)
  and `apps/web/src/pages/baseball/league-detail-v2/tabs/Roster.tsx`.
- **Gap:** not wired into the football mobile app's Team Detail Lineup tab at
  all — that tab currently has no button, no matchup-lock awareness, no mutation
  call.
- **Rough scope:** Small-to-medium. The mutation and entitlement already exist,
  so this is UI wiring, not new backend: an "Auto-Optimize" button on the
  Lineup tab, gated by `useHasEntitlement(ENTITLEMENTS.optimal_lineup)`, calling
  the existing mutation against the team's current matchup, with a loading/error
  state and a refetch of `teamMembers`. Complications: the mobile Team Detail
  page's Lineup tab currently has **no concept of "current matchup"** wired into
  it (only the separate `Matchup` tab fetches `matchupData`); Lineup would need
  that plumbed through, and a product call on what happens with no
  active/scheduled matchup (disable the button? hide it?). Estimate: **1-2 days**
  including tests, assuming no web-parity requirement in the same ticket.

### Candidate B — Advanced/projected points on the roster board

- **Entitlement:** `ENTITLEMENTS.football_projections` already exists and is
  already premium-gated server-side for `MatchupPlayer.footballSeasonFppg`
  (`lambdas/db/src/schema/matchups/types.ts`) and used client-side in
  `FootballPlayerDetailPage`/`FootballPlayerDetailModal` and
  `MatchupRosterComparison` (web).
- **Gap:** Team Detail's `getPlayerStats` (mobile) never computes or requests a
  projected value — there's no equivalent of baseball's
  `hitterProjections`/`pitcherProjections` memo for football at all on this page.
- **Rough scope:** Medium. Baseball's projection math (`computeAverageScoring`
  over aggregate season stats × games-per-matchup) is baseball-specific
  (batting/fielding/pitching multiplier groups); football's fantasy-points
  computation lives in a different pipeline
  (`computeFootballOffenseFantasyPoints`/`computeFootballIdpFantasyPoints`, per
  `docs/product/subscription-tiers.md`'s change log) and is currently only
  exposed matchup-scoped (`footballSeasonFppg` on `MatchupPlayer`), not as a
  per-roster-member field the Team Detail page could query directly. Wiring
  this in means either extending an existing query/resolver to expose
  projected points per team member, or reusing `MatchupPlayer` data the way
  baseball reuses `getMatchupPlayers`. Real design question: does this show only
  during an active matchup week (like baseball) or year-round? Estimate:
  **3-5 days**, likely needs a resolver-side or query-shape change, not just
  a UI patch.

### Candidate C — Trade analyzer integration

- Mentioned in the original QA finding's platform-comparison list (ESPN+/Yahoo
  Plus). `ENTITLEMENTS.trade_analyzer` exists but per
  `docs/product/subscription-tiers.md` has **no resolver — "currently a
  teaser"** anywhere in the codebase (`TradeCenterPage`).
- **Rough scope:** Large / out of scope for a "Team Detail parity" ticket — this
  would be building the trade analyzer feature itself first, then deciding
  whether/how it surfaces on Team Detail. Not a small, well-scoped addition;
  flagging only because the original finding named it.

## 4. Recommendation

None of the three candidates are a "small, well-defined, implement without
further product input" size:

- Candidate A is the smallest (backend already shipped), but still needs a
  product call on matchup-lock/no-matchup UX and touches a page that has no
  existing matchup plumbing in its Lineup tab.
- Candidate B needs either a resolver/query-shape change or reuse of
  matchup-scoped data in a new way, plus a product call on when projections
  should show.
- Candidate C is not scoped at all yet (the underlying analyzer doesn't exist).

Per LS-6442's own text ("needs a strategy call"), **no code is being shipped
against this ticket**. Suggested next step: product picks between Candidate A
(cheapest, backend exists) and Candidate B (more requested-shaped, matches
what baseball already does) as the actual LS-6442 scope, and a follow-up
implementation ticket gets filed against that decision.
