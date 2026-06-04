# Feature: Get Started Card

**Jira:** LS-5309
**Page:** `about` (Epic LS-5254)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

The "Get Started" card is a call-to-action section on the About page that routes new
(unauthenticated) users to the homepage (`/`) where they can sign up for Legacy Sports.

For unauthenticated users, the card displays:

- Copy: "Ready to manage your fantasy sports league? Join Legacy Sports for free."
- CTA button: "Get Started Free" → navigates to `/`

## Source

Extracted from: `docs/agents/pages/about.md`

## Implementation

**Component:** `apps/web/src/pages/about/AboutPage.tsx`

The card conditionally renders based on authentication state:

| State                       | Content                                                                        |
| --------------------------- | ------------------------------------------------------------------------------ |
| Unauthenticated (new users) | Marketing copy + "Get Started Free" button → `/`                               |
| Authenticated (free)        | Welcome copy + "Go to Dashboard" → `/home` + "Upgrade to Premium" → `/pricing` |
| Authenticated (premium)     | Welcome copy + "Go to Dashboard" → `/home`                                     |

## Test Coverage

Tests: `apps/web/src/pages/about/AboutPage.spec.tsx`

- `describe('AboutPage — Get Started card (LS-5309)')`:
  - Renders the "Get Started" card heading
  - Renders the marketing copy for new users
  - Renders the "Get Started Free" CTA button for unauthenticated users
  - Routes to "/" when "Get Started Free" is clicked
