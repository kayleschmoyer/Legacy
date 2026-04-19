# Notifications — Reference

**Route**: `/notifications`  
**File**: `apps/web/src/pages/notifications/NotificationsPage.tsx`

---

## Layout (in order)

1. Page header — "Notifications" + unread count message + "Mark all as read" button
2. Loading spinner _(conditional)_
3. Empty state _(conditional)_
4. Notification list (paginated)
5. Pagination controls

---

## Header

| Element                   | Condition           | Detail                                        |
| ------------------------- | ------------------- | --------------------------------------------- |
| Unread count message      | `unreadCount > 0`   | "You have {n} unread notifications"           |
| All read message          | `unreadCount === 0` | "You are all caught up"                       |
| "Mark all as read" button | `unreadCount > 0`   | Calls `useMarkAllNotificationsAsReadMutation` |

---

## Notification Card Fields

| Field               | Source                                                              |
| ------------------- | ------------------------------------------------------------------- |
| Unread dot          | Blue if `!notification.read`, transparent if read                   |
| Title               | `notification.title` — bold if unread                               |
| Time ago            | `notification.sentAt` via `formatTimeAgo()` — e.g., "5 minutes ago" |
| Message             | `notification.message`                                              |
| Mark as read button | Eye icon — only visible if `!notification.read`                     |

**Notification types** (`notificationType`): matchupStarted, matchupEnded, etc.

Click card or eye icon → `useMarkNotificationAsReadMutation`

---

## Pagination

- **Page size**: 20 per page
- **Previous button**: disabled on page 0
- **Page counter**: "Page {n}"
- **Next button**: disabled when fewer than 20 items returned

---

## GraphQL

| Hook                                    | Purpose                                                           |
| --------------------------------------- | ----------------------------------------------------------------- |
| `useGetNotificationHistoryQuery`        | Paginated history — variables: `{ limit: 20, offset: page * 20 }` |
| `useGetUnreadNotificationCountQuery`    | Unread count for header                                           |
| `useMarkNotificationAsReadMutation`     | Mark single notification read                                     |
| `useMarkAllNotificationsAsReadMutation` | Mark all notifications read                                       |

---

## States

| State   | Condition                                  | Display                                             |
| ------- | ------------------------------------------ | --------------------------------------------------- |
| Loading | `loading && no cached data`                | Large centered spinner                              |
| Empty   | `notifications.length === 0 && page === 0` | Bell icon + "No notifications yet" + description    |
| Read    | `notification.read === true`               | Normal weight title, transparent dot, no eye button |
| Unread  | `notification.read === false`              | Bold title, blue dot, eye button visible            |
