# Feature: Join Baseball League CTA

**Jira:** LS-5338
**Page:** `baseball-home` (Epic LS-5258)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

The Join Baseball League CTA is the primary entry point on the Baseball Home page
(`/baseball`) for users who want to enter an existing league via invite code or browse
public leagues. On web the CTA triggers navigation to `/baseball/league/join`
(the `JoinLeagueByCodePage`), where the user enters an 8-character invite code and a
team name to complete the join flow.

**Web entry point:** `apps/web/src/components/baseball/BaseballScreen.tsx`
— `onJoinLeague` prop navigates to `/baseball/league/join`

**Join-by-code page:** `apps/web/src/pages/baseball/JoinLeagueByCodePage.tsx`

**Shared hub component:** `lib/shared-components/src/features/baseball/MLBHome` (rendered
by `BaseballScreen`; surfaces the "Join League" CTA in both the active-leagues list
layout and the empty-state layout)

### Hub Layouts

| Layout              | Condition                  | CTA surface                           |
| ------------------- | -------------------------- | ------------------------------------- |
| Active leagues list | `userLeagues.length > 0`   | Button / card in the hub hero section |
| Empty state         | `userLeagues.length === 0` | CTA card in the empty-state banner    |

The "Join League" CTA is present in **both** layouts — a new user with no leagues
sees it as part of the empty-state onboarding CTAs, and a returning user sees it
alongside their league list.

### Join-by-Code Page (route: `/baseball/league/join`)

See [`docs/agents/pages/baseball/league/join.md`](../../../../../pages/baseball/league/join.md)
for the full field/validation/GraphQL reference.

Key behaviors relevant to QA coverage:

- Invite code input auto-formats to uppercase; maxLength 8
- Code validation triggers automatically at 8 characters via `useValidateInviteCodeLazyQuery`
- Join button is disabled until both fields are filled AND league is not full / already a member
- Successful join navigates to `/baseball/league/{leagueId}`
- Cancel returns to `/baseball`

## Test Coverage

### E2E tests (hermetic — web only)

**File:** `apps/web-e2e/src/tests/baseball-join-league-cta.spec.ts`

#### `describe('Join Baseball League CTA — hub with active leagues @critical')`

- `'Join League CTA is visible when user has active leagues'`
  — mocks `GetUserLeagues` with 2 leagues; asserts "Join League" text is visible
- `'Join League CTA is enabled when user has active leagues'`
  — asserts the CTA button/control is not disabled
- `'clicking Join League CTA navigates to /baseball/league/join'`
  — clicks CTA, asserts URL changes to `/baseball/league/join`

#### `describe('Join Baseball League CTA — hub empty state @critical')`

- `'Join League CTA is visible in the empty-state layout'`
  — mocks `GetUserLeagues` with empty array; asserts CTA is still visible
- `'clicking Join League CTA in empty state navigates to /baseball/league/join'`
  — clicks CTA from empty-state hub, asserts navigation

#### `describe('Join Baseball League CTA — join form accepts invite code input @critical')`

- `'join form shows invite code input'`
- `'join form shows team name input'`
- `'invite code input accepts and uppercases text'`
  — fills lowercase `abcd1234`, asserts value becomes `ABCD1234`
- `'join button is disabled until both fields are filled'`

#### `describe('Join Baseball League CTA — end-to-end flow @regression')`

- `'navigates from /baseball to join form and completes join'`
  — full mocked flow: hub → click CTA → fill invite code (mocked `ValidateInviteCode`
  response) → fill team name → submit (mocked `JoinLeagueByCode` mutation) →
  assert redirect to `/baseball/league/101`

### Related spec files

| File                                         | What it covers                                                                                                                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web-e2e/src/tests/join-league.spec.ts` | Deep join-form coverage: code validation states (valid/invalid/full/already-member), form validation, keyboard submission, GraphQL error handling, cancel navigation, unauthenticated public-route access |
| `apps/web-e2e/src/tests/baseball-ui.spec.ts` | Baseball hub smoke tests including basic Join League button visibility                                                                                                                                    |

## Related

- **Epic:** LS-5258 — QA — Page: Baseball Home
- **Join-by-code page reference:** `docs/agents/pages/baseball/league/join.md`
- **Web hub component:** `apps/web/src/components/baseball/BaseballScreen.tsx`
- **Join-by-code page:** `apps/web/src/pages/baseball/JoinLeagueByCodePage.tsx`
- **Mock factories:** `apps/web-e2e/src/mocks/graphql/league.mocks.ts`
  (`validateInviteCodeResponse`, `joinLeagueByCodeResponse`, `userLeaguesResponse`)
