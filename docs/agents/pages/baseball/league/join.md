# Join League by Invite Code — Reference

**Route**: `/baseball/league/join` · `/baseball/league/join/:inviteCode`  
**File**: `apps/web/src/pages/baseball/JoinLeagueByCodePage.tsx`

---

## Layout (in order)

1. Page header — "Join League" (H1) + contextual subtitle
2. Pre-filled code success card (conditional)
3. Main form card — invite code input + team name input + status messages
4. Already Member banner (conditional)
5. League Full banner (conditional)
6. Error message card (conditional)
7. Action buttons — Cancel + Join League
8. Info card — "How It Works" (4 bullet points)

---

## Form Fields

| Field       | Type | Validation                                   | Notes                       |
| ----------- | ---- | -------------------------------------------- | --------------------------- |
| Invite Code | text | 8 uppercase alphanumeric (`/^[A-Z0-9]{8}$/`) | Auto-formatted to uppercase |
| Team Name   | text | Required, max 50 chars                       |                             |

---

## Live Code Validation Flow

Code validation triggers automatically when code reaches 8 characters, using `useValidateInviteCodeLazyQuery`.

| Status                  | Display                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| Validating              | Spinner + "Checking code…"                                        |
| Valid, spots available  | Green check + "{leagueName} — X of Y spots available"             |
| Valid, already a member | Blue check + "You're already in {leagueName}"                     |
| Valid, league full      | Orange icon + "League full — all X spots taken"                   |
| Invalid code            | Red X + "Invalid invite code"                                     |
| Network error           | Orange warning + "Unable to verify code — check your connection…" |

---

## Data Displayed (from validation response)

| Field             | Type    |
| ----------------- | ------- |
| `leagueName`      | string  |
| `leagueId`        | number  |
| `isFull`          | boolean |
| `isAlreadyMember` | boolean |
| `totalSpots`      | number  |
| `availableSpots`  | number  |

---

## Conditional Banners

**Pre-filled code success card** — green card with checkmark  
Condition: URL has code AND code is valid AND league is not full

**Already Member banner** — navy/gold background  
Condition: `isAlreadyMember === true`  
Action: "Go to League" button → `/baseball/league/{leagueId}`

**League Full banner** — orange/red background  
Condition: `isFull === true`  
Message: "This league is full"

---

## Join Button Disabled When

- `loading === true` (mutation pending)
- `validating === true` (code check pending)
- Invite code is empty or < 8 chars
- Team name is empty
- League info not yet loaded
- League is full
- Already a member

---

## GraphQL

| Hook                             | Purpose                                         |
| -------------------------------- | ----------------------------------------------- |
| `useValidateInviteCodeLazyQuery` | Validate 8-char code, return league info        |
| `useJoinLeagueByCodeMutation`    | Join league — input: `{ inviteCode, teamName }` |

**Mutation behavior**:

- On success → navigate to `/baseball/league/{leagueId}`
- GraphQL error code `BAD_USER_INPUT` handled separately (invalid code, already member, full) vs unexpected errors

---

## Actions

| Action                        | Behavior                                       |
| ----------------------------- | ---------------------------------------------- |
| Code input (8 chars)          | Auto-trigger validation query                  |
| Cancel                        | Navigate to `/baseball`                        |
| Join League                   | Validate → call mutation → navigate on success |
| Go to League (already-member) | Navigate to `/baseball/league/{leagueId}`      |
