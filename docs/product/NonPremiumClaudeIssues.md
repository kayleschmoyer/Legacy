# Non-Premium Member Behavior: Known Intentional Patterns

This document records feature behaviors that may _appear_ to grant non-premium members access to
premium functionality but are intentional product decisions. QA agents and reviewers should treat
these as resolved findings, not open bugs.

---

## FAAB Bidding in Commissioner-Created FAAB Leagues

**Finding:** BLD-020 | **Ticket:** LS-5922 | **Severity:** Medium (resolved)

### Policy

`faab_waiver_type` is a **commissioner-creation-only** entitlement. It gates whether a premium
user can configure a new league to use FAAB waivers at league-creation time.

Once a FAAB league exists, **all members — regardless of their own subscription tier — may
participate in FAAB bidding**. The `WaiverClaimModal` correctly renders the FAAB bid input for
every member of a FAAB league.

### Rationale

This follows the "commissioner pays, members participate free" model used consistently across
league-wide settings:

| Setting                  | Who needs premium       | Who can use it |
| ------------------------ | ----------------------- | -------------- |
| FAAB waiver type         | Commissioner (creation) | All members    |
| Salary cap               | Commissioner (creation) | All members    |
| Advanced playoff formats | Commissioner (creation) | All members    |
| Auction draft            | Commissioner (creation) | All members    |

Requiring each individual member to hold a premium subscription before they can participate in
league mechanics configured by their commissioner would break leagues mid-season whenever a
member's subscription lapses and would produce an inconsistent UX (some members can bid, others
cannot) within the same league.

### Entitlement label

`ENTITLEMENTS.faab_waiver_type` label reads:
`"FAAB waiver type (commissioner league-creation only; members of FAAB leagues may participate regardless of tier)"`

### Server-side note

The `submitWaiverClaim` resolver does **not** call `requireEntitlement(faab_waiver_type)` on the
claiming user. This is intentional. Adding that check would block non-premium members from
participating in leagues they were invited to join, contradicting the policy above.
