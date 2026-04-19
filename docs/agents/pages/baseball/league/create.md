# League Create Page — Reference

**Route**: `/baseball/league/create`  
**File**: `apps/web/src/pages/baseball/LeagueCreatePage.tsx`

---

## Layout

Single-page form card with collapsible accordion sections. "Basic Settings" is expanded by default; all others are collapsed.

**Header**: "Create Baseball League" (H1) + "Configure your league settings and draft rules" (subtitle)

---

## Form Sections & Fields

### Basic Settings (expanded by default)

| Field               | Type         | Values              | Notes                   |
| ------------------- | ------------ | ------------------- | ----------------------- |
| `leagueName`        | text         | max 50 chars, min 3 | Required                |
| `numberOfTeams`     | button group | 4–16                | Required                |
| `numberOfDivisions` | button group | 1–4                 | Filtered by team parity |
| `isPublic`          | toggle       | Private / Public    |                         |

**Division constraint**: When team count is odd, division count must also be odd. Auto-resets to 1 when team count changes and parity conflicts.

---

### Roster & Schedule (collapsed)

| Field                | Type         | Values                            |
| -------------------- | ------------ | --------------------------------- |
| `schedulingStrategy` | button group | Divisional / Round-Robin / Random |
| `maxRosterSize`      | button group | 20–40                             |
| `playerPool`         | button group | All MLB / NL / AL                 |

---

### Era & History (collapsed)

| Field                | Type          | Values                                                                               | Notes                                      |
| -------------------- | ------------- | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| `eraFilter`          | button group  | All Eras, Dead Ball, Golden Age, Expansion, Free Agency, Steroid Era, Modern, Custom | Non-free options require premium           |
| `customEraStartYear` | text (number) | year                                                                                 | Only visible when `eraFilter === 'custom'` |
| `customEraEndYear`   | text (number) | year                                                                                 | Only visible when `eraFilter === 'custom'` |
| `hofOnly`            | toggle        | ON / OFF                                                                             | Hall of Fame players only                  |

---

### Draft Settings (collapsed)

| Field             | Type             | Values                       | Notes                                                      |
| ----------------- | ---------------- | ---------------------------- | ---------------------------------------------------------- |
| `draftMode`       | button group     | Live Draft / Automated Draft |                                                            |
| `selectionMethod` | button group     | Standard / Auction / Random  | Disabled (forced to Random) if `draftMode === 'automated'` |
| `draftOrder`      | button group     | Snake / Linear               |                                                            |
| `auctionBudget`   | number input     | —                            | Only visible when `selectionMethod === 'auction'`          |
| `auctionMinBid`   | number input     | —                            | Only visible when `selectionMethod === 'auction'`          |
| `draftDate`       | date/time picker | future dates only            | Optional                                                   |

---

### Waivers, Budget & Salary Cap (collapsed)

| Field               | Type         | Values                                 | Notes                                         |
| ------------------- | ------------ | -------------------------------------- | --------------------------------------------- |
| `waiverType`        | button group | Standard / FAAB                        | FAAB requires premium                         |
| `faabBudgetDefault` | button group | $50 / $100 / $150 / $200 / $250 / $500 | Only visible when `waiverType === 'faab'`     |
| `salaryCapEnabled`  | toggle       | ON / OFF                               | Requires premium                              |
| `salaryCap`         | number input | —                                      | Only visible when `salaryCapEnabled === true` |

---

## Validation Rules

| Rule                      | Detail                                                  |
| ------------------------- | ------------------------------------------------------- |
| League name               | Required, 3–50 characters                               |
| Teams                     | 4–16                                                    |
| Divisions                 | ≤ number of teams; parity must match                    |
| Roster size               | 15–50                                                   |
| Draft date                | Must be in the future                                   |
| Custom era                | Both start and end year required; start ≤ end           |
| FAAB                      | Requires premium — blocks submission with upgrade modal |
| Historical era (non-free) | Requires premium — blocks submission with upgrade modal |

---

## Actions

| Button                      | Behavior                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| Collapsible section headers | Toggle open/closed                                                                           |
| Cancel                      | Navigate to `/baseball`                                                                      |
| Create League (submit)      | Validate form → call `useCreateLeagueAndTeamsMutation` → navigate to `/baseball/league/{id}` |

---

## GraphQL

**Mutation**: `useCreateLeagueAndTeamsMutation`

- Input: `CreateLeagueInput` (all form fields)
- Returns: `{ createLeagueAndTeams { league { id } } }`
- On success: navigate to `/baseball/league/{leagueId}`

---

## Conditional Rendering

| Element                     | Condition                                          |
| --------------------------- | -------------------------------------------------- |
| Auction settings            | `selectionMethod === 'auction'`                    |
| Custom era year inputs      | `eraFilter === 'custom'`                           |
| Selection method (disabled) | `draftMode === 'automated'` (auto-forces 'random') |
| FAAB settings               | `waiverType === 'faab'` AND premium                |
| Salary cap input            | `salaryCapEnabled === true` AND premium            |
| Error banner                | `formError !== null` (red card)                    |
| All inputs disabled         | `loading === true`                                 |
| Submit button text          | "Creating..." when `loading === true`              |

---

## Footer Info Card

"What happens next?" with bullet points explaining post-creation steps.

---

## URL Pre-fill

League name can be pre-populated via `?name=...` query param.
