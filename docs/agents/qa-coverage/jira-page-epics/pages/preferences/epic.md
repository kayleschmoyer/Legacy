# QA — Page: Preferences

**Jira:** LS-5290
**Page slug:** `preferences`
**Routes:** web `/preferences` (`apps/web/src/pages/preferences/PreferencesPage.tsx`), native `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/preferences.tsx` (You tab → `you-preferences`)
**Reference:** `docs/agents/pages/preferences.md`

The Preferences page is where a user manages account-wide settings: appearance (theme, animations), sports & stats display (default sport, stats format, season totals), and notifications (delivery channels, matchup alerts). Coverage here is **automated E2E only** (hermetic Playwright for web, Maestro for android) — see [`../../README.md`](../../README.md) and `.agents/skills/plan-ticket/references/qa-coverage-model.md`.

## Feature stories

| Jira    | Feature                               | Folder                                      |
| ------- | ------------------------------------- | ------------------------------------------- |
| LS-5608 | Appearance — Enable Animations Toggle | `features/appearance-animations/`           |
| LS-5609 | Appearance — Theme Selector           | `features/appearance-theme/`                |
| LS-5610 | Auto-Save Confirmation Banner         | `features/auto-save-banner/`                |
| LS-5611 | Matchup Alerts Preferences            | `features/matchup-alerts/`                  |
| LS-5612 | Notifications — Delivery Channels     | `features/notifications-delivery-channels/` |
| LS-5613 | Notifications Load & Error States     | `features/notifications-load-error-states/` |
| LS-5614 | Collapsible Section State Persistence | `features/section-collapse-persistence/`    |
| LS-5615 | Sports — Default Sport                | `features/sports-default-sport/`            |
| LS-5616 | Sports — Show Season Totals Toggle    | `features/sports-show-season-totals/`       |
| LS-5617 | Sports — Stats Format                 | `features/sports-stats-format/`             |

`LS-7609` ("Feature Discovery Gaps Bucket (preferences)") is also labelled `qa-feature-story` but is a findings bucket (GAP-001..004), not a feature, and is out of scope for coverage tables.

## Audit summary (LS-10615)

Existing E2E that touches the page: `preferences.spec.ts` (heading, section/option **visibility**, theme + default-sport auto-save, reset, signed-out gate), `user-preferences.spec.ts` (static elements, theme chip, animations toggle flip), `dark-mode.spec.ts` (full theme journey), `player-stats-format-preference.spec.ts` (stats-format **consumer** on `/players`). Nothing in web E2E interacts with the **Notifications** section when signed in (the shared mock returns `getUserNotificationPreferences: null`), with section collapse, with Stats Format / Season Totals controls, or asserts the banner disappearing. **No android flow exists for the Preferences screen** (`maestro/flows/notifications/notifications.yaml` covers the notifications list only).

| Feature story                                 | Web     | Android                     | Target spec / flow                                                                                                                                                          | Pending assertions    |
| --------------------------------------------- | ------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| LS-5608 Enable Animations Toggle              | pending | pending                     | `apps/web-e2e/src/tests/user-preferences.spec.ts` · `maestro/flows/preferences/preferences-appearance.yaml`                                                                 | 4 web + 3 android = 7 |
| LS-5609 Theme Selector                        | covered | pending                     | `apps/web-e2e/src/tests/dark-mode.spec.ts` · `maestro/flows/preferences/preferences-appearance.yaml`                                                                        | 0 web + 3 android = 3 |
| LS-5610 Auto-Save Confirmation Banner         | pending | pending                     | `apps/web-e2e/src/tests/preferences.spec.ts` · `maestro/flows/preferences/preferences-autosave-banner.yaml`                                                                 | 3 web + 2 android = 5 |
| LS-5611 Matchup Alerts Preferences            | pending | pending                     | `apps/web-e2e/src/tests/preferences-notifications.spec.ts` · `maestro/flows/preferences/preferences-notifications.yaml`                                                     | 5 web + 3 android = 8 |
| LS-5612 Notifications — Delivery Channels     | pending | pending                     | `apps/web-e2e/src/tests/preferences-notifications.spec.ts` · `maestro/flows/preferences/preferences-notifications.yaml`                                                     | 4 web + 2 android = 6 |
| LS-5613 Notifications Load & Error States     | pending | pending                     | `apps/web-e2e/src/tests/preferences-notifications.spec.ts` · `maestro/flows/preferences/preferences-notifications.yaml`                                                     | 3 web + 1 android = 4 |
| LS-5614 Collapsible Section State Persistence | pending | n/a (web-only, see LS-7664) | `apps/web-e2e/src/tests/preferences-section-collapse.spec.ts`                                                                                                               | 4 web                 |
| LS-5615 Default Sport                         | pending | pending                     | `apps/web-e2e/src/tests/preferences-sports-stats.spec.ts` · `maestro/flows/preferences/preferences-sports-stats.yaml`                                                       | 3 web + 3 android = 6 |
| LS-5616 Show Season Totals Toggle             | pending | pending                     | `apps/web-e2e/src/tests/preferences-sports-stats.spec.ts` · `maestro/flows/preferences/preferences-sports-stats.yaml`                                                       | 3 web + 2 android = 5 |
| LS-5617 Stats Format                          | pending | pending                     | `apps/web-e2e/src/tests/preferences-sports-stats.spec.ts` (+ existing `player-stats-format-preference.spec.ts`) · `maestro/flows/preferences/preferences-sports-stats.yaml` | 4 web + 3 android = 7 |

`mobile-web` (declared on every story) is exercised by the same Playwright specs through the `Mobile Chrome` / `Mobile Safari` projects in `apps/web-e2e/playwright.config.ts`; it has no separate row.

## Conventions for the per-feature chips

- **Web specs are hermetic.** Override `getusernotificationpreferences` / `updatenotificationpreferences` / `getuserpreferences` / `updateuserpreferences` with `route.fulfill()` (defaults live in `apps/web-e2e/src/fixtures/shared-mocks.ts`; operation names come from `lib/graphql/src/notifications.graphql` and `user-preferences.graphql`). Never `route.continue()`.
- **Element access goes through `settingsPage.preferences`** (`apps/web-e2e/src/pages/settings.page.ts`, ADR-0015). Add locators/assertions there, not in the specs.
- **Storage keys:** `ls_user_preferences` (blob: `defaultSport`, `statsFormat`, `enableAnimations`, `showSeasonTotals`), `ls_theme_preference` (theme, owned by `ThemeContext`), `ls_prefs_sections_collapsed` (web only).
- **Android flows are live** (Maestro against the dev build). Reach the screen via `launch-authenticated.yaml` → tap `You` → `you-preferences`. The native screen currently has **no page-level `testID`** and the chips/toggles have none; per the LS-8446 landing convention the first android chip should add `testID="preferences-page"` plus chip/toggle testIDs in `apps/app/src/app/(app)/(tabs)/(home,leagues,players,games,you)/preferences.tsx` (the only product edit the android chips may make, and only testIDs). Note native copy differs from web: `Enable animations` (web: `Animations`) and `Preferences saved` (web: `Saved`, `data-testid="prefs-save-banner"`).
- **Notifications on android live on the Notifications screen**, not on the Preferences screen: You → `you-notifications` (`notifications-page`) → "Notification Preferences" panel (`NotificationSettings`, shared-components). The native Preferences screen has Appearance, Sports & Stats, and an admin-only Admin Tools section.

## Known defects (existing tickets — do not re-file)

PRF-001..PRF-033 = LS-7072..LS-7104 (per-feature cross-references are in each `feature.md`). Open ones that constrain what an E2E may assert: LS-7101 (`showSeasonTotals` never read downstream), LS-7102 (`statsFormat: expanded` — note `player-stats-format-preference.spec.ts` shows the web player-stats table does consume it; the ticket's description may be stale and is worth re-triaging by its owner), LS-7087 (matchup alert defaults, In Progress), LS-7091 (server-side channel suppression, In Review), LS-7096 (collapse state device-local, In Review). Feature-discovery gaps: LS-7661 (Admin Tools), LS-7662 (SecureStore/sessionStorage parity), LS-7663 (auto-save debounce guard), LS-7664 (collapse persistence is web-only).

## Surfaces with no Feature Story

The web page also renders a **Sound effects** toggle (LS-10111; native has `audio-enabled-toggle`) and a **Touchdown alerts** toggle (football; `touchdownAlertEnabled`) that the stories/page doc do not mention (`docs/agents/pages/preferences.md` lists four matchup toggles; the code has five). Touchdown alerts is folded into LS-5611's pending assertions; Sound effects is tracked by LS-10619 (GAP-005, filed from this audit).
