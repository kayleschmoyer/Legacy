# Admin Panel — Reference

**Route**: `/admin`  
**File**: `apps/web/src/pages/admin/AdminPage.tsx`  
**Guard**: Redirects to `/` if `user?.accessLevel !== 'admin'`

---

## Layout (in order)

1. Page header — "Admin Console" + "Manage users and impersonate accounts for debugging."
2. Link to `/admin/revenue` — "Revenue Analytics →"
3. Separator
4. Users section (accordion, expanded)
5. JWT Decoder section (accordion, collapsed by default)

---

## Users Section

### Search

- Text input: "Search by name, email, or ID…" (filters client-side, case-insensitive)
- Results badge: total user count

### Per User Card

| Field              | Detail                          |
| ------------------ | ------------------------------- |
| Avatar             | First char of username or email |
| Username           | `username` or "(no username)"   |
| Email              | `email` or "—"                  |
| Access level badge | e.g., "admin", "none"           |
| "You" badge        | If card is current user         |

### Impersonate Button

**Visible when**: Not current user AND not admin  
**Disabled when**: Any impersonation in progress  
**Loading state**: "Starting…" + spinner  
**Action**: `auth.impersonateUser(userId)`

---

## JWT Decoder Section

_(Collapsed by default)_

1. TextArea — "Paste JWT here…"
2. "Decode" button
3. **After decode**:
   - Expiry banner:
     - "Token expired at [date]" (red)
     - "Token valid · expires [date]" (green)
     - "Token has no expiry (exp claim absent)" (neutral)
   - Header section — formatted JSON
   - Payload section — formatted JSON
4. Error: "⚠ [error message]" (red) — if decode fails

---

## GraphQL

**Query**: `useAdminGetUsersQuery({ limit: 200, offset: 0 })`  
Skipped if not authenticated.  
Returns: `data.users[]` with username, email, id, accessLevel

---

## States

| State             | Display                                   |
| ----------------- | ----------------------------------------- |
| Auth check        | Spinner while `auth.isLoading`            |
| Not admin         | Redirect to `/`                           |
| Users loading     | Spinner in Users section                  |
| Users error       | Red text: "Failed to load users: [error]" |
| No search results | "No users found."                         |
| Impersonating     | Button disabled + "Starting…"             |
| JWT decode error  | Red "⚠ [error]" paragraph                 |
