# Pricing Page — Reference

**Route**: `/pricing`  
**File**: `apps/web/src/pages/pricing/PricingPage.tsx`

---

## Layout (in order)

1. Hero section — badge, title, subtitle, billing toggle
2. Plan cards — Free + Premium side-by-side
3. Feature comparison table
4. Testimonials (3 cards)
5. FAQ accordion (5 items)
6. Bottom CTA section

---

## Hero Section

- Badge: "Simple, transparent pricing" (Zap icon)
- Title: "The plan that fits your [game]" ("game" in gold)
- Subtitle: "Start free and play as long as you want. Upgrade to Premium when you're ready for the full experience."

### Billing Toggle

| Option  | Notes                                          |
| ------- | ---------------------------------------------- |
| Monthly | Shows monthly price                            |
| Annual  | Shows per-month equivalent + "Save {X%}" badge |

---

## Plan Cards

### Free Plan Card

| Field       | Value                                  |
| ----------- | -------------------------------------- |
| Label       | "FREE"                                 |
| Price       | "$0"                                   |
| Description | "Forever free. No credit card needed." |
| Features    | 6 items listed                         |

**Button**: "Get Started Free" → `/`

### Premium Plan Card

| Field                  | Value                                                             |
| ---------------------- | ----------------------------------------------------------------- |
| Label                  | "PREMIUM"                                                         |
| Badge                  | "Most Popular" (star icon)                                        |
| Price                  | `monthlyPrice` (monthly) or `annualTotal / 12` (annual) per month |
| Billing text (annual)  | "Billed annually (${annualTotal}/yr) — save {X%} vs monthly"      |
| Billing text (monthly) | "Billed monthly. Switch to annual and save {X%}."                 |
| Features               | 11 items listed                                                   |

**Button**: "Upgrade to Premium" → `/profile/subscription`

---

## Feature Comparison Table (10 rows)

Columns: Feature Name · Free · Premium

Key features: Leagues, Stats access, Waiver system, and more. Boolean or text values per cell.

---

## Testimonials (3 cards)

Per card: 5-star rating · quote text · author name · meta (role/user type)

---

## FAQ Accordion (5 items)

Topics: trial period · downgrade behavior · annual billing · payment methods · multi-league access

"Visit our Help Center" link → `/help`

---

## Bottom CTA

- Heading: "Ready to level up your league?"
- Description: "Join thousands of commissioners who trust Legacy Sports…"
- "Upgrade to Premium" → `/profile/subscription`
- "Get Started Free" → `/`

---

## GraphQL / Hooks

**Hook**: `useStripePrices()`  
Returns: `{ monthlyPrice, annualTotal, annualSavingsPct }`  
Derived: `annualMonthlyPrice = annualTotal / 12`

No mutations on this page.

---

## Conditional Rendering

| Element                | Condition                  |
| ---------------------- | -------------------------- |
| Monthly price display  | `isAnnual === false`       |
| Annual per-month price | `isAnnual === true`        |
| Annual billing text    | `isAnnual === true`        |
| FAQ answer             | `openFaq === i`            |
| Chevron direction      | Up if open, Down if closed |

---

## Notes

- No loading/error states explicitly shown
- Fallback prices handled internally by `useStripePrices()` hook
