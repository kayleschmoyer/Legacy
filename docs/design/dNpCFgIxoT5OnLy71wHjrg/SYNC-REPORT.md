# Sync Report — Nav Bar

- **Design id**: `dNpCFgIxoT5OnLy71wHjrg`
- **Slug**: `legacy-sports-nav-bar`
- **Title**: Legacy Sports Nav Bar
- **Status**: active
- **Source**: `designsync-local` — DesignSync MCP tool, project `20f12546-37e6-4441-b8b2-a3cb113c5004`
- **Synced at**: 2026-08-09T23:24:42.000Z
- **Bundle hash**: `sha256-7aca3a4ed75a288d66d0221569c9b0baf2f82dbd72cc4bf80fd2f6defc6892fa`
- **File count**: 29
- **Jira ticket**: LS-9224

## What changed vs the previous sync (LS-8968, `03e6532014da7cca0f493ca6b9d72fae44755c3891887971f5c3b86f57ad97a1`)

Follow-up to LS-9019 (Nav Bar core states + static mockup conversion), completed directly in a human-led Claude Design session. Both remaining ACs from LS-9019 are satisfied:

- **AC1 — core states (new files `NavStates.jsx` + a new `§ 02 Data States` section in `Nav Bar System.html`)**: added a working loading/error/empty/populated `StateSwitch` (radiogroup, arrow-key navigable) that drives every primary nav surface at once — the desktop nav + league switcher + tabs, the below-nav ticker, the notification tray, the league dropdown, and the mobile header + bottom bar (`NavDesktopState`, `TickerState`, `NotifTrayState`, `LeagueDropdownState`, `MobileHeaderState`, `MobileBottomBarState`, `PhoneMockState`). Loading uses inert aria-busy skeletons; error surfaces a neutral in-context Retry (never an apology); empty turns the nav into an invitation to create/join a league.
- **AC2 — interactive states (new file `interaction-states.css`, loaded after `styles.css`)**: explicit `:focus-visible` (3px ring, 2px offset, soft halo inside dark panels), `:active`/press, hover fills, selected/current, and `:disabled` (color-and-border led, never opacity-only) rules for every interactive element listed in the audit — tabs, icon buttons, avatar button, league switcher, menu items, sport pills, drawer items, mobile tabs, ticker items, dropdown/notif/league rows. Disabled elements explicitly can't pick up hover treatment.
- **AC3 (stretch, not attempted)**: the mockup still runs on React 18 + Babel via unpkg rather than static HTML — per LS-9019's own text this was optional ("may be split out... if determined worth the rework cost"); not done in this session, no regression from before.
- `Nav Bar System.html`, `NavBars.jsx`, `NavParts.jsx`, `NavPopovers.jsx`, `frames/ios-frame.jsx`, `styles.css`, all 15 brand icon SVGs: no functional changes — content is unchanged or reformatted incidentally by the Claude Design session's own export; diffed and re-pulled for completeness/hash correctness.
- `assets/colors_and_type.css`: unchanged (byte-identical), not rewritten.

## Skipped

- **`assets/logo.png`**: `get_file` returned `truncated: true` (256 KiB cap). Reused the existing tracked copy — out of scope for this session's change (only state/interaction work) and extremely unlikely to have changed.
- **`_ds/legacy-sports-design-system-670f7892-.../`**: the linked shared Design System project's own files (fonts, ui_kits, tokens) — not part of this bundle's content, excluded per prior sync's scope.
- **`screenshots/` (7 PNGs: `01-mobile-merged.png`, `01-navheight.png`, `01-states.png`, `02-mobile-merged.png`, `02-navheight.png`, `02-states.png`, `bp.png`, `focus.png`, `native.png`, `native2.png`, `native3.png`, `probe.png`)**: new folder present in the project listing, likely design-QA reference screenshots the Claude Design session captured for itself. Not part of the documented bundle layout (`README.md` / `chats/` / `project/`) and not needed for implementation — the HTML/CSS/JSX source is the authoritative visual target. Flagging here in case a future sync wants to pull them for reference.
- **`.thumbnail`**: internal Claude Design thumbnail, not bundle content.

## Notes

- Confirmed both LS-9019 ACs are met by inspecting `NavStates.jsx` and `interaction-states.css` directly before writing this report — see the ticket comment for the full mapping.
- All fetched non-binary files reported `truncated: false`.
- **Rebase reconciliation (this sync, onto main after the LS-9088 addendum below landed)**: main had a repo-only stopgap fix (LS-9088 addendum, kept below) applied directly to `Nav Bar System.html` after this DesignSync pull's base but before this branch was rebased. Verified post-rebase that the stopgap's caption/annotation edits survived the merge intact — `Nav Bar System.html` still contains the `Canonical bands xs–lg (660–1119px)` caption and both `BREAKPOINTS:` annotations for §01 and §03; the invented "900–1100px" caption does not reappear. The LS-9088 addendum's own follow-up instruction (apply the fix in Claude Design or `/push-design` to reconcile source-of-truth) still stands — this sync did not push anything back to Claude Design.

```
legacy-sports-nav-bar/README.md
legacy-sports-nav-bar/chats/chat1.md
legacy-sports-nav-bar/chats/chat2.md
legacy-sports-nav-bar/project/Nav Bar System.html
legacy-sports-nav-bar/project/NavBars.jsx
legacy-sports-nav-bar/project/NavParts.jsx
legacy-sports-nav-bar/project/NavPopovers.jsx
legacy-sports-nav-bar/project/NavStates.jsx
legacy-sports-nav-bar/project/interaction-states.css
legacy-sports-nav-bar/project/assets/colors_and_type.css
legacy-sports-nav-bar/project/assets/icons/brand/award.svg
legacy-sports-nav-bar/project/assets/icons/brand/baseball.svg
legacy-sports-nav-bar/project/assets/icons/brand/bell.svg
legacy-sports-nav-bar/project/assets/icons/brand/commissioner.svg
legacy-sports-nav-bar/project/assets/icons/brand/draft.svg
legacy-sports-nav-bar/project/assets/icons/brand/football.svg
legacy-sports-nav-bar/project/assets/icons/brand/league.svg
legacy-sports-nav-bar/project/assets/icons/brand/live.svg
legacy-sports-nav-bar/project/assets/icons/brand/matchup.svg
legacy-sports-nav-bar/project/assets/icons/brand/roster.svg
legacy-sports-nav-bar/project/assets/icons/brand/scoreboard.svg
legacy-sports-nav-bar/project/assets/icons/brand/secure.svg
legacy-sports-nav-bar/project/assets/icons/brand/standings.svg
legacy-sports-nav-bar/project/assets/icons/brand/stats.svg
legacy-sports-nav-bar/project/assets/icons/brand/trophy.svg
legacy-sports-nav-bar/project/assets/icons/brand/zap.svg
legacy-sports-nav-bar/project/assets/logo.png
legacy-sports-nav-bar/project/frames/ios-frame.jsx
legacy-sports-nav-bar/project/styles.css
```

## Addendum — LS-9088 (2026-08-09)

**This addendum was applied directly to the repo bundle, not via a DesignSync pull.** The `DesignSync` MCP tool requires an interactive `/design-login` that is unavailable in this cloud session (`get_project` on `20f12546-37e6-4441-b8b2-a3cb113c5004` returned "DesignSync needs design-system authorization... /design-login requires an interactive terminal and is not available in this environment"). Per the design-sync skill, the source-of-truth fix belongs in Claude Design itself; since that pathway is blocked here, the fix below was made in the repo bundle as a stopgap and **`manifest.designs[].lastSyncedHash` was deliberately left unchanged** rather than falsified.

**Follow-up required**: from a local session, either (a) apply the same fix in Claude Design (project `20f12546-37e6-4441-b8b2-a3cb113c5004`) via the DesignSync write flow and re-pull, or (b) run `/push-design dNpCFgIxoT5OnLy71wHjrg` to upload this repo fix to Claude Design so the source and the bundle stay in step. This sync's pull did not push the fix back to Claude Design — that follow-up still applies to the *source* project, even though the repo bundle itself now reflects both this sync's new content and the stopgap fix (verified above).

Fixed the LS-9088 audit finding — `Nav Bar System.html` §03 ("Tablet") was captioned "900–1100px", an invented range matching none of the 7 canonical breakpoint bands in `lib/design-tokens/src/lib/breakpoints.ts`, and bands `xs`(660), `sm`(800), `md`(860), and `xl`(1120) had no designed frame or `BREAKPOINTS` annotation anywhere in the file:

- **§03 "Tablet · Collapsed"** — caption changed from the invented "900–1100px" to "Canonical bands xs–lg (660–1119px)"; added a `BREAKPOINTS` annotation explaining the collapsed nav (icon-only search, folded wordmark) serves `xs`/`sm`/`md`/`lg` as one continuum, and the two 1024px frames are labeled as landing in the `lg` band (980–1119px).
- **§01 "Desktop · Anatomy"** — added a `BREAKPOINTS` annotation and caption update noting the full-search layout is unchanged between `xl` (1120–1279px) and `xxl` (1280px+), so the existing 1280px frame also covers `xl`.
- **No frame changes** — `xxs` (390px phone mocks, §04/§05) and `xxl` (1280px desktop anatomy, §01) remain the only fully designed frames, per the Deliverable Checklist's minimum. All seven bands are now claimed by exactly one designed layout or annotation.

## Removed since previous sync

```
legacy-sports-nav-bar/project/assets/fonts/*.woff2  (30 files — self-hosted fonts replaced by Google Fonts CDN)
legacy-sports-nav-bar/project/debug-mobile.png
legacy-sports-nav-bar/project/debug-mobile2.png
legacy-sports-nav-bar/project/debug-mobile3.png
legacy-sports-nav-bar/project/debug-mobile4.png
legacy-sports-nav-bar/project/debug-mobile5.png
```
