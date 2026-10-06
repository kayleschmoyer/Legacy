# Mock Drafts Hub — Reference

**Route**: `/mock-drafts` (signed in) · `?tab=mine` / `?tab=invites` opens a tab directly  
**File**: `apps/web/src/pages/mock-drafts/MockDraftsHubPage.tsx` → `MockDraftsHub` (`lib/shared-components/src/features/draft/MockDraftsHub.tsx`)  
**Native**: `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/mock-drafts.tsx`, the same shared screen

---

## Purpose

Slice 7 of the draft-first epic (LS-10079). This is the one place to find a mock draft you didn't create. You can join a public online lobby, pick up or review your own mock drafts, and answer direct invites.

## Layout (in order)

1. "Mock Drafts" heading and a **New mock draft** button (`mock-drafts-new`), which goes to the setup page
2. Tabs: **Join a draft** | **My mock drafts** | **Invites**
3. The tab's content (below)

### Join a draft (`mock-drafts-join-tab`)

- Sport toggle (Baseball / Football) and a player-pool toggle (All, NL/AL or AFC/NFC)
- A card per lobby (`public-mock-draft-<id>`) shows the host, sport, player pool, seats (`filled / total · N open`), pick clock, rounds and time left before the lobby closes
- **Join** (`public-mock-draft-join-<id>`) opens a team-name field. **Join draft** (`public-mock-draft-confirm-<id>`) then calls `joinMockDraft(draftId, teamName)` and lands in the lobby at `/:sport/mock-draft/:draftId`
- Empty state (`mock-drafts-join-empty`) with **Start your own mock draft** (`mock-drafts-create`)
- **Load more** (`mock-drafts-join-more`) appears while there are more pages

### My mock drafts (`mock-drafts-mine-tab`)

- Status filter: All · Lobby · Live · Completed
- A card per draft (`my-mock-draft-<id>`) shows sport, Online/Offline, Host, the status (`my-mock-draft-status-<id>`), pool, people/teams and rounds
- **Resume** (lobby or live) or **View results** (completed), both `my-mock-draft-open-<id>`, open `/:sport/mock-draft/:draftId`. A completed draft room renders its results (the recap on compact screens, `DraftCompleteView` on wide ones)
- Empty state: `mock-drafts-mine-empty`

### Invites (`mock-drafts-invites-tab`)

- A card per pending invite (`hub-invite-<id>`), for both mock drafts and leagues, with Accept and Decline (`InviteResponseActions`)
- Empty state: `mock-drafts-invites-empty`

## Behaviour

| Query                                                | Lists                                                                                                                                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `publicMockDrafts(sport!, playerPool, first, after)` | Public ONLINE lobbies that are `not-started` and unexpired, with ≥ 1 open seat (open seats minus pending invite reservations). Excludes lobbies you already sit in. Newest first. |
| `myMockDrafts(status, first, after)`                 | Every mock draft you hold a seat in, newest first. Expired lobbies are excluded. `status` is `LOBBY` / `LIVE` / `COMPLETED`.                                                      |
| `myInvites(first, after)`                            | Your pending, unexpired direct invites (LS-10078).                                                                                                                                |

- All three are cursor-paged (default 20, max 50). The public list is keyed on `(created_at, id)` over `drafts_public_mock_lobby_idx`.
- Seat counts refresh when a tab is opened, when the browser window regains focus (web), and on screen focus (native). There is no live subscription.
- The open-seat count is the same as the lobby's and the join guard's (`getSeatAvailability`), so a listed lobby is joinable unless it filled or started in the meantime. In that case the card shows a generic "Couldn't join this draft" message, and the real error is logged.

## Entry points

- Web nav drawer: **Mock Drafts** goes to `/mock-drafts`
- Mock draft setup (web and native): "Browse public lobbies and your mock drafts →" (`mock-draft-browse-hub`)

## Related

- `docs/agents/pages/baseball/mock-draft.md`: the setup page
- `docs/agents/pages/join.md`: join by invite code
