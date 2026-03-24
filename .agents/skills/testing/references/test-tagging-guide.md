# Test Tagging Decision Guide

> Extracted from e2e-testing SKILL.md — load when deciding which tag to apply to a new or existing test.

Apply **one primary tag** to the `test.describe` block. Individual tests inherit the suite tag. Tests that genuinely belong to a different tier get their own inline tag appended to the test name (e.g., `'shows drag handles @regression'`).

## `@critical` — Failure means the app is effectively down

A flow is **critical** if a failure blocks users from completing the core game loop: authenticate → create/join a league → draft → play matchups → trade/waiver → manage subscription. Ask: _"If this breaks at 11 PM on a Friday, would we roll back immediately?"_ If yes → `@critical`.

Examples:

- User can log in / is redirected when unauthenticated
- User can create or join a league
- User can discover leagues and submit a join request
- Draft board renders and draft status updates work
- Commissioner can advance matchups, select games, process waivers
- User can send/receive/cancel trades
- Subscription paywall gates content correctly and upgrade flow works
- WebSocket real-time updates arrive without page reload
- Mobile navigation panel opens and links work

Counter-examples (these are **not** `@critical`):

- Player stats page loads (display-only, game still plays)
- Standings table renders (informational, not blocking)
- Playoff bracket shows round names (visual, results still process)
- Commissioner league settings form (games play with existing settings)
- Team detail page shows roster (read-only view)

Rule of thumb: if the feature breaking means **users cannot play their leagues or pay**, it is `@critical`. If it means **users cannot see some data** but the game loop still works, it is `@regression`.

## `@smoke` — Basic page/navigation sanity check

A smoke test answers: _"Does the page load and show its main heading?"_ It is not testing a user flow — just that the route renders at all. These are fast (< 2 s) and exist to catch routing and build regressions.

Examples:

- About page shows its H1
- Help page sections are visible
- Home page heading is present
- Navigation links are visible
- Profile settings page loads

Rule of thumb: if the test only calls `page.goto()` + `expect(...).toBeVisible()` on a top-level heading or nav element, it is `@smoke`.

**Do not** tag a test `@smoke` if it requires GraphQL mocking, authentication state beyond a basic JWT, or more than one interaction.

## `@regression` — Display features, edge cases, or error states

Regression tests cover features where a failure is annoying but doesn't break the core game loop. This includes **display/browsing pages** (stats, standings, player profiles, team detail, pricing, playoff brackets), **edge cases** (error states, empty states, locked UI), **accessibility checks**, and **admin-only tools**.

Examples:

- Player stats page structure and tab switching
- Standings table data rendering
- Playoff bracket completed/in-progress display
- Team detail page identity and roster
- Roster management layout and player data
- Commissioner league settings form
- Admin console access control and user management
- Error toast displays and can be dismissed
- Form shows validation errors on invalid input
- Accessibility: headings have correct hierarchy
- Cross-browser rendering differences

Rule of thumb: if the test was written _after_ a bug was found in production, tag it `@regression`. Also use `@regression` for anything that is too slow or too niche to run on every PR.

## `@visual` — DEPRECATED

Visual snapshot tests have been removed from the E2E suite (LS-1777). E2E tests should assert **behavior, not pixels** — element visibility, text content, navigation, interactions. Visual regression testing belongs in **component isolation** (Storybook/Chromatic), not in E2E.

Do not create new `@visual` tests. If you need to verify layout, write behavioral assertions (e.g., `toBeVisible()`, `toHaveCSS()`, `toHaveAttribute()`) instead of `toHaveScreenshot()`.

## `@slow` — Any test > 10 seconds

`@slow` can be combined with another tag (e.g., `@critical @slow`). The CI default run excludes `@slow` tests via `--grep-invert @slow`. Long-running integration flows (e.g., full season simulation) should carry this tag.

## Common Mistakes

| Mistake                                                    | Correct approach                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| Tagging a heading-visibility check `@critical`             | Use `@smoke` instead                                           |
| Tagging a display/browsing page `@critical`                | Use `@regression` — game loop still works without it           |
| Tagging a broken-state / edge case `@critical`             | Use `@regression`                                              |
| Tagging admin-only tools `@critical`                       | Use `@regression` — internal ops, not user-facing gameplay     |
| Tagging a full season simulation without `@slow`           | Add `@slow` alongside the primary tag                          |
| Putting `@critical` on a test that takes 15+ seconds       | Add `@slow` so it is excluded by default                       |
| Tagging an entire file `@smoke` when some tests test flows | Split into multiple `test.describe` blocks with different tags |
