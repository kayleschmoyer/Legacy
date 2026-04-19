# Subscription Management — Reference

**Route**: `/profile/subscription`  
**File**: `apps/web/src/pages/profile/SubscriptionPage.tsx`

---

## Layout (in order)

1. Page header — "Subscription"
2. Past Due Warning Banner _(conditional)_
3. Current Plan Card
4. Upgrade to Premium Card _(conditional — free/canceled plans only)_

---

## Past Due Warning Banner

**Condition**: `isPastDue === true`

- Alert icon + warning message
- "Fix Payment" button → Stripe billing portal

---

## Current Plan Card

| Element             | Source                                             |
| ------------------- | -------------------------------------------------- |
| Plan name           | "Premium" or "Free"                                |
| Status badge        | active / trialing / past_due / canceled            |
| Next renewal date   | `subscription.currentPeriodEnd` (formatted)        |
| Cancellation notice | Shown if `subscription.cancelAtPeriodEnd === true` |

**Buttons**:

- "Manage Subscription" → `useCreateBillingPortalSessionMutation` (premium users)
- "Cancel Subscription" → opens confirmation dialog

---

## Upgrade to Premium Card

**Condition**: `isFree || isCanceled`

### Billing Cycle Toggle

| Option  | Notes                                   |
| ------- | --------------------------------------- |
| Monthly | Shows monthly price                     |
| Annual  | Shows annual/12 price + "Save X%" badge |

**Annual billing info**: "Billed annually (${annualTotal}/yr) — save X% vs monthly"  
**Monthly billing info**: "Billed monthly. Switch to annual and save X%."

### Feature Comparison Table (8 rows)

Columns: Feature · Free · Premium

Key features compared: Leagues, Stats access, Waiver system, and more.

### CTA

- "Upgrade to Premium" button → `useCreateCheckoutSessionMutation`
- "Secure payment via Stripe…" security note

---

## Cancel Subscription Dialog

- "Keep Premium" button
- "Yes, Cancel" (confirm cancel) button

---

## GraphQL

| Hook                                    | Purpose                                                        |
| --------------------------------------- | -------------------------------------------------------------- |
| `useGetMySubscriptionQuery`             | Fetch subscription status, tier, period end, cancelAtPeriodEnd |
| `useCreateCheckoutSessionMutation`      | Create Stripe checkout session (redirects to Stripe)           |
| `useCreateBillingPortalSessionMutation` | Open Stripe billing portal                                     |

---

## Pricing Data

Sourced from `useStripePrices()` hook:

- `monthlyPrice` — displayed when monthly toggle active
- `annualTotal` — total annual price
- `annualSavingsPct` — e.g., "20%"
- `annualMonthlyPrice` = `annualTotal / 12` (displayed per-month equivalent)

---

## URL Params

- `?checkout=success` — triggers success confirmation display after Stripe redirect

---

## States

| State            | Display                                                      |
| ---------------- | ------------------------------------------------------------ |
| Loading          | Spinner in Current Plan card                                 |
| Free plan        | Upgrade card shown                                           |
| Premium (active) | Only Current Plan card shown                                 |
| Past due         | Warning banner + Fix Payment button                          |
| Canceled         | Upgrade card shown; cancelAtPeriodEnd notice in Current Plan |
| Checkout loading | Button spinner                                               |
| Portal loading   | Button spinner                                               |
