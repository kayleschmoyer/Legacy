# Storybook Plan — Legacy Sports

A manifest of every Design System preview card in `preview/`, what it shows, and how it maps to the live product. Cards are split into **Foundations** (tokens) and **Components**. The Components tier is split into **Tier 1 — Primitives** (atoms, used everywhere) and **Tier 2 — Composite** (recognizable product surfaces built from primitives).

All cards use shared tokens from `colors_and_type.css` and the dark "night stadium" theme. Heading copy follows the README voice rules; numbers are tabular; no emoji.

---

## Foundations

| Card            | Path                                       | Shows                                                                        |
| --------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| Typography      | `preview/components-typography.html`       | Big Shoulders Display / Literata / JetBrains Mono — full type ramp + recipes |
| Colors & Tokens | (in-line tokens via `colors_and_type.css`) | Brand navy, seam red, aged gold, neutrals, position colors, status           |

> Foundations are documented in `README.md` §3 ("Visual Foundations") and exposed live as CSS custom properties in `colors_and_type.css`. Type & color cards already exist in `preview/`.

---

## Tier 1 — Primitives

The atoms. One responsibility each. Every Tier 2 surface composes these.

| Card                        | Path                                                                 | States shown                                                                                    | Used in                                   |
| --------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Button**                  | `preview/components-buttons.html`                                    | Primary / secondary / ghost / danger / icon-only · default / hover / press / disabled / loading | Everywhere                                |
| **IconButton**              | `preview/components-icon-button.html`                                | Sizes (sm/md/lg) · default / hover / press / active                                             | Nav, toolbars, card actions               |
| **Input**                   | `preview/components-input.html`                                      | Default · focus · error · disabled · with leading icon · textarea                               | Forms, league setup, profile              |
| **Select / Dropdown**       | `preview/components-select.html`                                     | Closed · open menu · multi-chip · disabled                                                      | Filters, era picker, league config        |
| **Toggle controls**         | `preview/components-toggle.html`                                     | Switch (on/off/disabled) · Checkbox (on/off/indeterminate) · Radio · Segmented                  | Settings, filter sheets, scoring rules    |
| **Chip**                    | `preview/components-chips.html`                                      | Position chips (P/C/IF/OF/U) · status chips · filter chips                                      | Player rows, filter bars, status          |
| **StatusBadge**             | `preview/components-status-badge.html`                               | DRAFT LIVE · PRE-DRAFT · ACTIVE · COMING SOON · LIVE                                            | League cards, sport picker, matchup cards |
| **Avatar**                  | `preview/components-avatar.html`                                     | Sizes · initials · gradient · with frame · stack                                                | Team rosters, headers, notifications      |
| **Spinner / Loading**       | `preview/components-spinner.html`                                    | Spinner · skeleton · button-loading · full-page loader                                          | Async loads                               |
| **Separator / Stack**       | `preview/components-separator.html`, `preview/components-stack.html` | Dividers, XStack/YStack spacing rules                                                           | Layout primitives                         |
| **Card / PanelCard**        | `preview/components-card.html`                                       | Default · hover · gold premium · header/body/footer                                             | Containers everywhere                     |
| **EmptyState / ErrorState** | `preview/components-empty-state.html`                                | Default empty · search empty · error w/ retry · compact                                         | Lists, dashboards                         |
| **Dialog**                  | `preview/components-dialog.html`                                     | Modal w/ scrim, title, body, action row (destructive variant)                                   | Confirms, league delete, trade confirm    |
| **Sheet**                   | `preview/components-sheet.html`                                      | Bottom sheet — filter picker (mobile)                                                           | Mobile filters, mobile actions            |
| **Popover**                 | `preview/components-popover.html`                                    | Anchored popover w/ DatePicker calendar                                                         | Date pickers, menus, info popovers        |
| **Tabs**                    | `preview/components-tabs.html`                                       | Underline tabs w/ counts · pill segmented sub-nav                                               | League sub-nav, era sub-nav               |

---

## Tier 2 — Composite (product surfaces)

Recognizable Legacy Sports surfaces. Each composes 3–6 primitives.

| Card                            | Path                                           | Composes                                                                 | Maps to                                |
| ------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| **NavBar**                      | `preview/components-nav.html`                  | Logo, link group, IconButton, Avatar, NotificationBell                   | Sticky top nav (`web/src/app/app.tsx`) |
| **SearchBar**                   | `preview/components-search-bar.html`           | Input, IconButton, filter Chip, result row                               | League search, player search           |
| **NotificationBell + list**     | `preview/components-notification.html`         | IconButton, badge, list rows                                             | Header bell + dropdown                 |
| **DateTimePicker**              | `preview/components-date-time-picker.html`     | Input field, Popover (calendar), segmented AM/PM                         | Draft date, deadlines                  |
| **AvatarPicker / BannerPicker** | `preview/components-avatar-banner-picker.html` | Avatar grid + upload tile                                                | Team setup, profile                    |
| **Form**                        | `preview/components-form.html`                 | Input + Select + Toggle + Button stacked                                 | League create, settings                |
| **LeagueCard**                  | `preview/components-league-card.html`          | Card + StatusBadge + Avatar stack + meta footer                          | Dashboard "My Leagues" grid            |
| **MatchupCard**                 | `preview/components-matchup-card.html`         | Card, StatusBadge (LIVE/FINAL/PRE), score, win-prob bar                  | Scoreboard week view                   |
| **StandingsTable**              | `preview/components-standings.html`            | Table + rank gold leader + streak chips + tabular nums                   | League → Standings tab                 |
| **StatsTable**                  | `preview/components-table.html`                | Table + sortable column + Avatar + tabular nums                          | Player stats, draft board              |
| **PlayerCard**                  | `preview/components-player-card.html`          | Card + position color edge + stats grid                                  | Roster, draft pool                     |
| **HolographicCard**             | `preview/components-holographic-card.html`     | Decorative collectible variant of PlayerCard (Default / Legend / Rookie) | Achievements, draft reveal             |

---

## Conventions

- **Frame:** every card uses `body` padded 24–32px with `--bg` page background and `colors_and_type.css` imported. Multi-state cards lay states in a 2-up grid with eyebrow labels above each.
- **Eyebrows:** Big Shoulders Display 700, 11px, `letter-spacing: .12em`, uppercase, color `--fg3`.
- **Numbers:** JetBrains Mono with `font-variant-numeric: tabular-nums`.
- **Hover states:** demonstrated by a second tile labeled "hover" — never via JS in the preview cards.
- **Copy:** historical baseball flavor (Dead Ball Dynasty, Cooperstown Society, Brooklyn Bridegrooms, 1923 Babe Ruth lines, Negro Leagues Stars) — matches the product hook of "draft legends across every era."

---

## Coverage gaps (intentionally deferred)

- **Toast / Snackbar** — used in product but minor; can be added if needed
- **Bracket** — playoff bracket layout, not yet a primary surface
- **Video player** — referenced in README breakpoints but not in design surfaces
- **Football skin** — green/amber palette exists, but baseball ships first

These can be added as Tier 2 cards when those product surfaces ship.
