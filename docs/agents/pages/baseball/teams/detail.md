# Team Detail Page — Reference

**Route**: `/baseball/teams/:teamId`  
**File**: `apps/web/src/pages/baseball/TeamDetailPage.tsx`

---

## Layout (in order)

1. Back button → `navigate(-1)`
2. Banner image (conditional — full-width, 160px desktop / 100px mobile)
3. Team identity section (avatar, name, league ID, visitor note)
4. Roster / Lineup Editor section
5. Team Settings section _(GM/Commissioner only)_
6. Assistant Manager Settings component

---

## Team Identity Section

| Element      | Source           | Notes                                                            |
| ------------ | ---------------- | ---------------------------------------------------------------- |
| Avatar       | `team.avatarUrl` | 72×72px rounded; fallback: first letter of team name on gradient |
| Team name    | `team.name`      | Large bold heading                                               |
| League ID    | `leagueId`       | Small gray text                                                  |
| Visitor note | —                | Italic, only if `!isOwner && !isCommissioner`                    |

---

## Roster / Lineup Editor Section

**Heading**: "Roster"

Renders the shared `RosterBoard` component (`@legacy-sports/shared-components/roster`, LS-5360) — the same lineup-slot editor used by the mobile `Lineup` tab (`apps/app/.../baseball/team/[teamId].tsx`). Web and mobile no longer have a platform parity gap here (closes LS-6032 / BTD-009): there is no separate "Set Lineup" CTA or link out to the league `#my-team` tab because the editor is embedded inline in this section.

| Element        | Behavior                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Position slots | One row per league position (`leaguePositions`), showing the assigned player's name + eligible positions, or "Open slot"                                           |
| Bench rows     | Unassigned team members rendered as bench rows                                                                                                                     |
| Assign         | Select a bench player, then select an eligible open slot → `updateTeamMemberPositionMutation({ teamMemberId, positionId })`                                        |
| Remove         | Select an occupied slot's occupant → moves to bench via `updateTeamMemberPositionMutation({ teamMemberId, positionId: null })`                                     |
| Swap           | Select a player, then select another eligible occupied slot → `swapTeamMemberPositionsMutation({ teamMemberIdA, positionIdA, teamMemberIdB, positionIdB })`        |
| Locked slots   | Read-only with a lock icon when the underlying slot is locked (matchup started)                                                                                    |
| Edit access    | `readOnly={!isGM}` — only the team's GM (owner with `owner`/`general_manager` permission) can assign/remove/swap; commissioners and visitors see a read-only board |

---

## Team Settings Section _(GM / Commissioner only)_

### Team Branding

**Avatar subsection**:

- Label: "Avatar (team logo / icon)"
- Current URL display (if set) with Clear button
- HTTPS URL text input
- Upload button → file picker (PNG / JPEG / WebP, max 2 MB)

**Banner subsection**:

- Label: "Banner (header image)"
- Current URL display (if set) with Clear button
- HTTPS URL text input
- Upload button → file picker (PNG / JPEG / WebP, max 2 MB)

**Feedback**:

- Error message (red) — validation failures or upload errors
- Success message (green) — "Branding saved!" (auto-dismiss 3s)

**Save Branding button** — disabled if no changes; shows "Saving…" when loading

### File Upload Rules

- Accepted types: PNG, JPEG, WebP
- Max size: 2 MB
- Uploads to `VITE_IMAGE_UPLOAD_URL` with CSRF token
- Response: `{ url: string; error?: string }`
- Then calls `useUpdateTeamBrandingMutation` with returned URL

---

## Assistant Manager Settings

- List of users with `permissionLevel === 'assistant_manager'`
- Per assistant: username, userId, Remove button
- Username input + Invite button
- Empty state: "No assistant managers yet."

---

## GraphQL Queries

| Hook                            | Data                                                 |
| ------------------------------- | ---------------------------------------------------- |
| `useGetTeamMembersQuery`        | Roster (TeamMemberFragment[])                        |
| `useGetTeamByIdQuery`           | Team metadata (name, avatarUrl, bannerUrl, leagueId) |
| `useGetLeagueTeamsQuery`        | All league teams                                     |
| `useGetUserTeamIdQuery`         | Current user's team ID                               |
| `useGetLeagueByIdQuery`         | League info + `user.permissionLevel`                 |
| `useGetPositionsForLeagueQuery` | Position types (C, 1B, etc.)                         |
| `useGetTeamLeagueMembersQuery`  | Team members with leagueId context                   |

## GraphQL Mutations

| Hook                                  | Action                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `useUpdateTeamBrandingMutation`       | Update avatarUrl and/or bannerUrl — variables: `{ teamId, leagueId, avatarUrl?, bannerUrl? }`                 |
| `useUpdateTeamMemberPositionMutation` | Assign/remove a lineup slot — variables: `{ teamMemberId, positionId }` (`positionId: null` removes)          |
| `useSwapTeamMemberPositionsMutation`  | Swap two team members' lineup slots — variables: `{ teamMemberIdA, positionIdA, teamMemberIdB, positionIdB }` |
| `useInviteAssistantManagerMutation`   | Invite user by username — variables: `{ teamId, username }`                                                   |
| `useRemoveAssistantManagerMutation`   | Remove assistant — variables: `{ teamId, userId }`                                                            |

---

## Conditional Rendering

| Section                      | Condition                                                                   |
| ---------------------------- | --------------------------------------------------------------------------- |
| Roster board editable        | `isGM` (owner + `owner`/`general_manager` permission); otherwise `readOnly` |
| Team Settings                | `isOwner \|\| isCommissioner`                                               |
| Visitor note                 | `!isOwner && !isCommissioner`                                               |
| Banner image                 | `currentBannerUrl && !bannerImgError`                                       |
| Avatar image                 | `currentAvatarUrl && !avatarImgError` (else show initials)                  |
| Current URL + Clear button   | URL is already set                                                          |
| Save Branding button enabled | `avatarInput \|\| bannerInput` (at least one change)                        |
| Inputs disabled              | `brandingLoading \|\| avatarUploading \|\| bannerUploading`                 |

---

## Validation Rules

| Rule               | Detail                                    |
| ------------------ | ----------------------------------------- |
| URL format         | Must start with `https://`                |
| File type          | PNG, JPEG, or WebP only                   |
| File size          | ≤ 2 MB                                    |
| At least one field | Must provide avatar or banner URL to save |

---

## States

| State                 | Display                                             |
| --------------------- | --------------------------------------------------- |
| Loading               | `<Spinner />` centered                              |
| Invalid team ID       | "Team not found" + "link is invalid"                |
| Team not found (404)  | "Team not found" + "doesn't exist or access denied" |
| Access denied         | "Error loading team"                                |
| Branding saving       | "Saving…" button, disabled                          |
| Avatar uploading      | "Uploading…" button, disabled                       |
| Branding error        | Red error box                                       |
| Branding success      | Green "Branding saved!" (auto-dismiss 3s)           |
| No assistant managers | "No assistant managers yet." (italic gray)          |

---

## Real-Time

None. No WebSocket connection on this page.
