# Feature: Date Range Filter

**Jira:** LS-5700
**Page:** `view-game-logs` (Epic LS-5303)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Filter game logs to a specific date range by supplying a start and end date. Both
dates are optional as a pair but must be provided together (half-open ranges are
rejected). Dates are interpreted as Eastern Time to match MLB game-date attribution.

Key constraints enforced client-side before the request is sent:

- Both dates required together (empty range or full range; half-open rejected)
- ISO `YYYY-MM-DD` format enforced
- Invalid calendar dates rejected (e.g. Feb 31)
- Start date must be on or before end date
- Neither date may be in the future

When the range is valid the submit button becomes enabled and the dates are sent in
the request body as `start_date` / `end_date`. The page returns only game log rows
whose game date falls within the inclusive range.

## Source

Extracted from: `docs/agents/pages/players/view-game-logs.md`

## Implementation

**Component:** `lib/shared-components/src/features/stats/GameLogsTable.tsx`

### State

| Field        | Type                  | Description                                        |
| ------------ | --------------------- | -------------------------------------------------- |
| `startDate`  | `string`              | ISO date string from the start-date input          |
| `endDate`    | `string`              | ISO date string from the end-date input            |
| `today`      | `string` (memo)       | Today's date in ET via `todayIsoEt()`              |
| `validation` | `DateRangeValidation` | Computed by `validateDateRange(start, end, today)` |

### UI

`DateField` components are rendered for each input:

- **Start date** — `testID="game-logs-start-date"`. On web: `<input type="date">` with
  `max={endDate || today}`. On native: `<Input placeholder="YYYY-MM-DD">`.
- **End date** — `testID="game-logs-end-date"`. `max={today}`.
- Helper text: _"Dates are interpreted as Eastern Time (matches MLB game-date attribution)."_
- Validation error alert rendered when `validation.error` is truthy.
- Submit button disabled when `!validation.ready || loading`.

### API

When start/end dates are non-empty and `validation.ready` is true, the fetch POST body
includes:

```
{ start_date: startDate, end_date: endDate }
```

Empty range (both fields blank): neither key is sent; the API returns all game logs.

## Test Coverage

### Unit tests

File: `lib/shared-components/src/features/stats/GameLogsTable.spec.tsx`

`validateDateRange` pure-function tests:

- Accepts empty range (both dates blank — filter is optional)
- Rejects half-open range (only one date provided)
- Rejects malformed dates (non-ISO strings)
- Rejects impossible dates (e.g. Feb 31)
- Rejects inverted range (end < start)
- Rejects future end date
- Rejects future start date even with empty end (LS-7452)

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/view-game-logs-filters.spec.ts`

`describe('View Game Logs — Date input validation (LS-7455) @regression')`:

- Start date after end date is rejected client-side — inverted range triggers
  `"Start date must be on or before end date."` error and disables submit (LS-7455)
- Future start date (2099-12-31) is rejected client-side — triggers
  `"Start date cannot be in the future"` error and disables submit (LS-7452, LS-7455)

## Related

- **Epic:** LS-5303 — QA — Page: View Game Logs
- **Component:** `lib/shared-components/src/features/stats/GameLogsTable.tsx`
- **Unit test:** `lib/shared-components/src/features/stats/GameLogsTable.spec.tsx`
- **E2E test:** `apps/web-e2e/src/tests/view-game-logs-filters.spec.ts`
- **Known bug (fixed):** LS-7452 — future start date with empty end was incorrectly accepted
- **Known bug (fixed):** LS-7455 — date validation gaps addressed in E2E regression suite
