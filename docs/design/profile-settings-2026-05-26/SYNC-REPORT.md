# Sync Report — Profile Settings

- **Design id**: `profile-settings-2026-05-26`
- **Slug**: `legacy-sports-profile-settings`
- **Title**: Legacy Sports Profile Settings
- **Status**: new
- **Source**: manual local sync from `Legacy Sports Profile Settings.zip` (user-supplied; not fetched from claude.ai/design)
- **Synced at**: 2026-05-26
- **Bundle hash (sha256)**: `f9ed551882e3ef4ad53254241adc51ba725ff3f1941f8ecefeae883185be3502`
- **File count**: 47
- **Jira ticket**: LS-4931

## What's in the bundle

Top-level prototype files (in `legacy-sports-profile-settings/project/`):

- `Profile Settings.html` — rendered HTML prototype
- `ProfileSettings.jsx` — page component (`/profile/settings`)
- `PublicProfileHero.jsx` — public profile hero card
- `BreakpointFrame.jsx` — container-query host wrapper
- `Icons.jsx` — inline SVG icons
- `design-canvas.jsx` — design canvas / page layout
- `styles.css` — layout, container queries, component styles
- `assets/colors_and_type.css` — design tokens
- `assets/fonts/` — Big Shoulders Display + Literata woff2 subsets
- `assets/icons/` — bell, award, draft, league, live, scoreboard, secure, stats, trophy
- `assets/logo.png` — brand logo

## Notes

- No chat transcripts (bundle was added manually, not via `/sync-designs`).
- Tokens in `assets/colors_and_type.css` should be diffed against the shared design system bundle under `docs/design/7SRWFMj3a6khIhwLuWkSKA/` before integrating — avoid duplicating tokens that already exist.
