# Preferences — Reference

**Route**: `/preferences`  
**File**: `apps/web/src/pages/preferences/PreferencesPage.tsx`

---

## Layout (in order)

1. Page header — "Preferences"
2. Auto-save confirmation banner _(fixed position, 2s auto-dismiss)_
3. Appearance section _(collapsible)_
4. Sports & Stats section _(collapsible)_
5. Notifications section _(collapsible, authenticated users only)_

Section collapse states persist to localStorage.

---

## Appearance Section

| Setting            | Options               | Storage      |
| ------------------ | --------------------- | ------------ |
| `theme`            | System / Light / Dark | localStorage |
| `enableAnimations` | toggle ON/OFF         | localStorage |

---

## Sports & Stats Section

| Setting            | Options             | Storage                                          |
| ------------------ | ------------------- | ------------------------------------------------ |
| `defaultSport`     | Baseball / Football | localStorage                                     |
| `statsFormat`      | Standard / Expanded | localStorage (`ls_user_preferences.statsFormat`) |
| `showSeasonTotals` | toggle ON/OFF       | localStorage                                     |

---

## Notifications Section _(authenticated only)_

### Delivery Channels

| Setting             | Options |
| ------------------- | ------- |
| Push notifications  | toggle  |
| Email notifications | toggle  |

### Matchup Alerts

| Setting           | Options |
| ----------------- | ------- |
| Matchup started   | toggle  |
| Matchup ended     | toggle  |
| Close game alerts | toggle  |
| Matchup reminders | toggle  |

**`closeGameThreshold`**: number (e.g., 50) — threshold for "close game" alerts

---

## Auto-Save Behavior

All preference changes auto-save immediately. Banner appears for 2 seconds confirming save.

---

## GraphQL

| Hook                                       | Purpose                         |
| ------------------------------------------ | ------------------------------- |
| `useGetUserNotificationPreferencesQuery`   | Fetch notification preferences  |
| `useUpdateNotificationPreferencesMutation` | Update notification preferences |

All UI preferences (theme, sport, stats format, animations) are localStorage-only (no GraphQL).

---

## States

| State                 | Display                                |
| --------------------- | -------------------------------------- |
| Notifications loading | Spinner in Notifications section       |
| Notifications error   | Error message in Notifications section |
| Preference saved      | Fixed auto-save banner (2s)            |
| Section collapsed     | Chevron points down; content hidden    |
| Section expanded      | Chevron points up; content visible     |
