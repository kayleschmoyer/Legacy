# Sync Report — User Page

- **Design id**: `mZQ6CvdGoj6nIX4rrQKE0A`
- **Slug**: `legacy-sports-user-page`
- **Status**: active (re-synced)
- **Synced**: 2026-08-06 via `DesignSync` (local pull, `/pull-design`); review-comment fix on 2026-08-07
- **Source**: Claude Design project `2b6eb2e3-82c4-4df8-9ed6-34f13edbe49b` (`PROJECT_TYPE_PROJECT`, "Legacy Sports User Page")
- **Bundle hash (sha256, canonical scheme)**: `sha256-30415b62fafe37f7de5b9ea853e81bd2b88b027f3b9b57d3b110cb6e08d07c70`
- **Jira ticket**: [LS-8977](https://bkrupa.atlassian.net/browse/LS-8977) (design-source-fix, child of design-sync bucket epic LS-4568; original design ticket LS-4922)

## What changed vs the previous (2026-05-26 manual-zip) sync

The previous repo bundle was an incomplete manual zip import: `index.html` referenced `tweaks-panel.jsx`, but that file was never actually present on disk, so the bundle could not render. This re-sync pulls the **live** Claude Design project directly (`DesignSync get_project`/`list_files`/`get_file`) rather than trusting the old zip, and:

1. **Completes the bundle** — `tweaks-panel.jsx` (the shared Tweaks-panel framework file) is now present; the bundle renders end-to-end.
2. **Fixes brand/brief violations found by the LS-8954 audit and re-confirmed against this live pull** (fixed at the source in the Claude Design project first, then re-pulled here):
   - `>1px` gold border-left accent stripes (`.settings-side button.on`, `.about-quotebar`) reduced to 1px.
   - Off-palette greens (`#22c55e` chip, `#2D6A4F`/`#1D4A37` badge-icon gradient) replaced with the `SUCCESS` token family.
   - The banned `.theme-light` / `[data-theme='light']` token block removed from `design-system/colors_and_type.css` entirely.
   - Live CSS `@keyframes`/`animation` (pulse dot, route crossfade, section reveal) replaced with static settled states + `MOTION` HTML/CSS comments; the loading-skeleton shimmer is kept as the one live animation, per the Conditional States spec's explicit "animated shimmer" requirement.
   - Added a Loading / Error / Empty / Populated state switcher + full state implementation on the Profile view (previously populated-only).
   - Extended responsive coverage from a single invented `880px` breakpoint to the seven canonical bands (`xxs`–`xxl`, thresholds 660/800/860/980/1120/1280), with a dedicated `xxs` (375px) frame.
   - Tokenized ~15+ repeated raw `rgba(197,165,90,X)` gold values into `--brand-gold-a*` custom properties (plus navy/seam alpha ramps).
   - Nav tabs (`<a>` acting as tab controls) converted to real `<button>` elements; `:focus-visible` added across buttons, cards, and badges that lacked it.
   - Added a `<!-- HANDOFF -->` block and `<!-- COMPONENT -->` annotations.
3. **Findings NOT changed** (deliberate scope decisions, documented in the HANDOFF comment in `project/index.html`):
   - `design-system/colors_and_type.css` still self-hosts Big Shoulders Display + Literata via woff2 and pulls JetBrains Mono via a Google Fonts `@import` rather than a `<link>` tag — this file mirrors the shared design-system stylesheet used by every synced project; changing the font-loading strategy site-wide is out of scope for a single-page ticket.
   - Settings keeps a single populated state (no async fetch in the real app for that page).

## Review follow-up (2026-08-07)

The review bot flagged `ProfileErrorState` reusing `BrandIcon name="secure"` — the same icon `ProfileView`'s private-profile lock screen uses, making "couldn't load" and "this profile is private" visually identical. Fixed at the source (the brand icon set has no dedicated error mark): swapped to an inline alert-triangle SVG using `currentColor`, styled by the existing `.state-frame.is-error` danger-token color.

## Known gap

- `legacy-sports-user-page/chats/` remains empty. The `DesignSync` MCP tool (the only verified local fetch pathway) exposes `get_project`/`list_files`/`get_file` only — it has no chat-transcript API, so this local pull cannot populate `chats/`. The README documents this design as a manual-import-style bundle where the prototype source files (not a chat transcript) are the authoritative spec.

## Files

- `legacy-sports-user-page/README.md` — handoff README
- `legacy-sports-user-page/project/index.html` — HTML entrypoint (now with `<!-- HANDOFF -->`)
- `legacy-sports-user-page/project/{app,data,helpers,profile,settings,tweaks-panel}.jsx` — React (Babel-standalone) prototype source
- `legacy-sports-user-page/project/styles.css` — page styles
- `legacy-sports-user-page/project/design-system/colors_and_type.css` — design tokens
- `legacy-sports-user-page/project/design-system/fonts/` — Big Shoulders Display + Literata
- `legacy-sports-user-page/project/design-system/icons/brand/` — brand SVG icons
- `legacy-sports-user-page/project/design-system/assets/logo.png` — wordmark logo
