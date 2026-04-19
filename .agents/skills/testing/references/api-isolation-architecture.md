# API Isolation Architecture (3-Layer Mock System)

## Layer structure

Playwright routes match in **LIFO order** (last registered runs first). The three layers register in this order, so they execute in reverse:

| Layer | File                               | Registers            | Runs   | Purpose                                             |
| ----- | ---------------------------------- | -------------------- | ------ | --------------------------------------------------- |
| 1     | `auth-enhanced.ts` `_apiIsolation` | First (auto fixture) | Last   | Shared baseline mocks + unmocked-op detection       |
| 2     | `auth.ts` page fixture             | Second               | Middle | Authenticated-user overrides (OAuth login, leagues) |
| 3     | Test code (`page.route()`)         | Last (test body)     | First  | Scenario-specific operation mocks                   |

Request flow: **test handler → auth.ts handler → \_apiIsolation baseline → throw if unknown**

## `route.fallback()` vs `route.continue()`

The hermetic pattern depends on this distinction — they look similar but do opposite things:

| Method               | Effect                                                                                                                            | Allowed in hermetic E2E?                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `route.fallback()`   | Pass control to the **next installed Playwright route handler**. In our setup that is always `_apiIsolation`, which `fulfill()`s. | ✅ Yes — stays fully hermetic.                                             |
| `route.continue()`   | Let the request proceed to the **real network**.                                                                                  | ❌ Never — breaks hermeticity, will hit `localhost:5000` or external APIs. |
| `route.fulfill(...)` | Respond with the mock data you supply.                                                                                            | ✅ Yes — the primary tool.                                                 |

Use `route.fallback()` when a test-level handler wants a specific operation mocked but wants ambient/unrelated operations to fall through to the baseline. Never use `route.continue()` — every hermetic test relies on `_apiIsolation` being the ultimate fulfiller.

## Baseline mocks (`fixtures/shared-mocks.ts`)

The baseline mock map (`BASELINE_GRAPHQL_RESPONSES`) provides default responses for ~30 common GraphQL operations. These cover:

- **App shell**: `GetUserById`, `GetUserLeagues` (empty)
- **Home page**: `GetOnThisDay`, `GetOnThisDayEvents`
- **League detail**: `GetLeagueById`, `GetLeagueTeams`, `GetPositionsForLeague`, `GetLeagueScoringProfile`, matchups, standings, activity, chat, etc.
- **Draft**: `GetLeagueDraft`, `GetDraftTeamOrder`
- **Subscription, trade block, playoff, player stats, admin, team members, invite code**

All baseline responses use the factory functions from `mocks/graphql/` (e.g., `leagueByIdResponse()`, `leagueTeamsResponse()`).

## Unmocked operation detection

If a GraphQL operation reaches layer 1 and is **not** in the baseline map:

1. **During the test**: returns `{ errors: [{ message: "unmocked..." }] }` (so the UI shows an error state instead of hanging)
2. **After the test body**: throws a descriptive error listing all unmocked operations

This catches missing mocks early. Fix by adding the operation to `shared-mocks.ts` (if common) or mocking it in the test.

## How to add a new baseline operation

1. Edit `apps/web-e2e/src/fixtures/shared-mocks.ts`
2. Add a lowercased key to `BASELINE_GRAPHQL_RESPONSES`
3. Use a factory from `mocks/graphql/` or return a minimal `{ data: { fieldName: null } }` response

## auth.ts overrides

`auth.ts` extends `auth-enhanced.ts` and adds overrides for authenticated user context:

- OAuth login endpoint mock
- `GetUserLeagues` → returns one league (overrides baseline's empty array)
- `StartDraft` and `UpdateLeagueBranding` mutation mocks
- All other operations use `route.fallback()` → fall through to baseline

Tests that import from `auth.ts` get both the auth overrides AND the baseline.

## URL pattern behavior

| URL Pattern            | Layer 1 (baseline) Response                     | Why                                                 |
| ---------------------- | ----------------------------------------------- | --------------------------------------------------- |
| `*/graphql` (known op) | `200` with baseline mock data                   | Components render with reasonable defaults          |
| `*/graphql` (unknown)  | `200 { errors: [...] }` + post-test throw       | Catches missing mocks — add to shared-mocks.ts      |
| Everything else        | `401 { error: 'Blocked by E2E API isolation' }` | Prevents silent JWT refresh and other backend calls |
