---
name: audit-checklist
description: 'Full page list and visual inspection checklist for the UI audit skill.'
---

# Pages to Visit

All require auth unless noted. Check the actual router config in `apps/web/src/` if paths are wrong — adapt as needed.

| Page               | Path (from `apps/web/src/app/app.tsx`)           |
| ------------------ | ------------------------------------------------ |
| Public Landing     | `/` (unauthenticated)                            |
| Home               | `/` (authenticated)                              |
| League Discovery   | `/baseball/leagues`                              |
| League Create      | `/baseball/league/create`                        |
| League Detail      | `/baseball/league/:id`                           |
| League Detail Tab  | `/baseball/league/:id/:tab`                      |
| Team Detail        | `/baseball/team/:teamId`                         |
| Season Draft Games | `/games/season-draft`                            |
| Season Draft Game  | `/games/season-draft/:gameId`                    |
| Mock Draft         | `/baseball/mock-draft`                           |
| Matchup Detail     | `/baseball/league/:leagueId/matchups/:matchupId` |
| Scoreboard         | `/scoreboard`                                    |
| Player Stats       | `/players/stats`                                 |
| Player Comparison  | `/players/compare`                               |
| Notifications      | `/notifications`                                 |
| Profile Settings   | `/profile/settings`                              |
| Preferences        | `/preferences`                                   |
| Subscription       | `/profile/subscription`                          |
| Pricing            | `/pricing`                                       |
| Management         | `/management`                                    |
| Admin Console      | `/admin`                                         |
| Help               | `/help`                                          |
| About              | `/about`                                         |

For pages requiring dynamic IDs, look at E2E test fixtures in `apps/web-e2e/` for valid mock data, or navigate to a listing page first and follow links.

# Viewports

Test every page at all three:

| Name    | Width | Height |
| ------- | ----- | ------ |
| Mobile  | 375   | 812    |
| Tablet  | 768   | 1024   |
| Desktop | 1280  | 720    |

# Inspection Checklist

Check each screenshot against `.impeccable.md` standards.

## Layout and Responsive

- Content overflows or is clipped at this viewport
- Horizontal scrollbar appears unexpectedly
- Elements overlap or collide
- Touch targets too small on mobile (less than 44px)
- Layout breaks or looks unfinished

## Design System Compliance

- Colors deviate from the palette:
  - Backgrounds: layered darks `#0A0F1A`, `#0D1526`, `#111B2F`, `#16223A`
  - Accents: heritage gold `#C5A55A`, seam red `#C41E3A`, deep navy `#1B3A5C`
  - Text: `#F8FAFC` primary, `#9CAAC5` secondary/muted
- Banned patterns present: border-left/right stripes, gradient text, cyan/purple/neon colors
- Typography issues: wrong font family (should be Big Shoulders Display for headings, Literata for body), poor hierarchy, misaligned tabular numbers in stats
- Spacing feels inconsistent or cramped vs. rest of app

## Functional

- Broken or missing images/icons
- Empty states with no guidance (blank page, no "nothing here yet" message)
- Interactive elements that look disabled or unclickable
- Navigation dead-ends (no way back)
- Loading states that never resolve or flash awkwardly

## Accessibility

- Text contrast too low against background
- Missing focus indicators on interactive elements
- Content not reachable via logical tab order
