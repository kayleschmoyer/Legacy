# League Detail — My Team Tab

**Parent page**: [League Detail](../index.md)  
**Tab key**: `team-settings`  
**Visibility**: Members only

---

## Non-Member Empty State

Condition: `!userTeamId && !loading`

- Card: "You're not a member" / "Join this league to manage your team…"

---

## Team Name Editor

- Current team name display
- "Edit" button → opens edit mode
- Edit mode: text input + Save button + Cancel button
- Success: checkmark confirmation
- Error: error message below input

**Mutation**: `useRenameTeamMutation`

---

## Team Branding Card

### Logo Section

- Current logo preview (if set)
- `AvatarPicker` component — select from presets or upload
- Upload/select functionality
- Success / error messages

### Colors Section

- Primary Color: hex color picker + text input (`#RRGGBB` format)
- Secondary Color: hex color picker + text input
- Hex validation — Save button disabled if invalid
- Save button → success/error messages

**Mutation**: `useUpdateTeamBrandingMutation`

---

## GraphQL

| Hook                  | Data                              |
| --------------------- | --------------------------------- |
| `useGetTeamByIdQuery` | Current team name, avatar, colors |

| Mutation                        | Action              |
| ------------------------------- | ------------------- |
| `useRenameTeamMutation`         | Update team name    |
| `useUpdateTeamBrandingMutation` | Update logo, colors |
