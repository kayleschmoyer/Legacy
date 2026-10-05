# Join by Invite Code — Reference

**Route**: `/join` · `/join/:code` (public — a signed-out visitor gets a sign-in prompt that returns to the same code)  
**File**: `apps/web/src/pages/join/JoinByCodePage.tsx` → `JoinByCodeScreen` (`lib/shared-components/src/features/invites/`)  
**Native**: `apps/app/src/app/(app)/join/[code].tsx`, the same shared screen

---

## Purpose

The universal invite route (LS-10078). One code box takes any invite code. `resolveInviteCode` decides whether it is a mock-draft lobby's code or a league's code, and the page joins the right one.

## Layout (in order)

1. "Join with a code" heading
2. Invite code input (8 characters, prefilled from the URL)
3. Status: sign-in prompt / spinner / "doesn't match" (`join-not-found`)
4. Preview card
   - Mock draft (`join-preview-mock`): host, sport, player pool, seats filled/total/open, pick clock, rounds, lobby time left
   - League (`join-preview-league`): name, sport, open teams, draft date
5. "Already in" note with an Open button (`join-already-in`), or "no longer taking players" / "league is full" (`join-unavailable`)
6. Team name input + Join button (`join-submit`)

## Behaviour

| Code kind  | Mutation                                 | Lands on                      |
| ---------- | ---------------------------------------- | ----------------------------- |
| Mock draft | `joinMockDraft(inviteCode, teamName)`    | `/:sport/mock-draft/:draftId` |
| League     | `joinLeagueByCode(inviteCode, teamName)` | `/:sport/league/:leagueId`    |

"Open seats" excludes seats held for pending direct invites, so a lobby whose only open seat is reserved shows as full.

## Legacy links (redirect here)

- `/baseball/mock-draft/join[/:inviteCode]` → `/join[/:code]`
- `/baseball/league/join/:inviteCode` and `/football/league/join/:inviteCode` → `/join/:code` (LS-10422), keeping any query string. The bare `/:sport/league/join` page (public-league Quick Join, `JoinLeagueByCodePage`) is not redirected.
- Share links (league detail Invite card, native league share, home-screen invite) emit `/join/<code>`.
- On native, `+native-intent.ts` rewrites the same legacy links to `/join/<code>`.

## Related

- Direct invites: the host's invite panel in the mock lobby, "Invite Users" in commissioner settings, and Accept/Decline on `DRAFT_INVITE` notifications.
