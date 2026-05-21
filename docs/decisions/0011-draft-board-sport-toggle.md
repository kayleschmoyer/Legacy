# 0011. Draft Board: sport-agnostic surface (baseball + football)

Date: 2026-05-21

## Status

Accepted (spike — LS-4651)

## Context

The Draft Board design synced under LS-4572 / [`docs/design/B8P9BQz8s6NZ9Q-FqWI_yA/legacy-sports-draft-board/`](../design/B8P9BQz8s6NZ9Q-FqWI_yA/legacy-sports-draft-board/) now includes a sport toggle that swaps the entire draft surface between baseball and football. Position pills, player cards, the data table, the snake/board grid, depth chart, queue, roster bars, pick history, intel recommendations, mobile views, and the pre-draft lobby ("Dead Ball Dynasty" → "Gridiron Dynasty") all swap together. The mockup expresses this with a body-level `data-sport="baseball|football"` attribute and a `display: none` rule for non-matching descendants ([`draft.html:2852`](../design/B8P9BQz8s6NZ9Q-FqWI_yA/legacy-sports-draft-board/project/scratch/mockups/draft.html)). Football uses gridiron position colors (QB=seam, RB=dirt, WR=turf green, TE=steel, K=gold, DEF=navy-blue, FLEX=muted gold).

The product is baseball-only today. Surfacing football is not a visual-alignment task; it spans the database, GraphQL schema, draft engine, stats ingestion, and a meaningful fraction of the web UI. This ADR scopes the work and slices it into implementation tickets under epic LS-4568. It does not commit to football data ingestion or to a launch; the goal of the first wave is to make the **draft surface** sport-aware and to land football as a supported sport-kind end-to-end with mock player data.

### Inventory of baseball-only assumptions

**Data layer.** No `sport` column exists on `leagues`; a league's sport is implied by the product. No `sport_kind` enum in Postgres. GraphQL `League` type has no `sport` field. Player rows are MLB-scoped via `lambdas/stats-lambda/` (`player-stats-loader.ts`, `load-game.ts`); there is no analogous football pipeline.

**Position model.** [`lib/utils/src/lib/allowed-positions.ts`](../../lib/utils/src/lib/allowed-positions.ts) maps roster slots to eligible stat positions; both `ALLOWED_POSITIONS` and the helper sets `PITCHING_POSITIONS` / `BATTING_POSITIONS` are baseball-only. [`lib/shared-components/src/utils/PositionModels.ts:9`](../../lib/shared-components/src/utils/PositionModels.ts) hardcodes the `Position` union to baseball positions, and `PositionSlot` enumerates only baseball slots. `isPitcher()` / `isBatter()` helpers are baseball semantics with no football analogue.

**Draft engine.** `lambdas/db/src/schema/drafts/` (`candidate-pool.ts`, `auto-pick-scorer.ts`, `scheduled-mutations.ts`, `mutations/*`) assumes a pitcher/batter split when scoring auto-pick candidates. FPG (fantasy points generated) is a baseball construct; the scorer's "bench versatility" heuristic keys off baseball slot codes.

**UI.** [`lib/shared-components/src/features/elite-draft/`](../../lib/shared-components/src/features/elite-draft/) carries the production draft board: `EliteDraftBoardScreen.tsx`, `constants.ts` (baseball `POSITION_COLORS`), `styles.ts` (large scoped CSS file), `utils.ts` (`getPositionColor`). [`lib/shared-components/src/features/draft/`](../../lib/shared-components/src/features/draft/) holds the older `DraftBoard.tsx`, `PlayerCard.tsx`, `FilterComponents.tsx`, `AISuggestions.tsx`, `DraftOrder.tsx`. [`lib/shared-components/src/features/baseball/FilterOptions.tsx:5`](../../lib/shared-components/src/features/baseball/FilterOptions.tsx) exports a hardcoded `BASEBALL_POSITIONS` array.

**Config scaffolding already in place.** [`lib/shared-components/src/config/sports.ts:3`](../../lib/shared-components/src/config/sports.ts) defines `SPORT_CONFIGS` for baseball, football, basketball, hockey — with positions, stat labels, sort options, and accent colors. This config is not yet plumbed into the draft surface; it is a starting point but not the target shape (the colors there are unrelated to the heritage gold / seam-red token vocabulary that this codebase actually uses; football tokens have to be reconciled with `lib/shared-components/src/utils/colors.ts`).

**Routing.** Draft pages live under `apps/web/src/pages/draft/` and `apps/web/src/pages/games/` (file-based Vite routing). Today the route binds to a league by id and assumes baseball.

## Decision

We will make the draft surface sport-aware, sourcing the active sport from `League.sport` rather than from the URL. The mockup's body-level `data-sport` attribute is a UI mechanism, not a routing or data-model contract.

### 1. Route shape: single route, sport from `League.sport`

We **reject** a parallel `/football/league/:id/draft` route tree. Leagues are first-class scoping containers, a single league cannot be both sports, and duplicating the route surface forces a parallel page tree and parallel page-level data wiring with no payoff. The existing `apps/web/src/pages/draft/*` and `apps/web/src/pages/games/*` pages will read `league.sport` and pass it down. The body-level `data-sport` attribute from the mockup is realized as a React prop / context derived from the league.

The mockup's standalone sport toggle is preserved only as a **dev/preview affordance** (e.g. for Storybook and `MockDraftPage`); production users pick a sport at league-create time and the toggle is not in the live draft surface.

### 2. Data model

Add a Postgres enum `sport_kind` with values `'baseball'` and `'football'`. Add `leagues.sport sport_kind NOT NULL DEFAULT 'baseball'`. Backfill is trivial because everything in production is baseball today. Surface as `Sport!` and `League.sport: Sport!` in the GraphQL schema.

Football positions land as an extension of the position model rather than a parallel one. The current `Position` union becomes a discriminated union: a `BaseballPosition` member (today's set) and a `FootballPosition` member (`QB | RB | WR | TE | K | DEF | FLEX`). `PositionSlot` follows the same shape. Helpers — `isPitcher()`, `isBatter()`, future `isOffense()` / `isDefense()` — become sport-scoped. `ALLOWED_POSITIONS` becomes `ALLOWED_POSITIONS_BY_SPORT: Record<SportKind, Record<Slot, Slot[]>>`, with a baseball entry equal to today's map and a football entry sourced from the design.

### 3. Position color tokens

Football color tokens are added to [`lib/shared-components/src/utils/colors.ts`](../../lib/shared-components/src/utils/colors.ts), mirroring the values in the mockup's football theme block ([`draft.html:2700-2846`](../design/B8P9BQz8s6NZ9Q-FqWI_yA/legacy-sports-draft-board/project/scratch/mockups/draft.html)). `POSITION_COLORS` and the elite-draft `POSITION_COLORS` table become `getPositionColor(sport, position)` — taking sport explicitly so callers can't fall back to baseball by accident.

### 4. Stats ingestion is out of scope for the first wave

`lambdas/stats-lambda/` only loads MLB data. A football stats pipeline is a separate, larger workstream and is **not** part of the draft-board sport-toggle initiative. The first wave ships a working football draft against a mock football player pool (seeded via [`lib/test-fixtures/`](../../lib/test-fixtures/)) so the UI, GraphQL, engine, and lobby flow can be exercised end-to-end. Real football data is filed as a follow-up.

### 5. Auto-pick engine

`auto-pick-scorer.ts`'s pitcher/batter split is generalized into a sport-scoped scoring strategy. Football roster archetypes (one QB, two RBs, two-or-three WRs, one TE, one K, one DEF, plus FLEX/BENCH) and a positional-need heuristic replace the bench-versatility heuristic for football leagues. Scoring against a mock FPG estimate is sufficient for the first wave; tuning is a follow-up after real stats land.

### 6. UI

The production draft surface is [`EliteDraftBoardScreen`](../../lib/shared-components/src/features/elite-draft/EliteDraftBoardScreen.tsx). It takes the league's sport as a prop / context value and drives:

- Position pills, filter pills, position-eligibility filters (sourced from sport-aware `ALLOWED_POSITIONS_BY_SPORT`).
- Player card left-edge accent + data-table position column (sourced from `getPositionColor(sport, pos)`).
- Snake/board grid cell color (same).
- Depth chart slots (one QB, two RB, three WR, one TE, one K, one DEF, FLEX, BENCH for football vs. the current baseball slot layout).
- Roster bar fill colors (same source).
- Pre-draft lobby copy ("Dead Ball Dynasty" → "Gridiron Dynasty"), pick-clock label, intel-rec headline.
- Stat headers in the data table (`AVG / HR / RBI / …` vs. `PASS YDS / RUSH YDS / REC / …`), driven by `SPORT_CONFIGS.statLabels`.

The mockup's `body[data-sport='X'] [data-sport!='X'] { display: none }` pattern is **only** for the static design preview. The React implementation does not render both sport trees and hide one — it renders the active sport's content only.

## Consequences

**Positive.**

- A single league → single sport → single rendered tree keeps the bundle and the React tree free of dead branches.
- Sport-scoping the position model and color helpers at the type level prevents silent baseball-fallback bugs (helpers require an explicit `sport` argument).
- Mock football data unblocks the entire UI / engine / lobby workstream before the stats pipeline lands; real-stats can ship later without re-touching the surface.

**Negative / accepted.**

- Sport-discriminated `Position` and `PositionSlot` unions touch a lot of code that today treats them as flat strings. Most call sites will compile-error until they read `league.sport` and narrow.
- Auto-pick scoring is generalized but tuned only against mock data in the first wave; football auto-pick quality will be visibly weaker than baseball's until real stats land.
- "Dead Ball Dynasty" / "Gridiron Dynasty" copy strings need a small i18n affordance even though we aren't doing real i18n yet.

**Not chosen.**

- Parallel `/football/...` route tree — rejected (see §1).
- Embedding both sport trees and hiding via CSS (the mockup pattern) — rejected; doubles render cost, complicates state, and hides accessibility tree issues.
- A standalone `sports` table with a foreign key from `leagues` — rejected for the first wave; a Postgres enum is sufficient and adding a row of metadata to a sports config table later is cheap.

## Implementation slices (child tickets)

Filed under epic LS-4568. The order below is the suggested merge order; many can proceed in parallel once the position-model split lands.

1. **DB**: `sport_kind` enum + `leagues.sport` column + migration + backfill.
2. **GraphQL**: surface `Sport` enum + `League.sport` field; thread through Pothos.
3. **Position model split**: discriminated `Position` / `PositionSlot` unions; `ALLOWED_POSITIONS_BY_SPORT`; sport-scoped helpers (`isPitcher` keyed off sport=baseball; introduce `isOffense`/`isDefense` for football).
4. **Position color tokens + `getPositionColor(sport, pos)`**: add football tokens to `colors.ts`; update both `POSITION_COLORS` tables and the lookup signature.
5. **Filter UI**: replace `BASEBALL_POSITIONS` with sport-driven list; sport pulled from league context.
6. **EliteDraftBoardScreen sport prop**: drill `sport` from league through the board; swap chrome labels, stat headers, position pills, player-card colors.
7. **Depth chart football slot layout**: football depth slots and their roster-bar fills.
8. **Pre-draft lobby sport selector**: `SeasonDraftGameCreatePage` + lobby views default to baseball; football selectable; lobby copy ("Dead Ball Dynasty" / "Gridiron Dynasty") flips off sport.
9. **Auto-pick scoring strategy**: generalize `auto-pick-scorer.ts` into a sport-scoped strategy; mock football scoring tier.
10. **Football mock player pool**: seed `lib/test-fixtures` with a football player pool for Storybook + `MockDraftPage`; gate a feature flag that points the real engine at mock-data for football leagues until the stats pipeline lands.

Real football data ingestion (`stats-lambda` analogue) is filed as a separate follow-up outside this epic.
