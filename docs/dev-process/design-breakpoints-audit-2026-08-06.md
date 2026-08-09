# Design bundle Breakpoints audit (LS-9024)

**Date**: 2026-08-06
**Ticket**: [LS-9024](https://bkrupa.atlassian.net/browse/LS-9024)
**Origin**: LS-8967 (Notifications) found its bundle had zero coverage for 5 of 7 breakpoint bands despite [`docs/agents/pages/PROMPT.md`](../agents/pages/PROMPT.md)'s Deliverable Checklist requiring every band to have either a designed frame or an explicit `<!-- BREAKPOINTS: ... -->` coverage annotation. LS-9024 audited every other synced bundle to see how widespread the gap was.

## Rule audited

The app uses seven canonical breakpoint bands, mirrored from [`lib/design-tokens/src/lib/breakpoints.ts`](../../lib/design-tokens/src/lib/breakpoints.ts): `xxs` (0px), `xs` (660px), `sm` (800px), `md` (860px), `lg` (980px), `xl` (1120px), `xxl` (1280px). Per PROMPT.md's Breakpoints section, every band must be claimed by exactly one designed layout — either a distinct frame, or an explicit `<!-- BREAKPOINTS: ... -->` annotation stating which bands share a layout tier. `xxs` (375px) and `xxl` (1280px) must always have fully designed frames.

## Method

Every bundle listed in `docs/design/manifest.json` with `status: "active"` was checked: read the mockup HTML/CSS/JS, identify actual designed layout tiers and their pixel breakpoints, and determine whether all seven bands are claimed by a frame or annotation using the canonical thresholds (no invented breakpoints like 768px or 900px).

## Results

`manifest.json` lists 25 design entries total; one (`670f7892…`, the original Design System overview) has `status: "archived"` and is out of scope by definition — the live Design System bundle audited below is the separate `7SRWFMj3a6khIhwLuWkSKA` entry, `status: "active"`. That leaves **24 active bundles**, all accounted for below:

- **7 compliant** — all seven bands accounted for by a designed frame or explicit annotation, on canonical thresholds.
- **14 gaps** — one or more bands unclaimed, or claimed via invented (non-canonical) breakpoints. Sliced into per-bundle child tickets under the design-sync bucket epic ([LS-4568](https://bkrupa.atlassian.net/browse/LS-4568)) rather than fixed inline here — 14 bundles is too large a fix surface for one ticket/PR, matching LS-9024's own dispatch guidance.
- **2 not yet synced** — present in `manifest.json` but with no local `docs/design/` bundle to audit (Draft Spectator, MatchupRosterComparison responsive layout). Re-check once `/sync-designs` pulls them.
- **1 not applicable** — Intro Video is a fixed 1920×1080 video storyboard, not a reflowing UI page; the breakpoints rule doesn't apply.

### Compliant (7)

| Bundle                         | Jira    |
| ------------------------------ | ------- |
| legacy-sports-login-page       | LS-8960 |
| legacy-sports-draft-board      | LS-8961 |
| legacy-sports-notifications    | LS-8967 |
| legacy-sports-player-details   | LS-8970 |
| scoreboard-page                | LS-8971 |
| legacy-sports-homepage         | LS-9046 |
| legacy-sports-profile-settings | LS-8972 |

### Gaps — sliced into child tickets under LS-4568 (14)

| Bundle                                                 | Jira (source) | Fix ticket | Gap summary                                                                                                                                                                                            |
| ------------------------------------------------------ | ------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| legacy-sports-public-leagues                           | LS-9017       | LS-9081    | sm/md/lg/xl never explicitly claimed by a frame or annotation                                                                                                                                          |
| legacy-baseball-minigames                              | LS-8959       | LS-9082    | canonical-threshold annotations exist but no dedicated xxs/xxl frames; md/xxl uncalled-out                                                                                                             |
| legacy-sports-players-page                             | LS-8962       | LS-9083    | one invented breakpoint (720px); zero annotations                                                                                                                                                      |
| legacy-sports-create-league                            | LS-8963       | LS-9084    | only 375/1280 viewports; xs–xl unclaimed; invented thresholds (960/720/480)                                                                                                                            |
| legacy-sports-account-management                       | LS-8964       | LS-9085    | BREAKPOINTS annotation exists but its own stated ranges leave `lg` unclaimed                                                                                                                           |
| legacy-sports-preferences                              | LS-8965       | LS-9086    | only xxs+xxl frames; xs/sm/md/lg/xl unclaimed                                                                                                                                                          |
| legacy-sports-help                                     | LS-8966       | LS-9087    | xxs–md and xxl claimed; `lg`/`xl` unclaimed                                                                                                                                                            |
| legacy-sports-nav-bar                                  | LS-8968       | LS-9088    | only xxs+xxl frames; "tablet" section uses invented 900–1100px range                                                                                                                                   |
| legacy-sports-user-page                                | LS-4922       | LS-9089    | one invented breakpoint (880px); no annotations, no dedicated frames                                                                                                                                   |
| legacy-sports-players-card-feed                        | LS-8832       | LS-9090    | phone-only (428px); no tablet/desktop frame or annotation at all                                                                                                                                       |
| league-detail-page (9 files)                           | LS-8974       | LS-9091    | shared stylesheet uses only invented breakpoints (1100/780/600/380); no canonical coverage                                                                                                             |
| legacy-sports-stats-page                               | LS-8975       | LS-9092    | mostly annotated, but `sm`(800) and `xl`(1120) unclaimed                                                                                                                                               |
| legacy-sports-admin                                    | LS-8976       | LS-9093    | only xxs+xxl frames; invented 1700px scroll-layout query                                                                                                                                               |
| legacy-sports-design-system (`ui_kits/web/index.html`) | LS-9007       | LS-9094    | the composed Landing/Dashboard/Scoreboard/League/Draft page has zero responsive treatment (the `preview/breakpoints.html` reference doc and isolated component swatches are unaffected — not in scope) |

### Not yet synced (2)

| Bundle                                    | Jira | Note                                                                                          |
| ----------------------------------------- | ---- | --------------------------------------------------------------------------------------------- |
| Draft Spectator                           | —    | Listed in `manifest.json`; no local `docs/design/` bundle exists. Not auditable until synced. |
| MatchupRosterComparison responsive layout | —    | Same as above.                                                                                |

### Not applicable (1)

| Bundle      | Jira    | Note                                                                                                              |
| ----------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| intro-video | LS-8969 | Fixed-dimension (1920×1080) video storyboard asset, not a reflowing UI page — the Breakpoints rule doesn't apply. |

## Follow-up

Each gap ticket (LS-9081–LS-9094) follows the same design-source-fix pattern as LS-8967: fix at the source via the DesignSync tool, then re-pull into `docs/design/` within that ticket's own PR. When the two not-yet-synced bundles (Draft Spectator, MatchupRosterComparison) are pulled in by a future `/sync-designs` run, they should be checked against this same checklist item before being marked compliant.
