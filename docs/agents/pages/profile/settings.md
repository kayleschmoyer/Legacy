# Profile Settings — Reference

**Route**: `/profile/settings`  
**File**: `apps/web/src/pages/profile/ProfileSettingsPage.tsx`

---

## Layout (in order)

1. Page header — "Profile Settings"
2. Profile Card
3. App Avatar Card
4. Account & Security Card
5. Connected Accounts Card _(conditional — Discord only)_
6. Danger Zone Card

---

## Profile Card

| Element            | Source                  | Notes                             |
| ------------------ | ----------------------- | --------------------------------- |
| User avatar        | `userImage` / `picture` | Initials fallback on `imageError` |
| Username           | `dbUsername`            | Editable                          |
| Email              | `userEmail`             | Read-only                         |
| Access level badge | `accessLevel`           | admin / user / none               |
| User ID            | `user.id`               | Read-only                         |

**Username editor**: Edit button → text input + Save/Cancel  
Validation: 3–50 chars, alphanumeric + allowed special chars  
**Mutation**: `useUpdateUsernameMutation`

---

## App Avatar Card

- `AvatarPicker` component — select from preset avatars
- **Mutation**: `useUpdateUserAvatarMutation`

---

## Account & Security Card

- Sign-in method display (e.g., Google OAuth)
- Session status — green "Active" indicator

---

## Connected Accounts Card _(conditional)_

**Condition**: `auth.config.discordClientId` exists

| State         | Display                                      |
| ------------- | -------------------------------------------- |
| Not connected | Connect button → Discord OAuth flow          |
| Connected     | Discord username display + Disconnect button |

Disconnect opens confirmation modal.

---

## Danger Zone Card

- "Sign Out" button (destructive)

---

## GraphQL

| Hook                          | Purpose                                                |
| ----------------------------- | ------------------------------------------------------ |
| `useGetUserByIdQuery`         | Fetch user profile (username, avatar, discordUsername) |
| `useUpdateUserAvatarMutation` | Update custom avatar URL                               |
| `useUpdateUsernameMutation`   | Update username                                        |

---

## States

| State              | Display                                     |
| ------------------ | ------------------------------------------- |
| Avatar loading     | Loading indicator on avatar section         |
| Username loading   | "Saving…" + button disabled                 |
| Username error     | Error message below input                   |
| Discord connecting | Loading indicator on Connect button         |
| Discord error      | Error message in Connected Accounts section |
| Image load error   | Initials fallback                           |
