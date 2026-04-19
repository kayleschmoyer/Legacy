# Admin Revenue Analytics — Reference

**Route**: `/admin/revenue`  
**File**: `apps/web/src/pages/admin/AdminRevenuePage.tsx`  
**Guard**: `<Navigate to="/" replace />` if `user?.accessLevel !== 'admin'`

---

## Layout (in order)

1. Page header — "Revenue Analytics" + subtitle
2. Separator
3. KPI row (5 metric cards)
4. Subscription Status Breakdown card (legend + bar chart)
5. Subscriber Growth card (area chart)
6. Revenue by Platform card (informational)
7. Premium Feature Analytics card (GA4 note)

---

## KPI Cards (5)

| Card              | Value                     | Sub-label                   |
| ----------------- | ------------------------- | --------------------------- |
| Total Subscribers | `totalSubscribers`        | "Active + trialing"         |
| Premium Users     | `totalPremiumUsers`       | "{totalFreeUsers} free"     |
| Conversion Rate   | `conversionRate` (%)      | "Free → Premium"            |
| New This Month    | `newSubscribersThisMonth` | "New premium subscriptions" |
| Total Users       | `totalUsers`              | "Registered accounts"       |

---

## Subscription Status Breakdown

- Color-coded status legend chips (status name + count)
- Bar chart — X: status labels · Y: count
- **Condition**: Only renders if `statusBreakdown.length > 0`

**statusBreakdown fields**: `{ status, count }`

---

## Subscriber Growth

- Area chart — X: months · Y: new subscribers
- Tooltip shows formatted value
- **Condition**: Only renders if `subscriberGrowth.length > 0`
- **Empty**: "No subscription data for the last 12 months."

**subscriberGrowth fields**: `{ month, newSubscribers }`

---

## Revenue by Platform

Three informational cards:

- Web (Stripe)
- iOS IAP — Coming soon
- Android Play — Coming soon

---

## Premium Feature Analytics

- Note about GA4 tracking for `premium_feature_click` events
- "View in GA4 Dashboard" link — opens `https://analytics.google.com` in new tab

---

## GraphQL

**Query**: `useAdminRevenueStatsQuery()`  
Skipped if not authenticated.

Returns `data.adminRevenueStats`:

- `totalSubscribers`, `totalPremiumUsers`, `totalFreeUsers`
- `conversionRate`, `newSubscribersThisMonth`, `totalUsers`
- `statusBreakdown[]` — `{ status, count }`
- `subscriberGrowth[]` — `{ month, newSubscribers }`

Charts: Recharts (`BarChart`, `AreaChart`)

---

## States

| State                | Display                                        |
| -------------------- | ---------------------------------------------- |
| Loading              | Full-page centered spinner                     |
| Error                | Red card — "Failed to load revenue data."      |
| Empty growth data    | "No subscription data for the last 12 months." |
| Empty breakdown data | Bar chart hidden                               |
