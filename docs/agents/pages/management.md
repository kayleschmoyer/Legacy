# Management Page — Reference

**Route**: `/management`  
**Files**: `apps/web/src/pages/management/ManagementPage.tsx` · `apps/web/src/features/management/LeagueManagement.tsx`

---

## Layout (in order)

1. Page header — "League Management" + subtitle "Manage your leagues and data"
2. Danger Zone card (red themed)
3. Information card (navy themed)

---

## Danger Zone Card

**Action**: "Delete All Leagues" button (red)

Warning text varies by access level:

- **Admin**: "All leagues you are a member of will be deleted (leagues you own and leagues you have joined)"
- **Non-admin**: "Only leagues you own will be deleted"

**Information card bullet points**:

- All teams in those leagues
- All roster data
- All league positions
- All league members
- You can create new leagues after deletion

---

## Delete Flow (two confirmation dialogs)

**Dialog 1**:  
"Are you sure?" · Cancel · Continue

**Dialog 2** (final confirmation, auto-focused on destructive button):  
"This cannot be undone." · Cancel · "Yes, Delete Everything"

---

## GraphQL

**Mutation**: `useDeleteAllLeaguesMutation()`

- Triggers refetch of `GetUserLeagues`
- `awaitRefetchQueries: true`

---

## Conditional Rendering

| Element                | Condition                       |
| ---------------------- | ------------------------------- |
| Admin warning text     | `user?.accessLevel === 'admin'` |
| Non-admin warning text | `user?.accessLevel !== 'admin'` |
| Error card             | Mutation error                  |
| Button disabled        | `isDeleting \|\| loading`       |

---

## Accessibility

- `aria-live="polite"` div tracks `liveMsg` state for screen reader announcements
- Final dialog button is auto-focused

---

## States

| State    | Display                                |
| -------- | -------------------------------------- |
| Deleting | Spinner in button, button disabled     |
| Error    | Red error card with message            |
| Success  | Alert dialog closes, leagues refetched |
