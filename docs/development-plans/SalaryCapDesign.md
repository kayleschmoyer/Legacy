# LS-640: Salary Cap League + Auction Draft

**Epic:** LS-640 — Salary Cap League + Auction Draft
**Created:** March 7, 2026

## Overview

Add salary cap league support where player salaries are determined by auction draft bids and FAAB waiver claims. Salaries escalate annually on season rollover. Players who spend a full season as free agents see their salary decay (faster than escalation). All mid-season free agent acquisition uses the existing FAAB system.

### Key Design Principles

- **Opt-in per league**: Salary cap is a league setting, default off. Existing leagues are unaffected.
- **Auction sets initial salary**: The winning bid in an auction draft becomes the player's salary.
- **FAAB = salary for pickups**: A successful FAAB claim sets the player's salary to the bid amount.
- **Escalation on rollover**: Rostered players' salaries increase each season at a configurable rate.
- **Decay for free agents**: Unrostered players' salaries decrease each season they remain unclaimed, at a faster rate than escalation.
- **Cap enforcement is transactional**: Every roster move is validated against the salary cap at the point of transaction.

---

## Epic Structure

| Ticket     | Summary                                                | Depends On             |
| ---------- | ------------------------------------------------------ | ---------------------- |
| **LS-634** | Salary cap schema foundations                          | —                      |
| **LS-642** | Implement auction draft bidding flow                   | LS-634                 |
| **LS-643** | Bridge FAAB waiver claims to player salary             | LS-634                 |
| **LS-644** | Enforce salary cap on roster transactions              | LS-634, LS-642, LS-643 |
| **LS-645** | Salary escalation on rollover + free agent decay       | LS-634, LS-309         |
| **LS-309** | Season renewal/new season flow                         | —                      |
| **LS-646** | Salary cap UI: roster payroll, cap space, auction room | LS-644, LS-642         |

---

## Data Model

### New columns on `leagues`

| Column                  | Type      | Default | Description                                                          |
| ----------------------- | --------- | ------- | -------------------------------------------------------------------- |
| `salary_cap_enabled`    | `boolean` | `false` | Enables salary cap mode for the league                               |
| `salary_cap`            | `integer` | `null`  | Total salary budget per team (e.g., 260)                             |
| `salary_floor`          | `integer` | `null`  | Optional minimum total payroll a team must carry                     |
| `luxury_tax_threshold`  | `integer` | `null`  | Optional threshold above cap before penalties apply                  |
| `min_salary`            | `integer` | `1`     | Minimum salary any player can have after decay                       |
| `salary_escalation_pct` | `integer` | `10`    | Annual escalation rate as a whole-number percentage (10 = 10%)       |
| `salary_decay_pct`      | `integer` | `25`    | Annual free agent decay rate as a whole-number percentage (25 = 25%) |
| `auction_budget`        | `integer` | `260`   | Total auction draft budget per team (distinct from FAAB)             |
| `auction_min_bid`       | `integer` | `1`     | Minimum bid allowed in auction draft                                 |

> **Why whole-number percentages instead of decimals?** Integer math avoids floating-point
> rounding issues in salary calculations. `salary_escalation_pct = 10` means 10%, applied
> as `Math.ceil(salary * 110 / 100)`.

### New column on `draft_picks`

| Column       | Type      | Default | Description                                       |
| ------------ | --------- | ------- | ------------------------------------------------- |
| `bid_amount` | `integer` | `null`  | Winning auction bid. Null for non-auction drafts. |

### New column on `team_members`

| Column   | Type      | Default | Description                                                                          |
| -------- | --------- | ------- | ------------------------------------------------------------------------------------ |
| `salary` | `integer` | `null`  | Current salary cap hit for this player on this team. Null in non-salary-cap leagues. |

### New table: `player_salaries`

Tracks salary for every player in a salary-cap league, **including free agents**. This is the authoritative source of a player's salary in the league context — `team_members.salary` is a denormalized copy for query convenience.

```
player_salaries (
  id              SERIAL PRIMARY KEY,
  league_id       INTEGER NOT NULL → leagues.id ON DELETE CASCADE,
  player_id       INTEGER NOT NULL → players.id,
  current_salary  INTEGER NOT NULL,
  initial_salary  INTEGER NOT NULL,         -- original auction bid or FAAB claim
  acquisition_type VARCHAR(20) NOT NULL,    -- 'auction' | 'waiver' | 'commissioner'
  year_acquired   INTEGER NOT NULL,         -- league season number when first acquired
  last_rostered_season INTEGER,             -- last season player was on a roster (null = never rostered)
  free_agent_years INTEGER NOT NULL DEFAULT 0,  -- consecutive seasons as FA
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(league_id, player_id)
)

Indexes:
  - league_id
  - player_id
  - (league_id, current_salary)  -- for cap space queries
```

### New table: `auction_state` (live auction tracking)

Tracks the live state of an auction draft in progress. Ephemeral — rows are deleted when the draft completes.

```
auction_state (
  id              SERIAL PRIMARY KEY,
  draft_id        INTEGER NOT NULL → drafts.id ON DELETE CASCADE,
  nominator_team_id INTEGER NOT NULL → teams.id,  -- whose turn to nominate
  nominated_player_id INTEGER → players.id,       -- currently nominated player (null = waiting for nomination)
  current_bid     INTEGER,                         -- current highest bid
  current_bidder_team_id INTEGER → teams.id,       -- team with highest bid
  nomination_deadline TIMESTAMPTZ,                 -- timer for nomination phase
  bid_deadline    TIMESTAMPTZ,                     -- timer for bidding phase
  nomination_order INTEGER NOT NULL,               -- current position in nomination rotation

  UNIQUE(draft_id)
)
```

### New table: `auction_budgets` (per-team auction budget tracking)

```
auction_budgets (
  id              SERIAL PRIMARY KEY,
  draft_id        INTEGER NOT NULL → drafts.id ON DELETE CASCADE,
  team_id         INTEGER NOT NULL → teams.id ON DELETE CASCADE,
  remaining_budget INTEGER NOT NULL,  -- decremented on each winning bid
  players_won     INTEGER NOT NULL DEFAULT 0,

  UNIQUE(draft_id, team_id)
)
```

---

## Drizzle Schema (LS-634)

Exact TypeScript for the new/modified tables, following existing conventions:

### leagues additions

```typescript
// In leagues pgTable columns:
salaryCapEnabled: boolean('salary_cap_enabled').notNull().default(false),
salaryCap: integer('salary_cap'),
salaryFloor: integer('salary_floor'),
luxuryTaxThreshold: integer('luxury_tax_threshold'),
minSalary: integer('min_salary').notNull().default(1),
salaryEscalationPct: integer('salary_escalation_pct').notNull().default(10),
salaryDecayPct: integer('salary_decay_pct').notNull().default(25),
auctionBudget: integer('auction_budget').notNull().default(260),
auctionMinBid: integer('auction_min_bid').notNull().default(1),
```

### draftPicks addition

```typescript
// In draftPicks pgTable columns:
bidAmount: integer('bid_amount'),
```

### teamMembers addition

```typescript
// In teamMembers pgTable columns:
salary: integer('salary'),
```

### playerSalaries (new table)

```typescript
export const playerSalaries = pgTable(
  'player_salaries',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    playerId: integer('player_id').notNull(),
    currentSalary: integer('current_salary').notNull(),
    initialSalary: integer('initial_salary').notNull(),
    acquisitionType: varchar('acquisition_type', { length: 20 }).notNull(),
    yearAcquired: integer('year_acquired').notNull(),
    lastRosteredSeason: integer('last_rostered_season'),
    freeAgentYears: integer('free_agent_years').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      playerSalariesLeagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'player_salaries_league_fk',
      }).onDelete('cascade'),
      playerSalariesPlayerFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: 'player_salaries_player_fk',
      }),
      playerSalariesUk: unique('player_salaries_uk_league_player').on(
        table.leagueId,
        table.playerId,
      ),
      leagueIdIdx: index('player_salaries_league_id_idx').on(table.leagueId),
      playerIdIdx: index('player_salaries_player_id_idx').on(table.playerId),
      leagueSalaryIdx: index('player_salaries_league_salary_idx').on(
        table.leagueId,
        table.currentSalary,
      ),
    };
  },
);
```

### auctionState (new table)

```typescript
export const auctionState = pgTable(
  'auction_state',
  {
    id: serial('id').primaryKey().notNull(),
    draftId: integer('draft_id').notNull(),
    nominatorTeamId: integer('nominator_team_id').notNull(),
    nominatedPlayerId: integer('nominated_player_id'),
    currentBid: integer('current_bid'),
    currentBidderTeamId: integer('current_bidder_team_id'),
    nominationDeadline: timestamp('nomination_deadline', {
      withTimezone: true,
    }),
    bidDeadline: timestamp('bid_deadline', { withTimezone: true }),
    nominationOrder: integer('nomination_order').notNull(),
  },
  (table) => {
    return {
      auctionStateDraftFk: foreignKey({
        columns: [table.draftId],
        foreignColumns: [drafts.id],
        name: 'auction_state_draft_fk',
      }).onDelete('cascade'),
      auctionStateDraftUk: unique('auction_state_uk_draft').on(table.draftId),
    };
  },
);
```

### auctionBudgets (new table)

```typescript
export const auctionBudgets = pgTable(
  'auction_budgets',
  {
    id: serial('id').primaryKey().notNull(),
    draftId: integer('draft_id').notNull(),
    teamId: integer('team_id').notNull(),
    remainingBudget: integer('remaining_budget').notNull(),
    playersWon: integer('players_won').notNull().default(0),
  },
  (table) => {
    return {
      auctionBudgetsDraftFk: foreignKey({
        columns: [table.draftId],
        foreignColumns: [drafts.id],
        name: 'auction_budgets_draft_fk',
      }).onDelete('cascade'),
      auctionBudgetsTeamFk: foreignKey({
        columns: [table.teamId],
        foreignColumns: [teams.id],
        name: 'auction_budgets_team_fk',
      }).onDelete('cascade'),
      auctionBudgetsUk: unique('auction_budgets_uk_draft_team').on(
        table.draftId,
        table.teamId,
      ),
    };
  },
);
```

---

## Business Rules

### Salary Escalation (Season Rollover)

Applied during `renewLeague()` (LS-309) for every rostered player:

```
new_salary = Math.ceil(current_salary * (100 + salary_escalation_pct) / 100)
```

**Example** (10% escalation): $10 → $11 → $13 → $15 → $17 → ...

- Applied to all players carried over via keeper selection or roster retention.
- Capped salary is not enforced here — the team may go over cap temporarily and must cut players to get under before the new season's roster lock.

### Free Agent Salary Decay

Applied during `renewLeague()` for every player in `player_salaries` who is **not on any team's roster** at season end:

```
free_agent_years += 1
new_salary = Math.max(min_salary, Math.floor(current_salary * (100 - salary_decay_pct) / 100))
```

**Example** (25% decay, min $1): $40 → $30 → $22 → $16 → $12 → $9 → $6 → $4 → $3 → $2 → $1

- If a free agent is picked up mid-season, their `free_agent_years` resets to 0.
- Their salary at time of pickup is their FAAB bid, **not** their decayed value.

### Salary Lifecycle

| Event                              | Salary Effect                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Auction draft: team wins bid of $X | `initial_salary = X`, `current_salary = X`                                                              |
| FAAB claim: team bids $X           | `initial_salary = X`, `current_salary = X`                                                              |
| Commissioner assignment            | `current_salary = min_salary` (commissioner can override)                                               |
| Season rollover (rostered)         | `current_salary = escalated value`                                                                      |
| Season rollover (free agent)       | `current_salary = decayed value`, `free_agent_years += 1`                                               |
| Player cut mid-season              | Player's `player_salaries` row keeps current salary; team's cap freed immediately (no dead money in v1) |
| Trade                              | Player moves to new team at same salary — no salary match requirement in v1                             |

### Cap Enforcement

Cap is enforced at transaction time. A transaction is blocked if `team_payroll + new_salary > salary_cap`:

| Transaction            | Validation                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Auction draft bid      | `committed_payroll + bid ≤ salary_cap`. Also: `bid ≤ remaining_auction_budget`. Must reserve $1 per unfilled roster slot.       |
| FAAB claim             | `current_payroll + faab_bid ≤ salary_cap` AND `faab_bid >= player's current_salary` (in addition to existing FAAB budget check) |
| Trade (receiving side) | `current_payroll - outgoing_salaries + incoming_salaries ≤ salary_cap`                                                          |
| Season rollover        | NOT enforced — teams may exceed cap after escalation. Must cut to compliance before new season roster lock.                     |

Where:

- `current_payroll = SUM(team_members.salary) for the team`
- `committed_payroll = current_payroll + sum of pending winning bids not yet on roster` (auction context)

### Auction Draft Flow (LS-642)

1. **Initialization**: Create `auction_budgets` row per team with `remaining_budget = leagues.auction_budget`. Create `auction_state` row for the draft.
2. **Nomination rotation**: Teams take turns nominating a player. Order determined by `draftTeams.draftSlot`. Timer: configurable (default 60s). If timer expires, auto-nominate the highest-ranked remaining player from the team's draft queue (or random if no queue).
3. **Bidding phase**: All teams can bid on the nominated player. Minimum bid = `leagues.auction_min_bid`. Each bid must exceed current bid by at least 1. Timer resets on each bid (default 15s). When timer expires with no new bids, the highest bidder wins.
4. **Win**: Winner's `auction_budgets.remaining_budget` decremented. Player added to roster. `player_salaries` and `team_members.salary` set to winning bid. `draft_picks` recorded with `bid_amount`.
5. **Budget constraint**: A team cannot bid more than `remaining_budget - (unfilled_slots - 1) * min_bid`. This ensures they can fill their entire roster at minimum bid.
6. **Completion**: Draft completes when all roster slots are filled or all players are nominated.

### FAAB → Salary Bridge (LS-643)

**Minimum bid rule**: In a salary cap league, the minimum FAAB bid for a free agent is the player's `currentSalary` in `player_salaries` (or `leagues.minSalary` if no record exists). This is how salary decay creates market value — a player whose salary has decayed to $3 can be claimed for as little as $3, while a recently-cut $40 player requires at least a $40 bid. The existing `leagues.auctionMinBid` does **not** apply to FAAB — it's auction-draft-only.

**Claim validation** (in `claimFreeAgent` mutation):

1. Look up `player_salaries` for the target player in this league.
2. If a record exists: `faabBid >= player_salaries.currentSalary` (else reject).
3. If no record exists: `faabBid >= leagues.minSalary` (player has never been in the salary system).
4. Existing validations still apply: `faabBid <= team.faabBudget`, roster capacity, etc.

**On successful claim** (in `processWaiverClaims`):

1. Upsert `player_salaries` row: `current_salary = faab_bid`, `initial_salary = faab_bid`, `acquisition_type = 'waiver'`, `year_acquired = current_league_season`, `free_agent_years = 0`.
2. Set `team_members.salary = faab_bid` on the new roster entry.
3. If the claim involves dropping a player, that player's `player_salaries` row keeps its `current_salary` (they enter FA at their existing salary, decay applies at rollover).

---

## GraphQL Additions

### League type additions

```graphql
type League {
  # ... existing fields ...
  salaryCapEnabled: Boolean!
  salaryCap: Int
  salaryFloor: Int
  luxuryTaxThreshold: Int
  minSalary: Int!
  salaryEscalationPct: Int!
  salaryDecayPct: Int!
  auctionBudget: Int!
  auctionMinBid: Int!
}
```

### Team type additions

```graphql
type Team {
  # ... existing fields ...
  totalPayroll: Int # sum of team_members.salary (computed)
  capSpace: Int # salary_cap - totalPayroll (computed, null if cap disabled)
}
```

### TeamMember type addition

```graphql
type TeamMember {
  # ... existing fields ...
  salary: Int
}
```

### DraftPick type addition

```graphql
type DraftPick {
  # ... existing fields ...
  bidAmount: Int
}
```

### New types for auction

```graphql
type AuctionState {
  draftId: Int!
  nominatorTeam: Team!
  nominatedPlayer: DraftPlayer
  currentBid: Int
  currentBidder: Team
  nominationDeadline: DateTime
  bidDeadline: DateTime
}

type AuctionBudget {
  team: Team!
  remainingBudget: Int!
  playersWon: Int!
  maxBid: Int! # computed: remaining - (unfilled_slots - 1) * min_bid
}
```

### New mutations (LS-642)

```graphql
type Mutation {
  nominatePlayer(draftId: Int!, playerId: Int!): AuctionState!
  placeBid(draftId: Int!, amount: Int!): AuctionState!
}
```

---

## Migration Plan

### LS-634 migration: `20260308_000000_add_salary_cap_schema.ts`

1. Add columns to `leagues`: `salary_cap_enabled`, `salary_cap`, `salary_floor`, `luxury_tax_threshold`, `min_salary`, `salary_escalation_pct`, `salary_decay_pct`, `auction_budget`, `auction_min_bid`
2. Add `bid_amount` column to `draft_picks`
3. Add `salary` column to `team_members`
4. Create `player_salaries` table with indexes and constraints
5. Create `auction_state` table
6. Create `auction_budgets` table

All new columns on existing tables are nullable or have defaults — **no backfill needed**, no breaking changes.

---

## Open Questions

1. **Luxury tax**: v1 ignores `luxury_tax_threshold`. Future ticket if needed.
2. **Dead money**: v1 has no dead money on cuts. Player's cap hit is removed immediately. Future ticket if needed.
3. **Trade salary matching**: v1 has no salary matching requirement for trades. Either team just needs to stay under cap post-trade.
4. **Keeper selection**: LS-309 handles roster carry-over. How many keepers? Is every rostered player kept, or is there a selection process? Defer to LS-309 scope.
5. **Commissioner salary adjustments**: Should commissioners be able to manually set a player's salary? Defer to a future ticket.
6. **Multi-year contracts**: v1 has no contract length. All players are year-to-year. Future enhancement if needed.
