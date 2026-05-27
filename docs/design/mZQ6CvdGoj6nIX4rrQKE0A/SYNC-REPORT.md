# Sync Report — User Page

- **Design id**: `mZQ6CvdGoj6nIX4rrQKE0A`
- **Slug**: `legacy-sports-user-page`
- **Status**: new
- **Imported**: 2026-05-26 (manual zip upload — not produced by `/sync-designs`)
- **Source**: `Legacy Sports User Page.zip` (uploaded by user)
- **Bundle file-listing hash (sha256)**: `231d89bd13de59fc8d739c540a6f7085dbf2fde413297962eb2832abef7cbbe2`
- **Jira ticket**: [LS-4922](https://bkrupa.atlassian.net/browse/LS-4922) (child of design-sync bucket epic LS-4568)

## Why no Claude Design URL?

This design was exported manually from claude.ai/design and handed off as a zip. The standard `/sync-designs` cloud flow was not used, so the manifest entry has no `url` and `lastSyncedHash` reflects a literal `sha256sum` over `find . -type f | sort` of the project tree (not the canonical hashing scheme described in `references/manifest-schema.md`). The next `/sync-designs` run that picks up the canonical URL for this design will recompute and overwrite.

## Files

- `legacy-sports-user-page/README.md` — handoff README
- `legacy-sports-user-page/project/index.html` — HTML entrypoint
- `legacy-sports-user-page/project/{app,data,helpers,profile,settings,tweaks-panel}.jsx` — React (Babel-standalone) prototype source
- `legacy-sports-user-page/project/styles.css` — page styles
- `legacy-sports-user-page/project/design-system/colors_and_type.css` — design tokens
- `legacy-sports-user-page/project/design-system/fonts/` — Big Shoulders Display + Literata
- `legacy-sports-user-page/project/design-system/icons/brand/` — brand SVG icons
- `legacy-sports-user-page/project/design-system/assets/logo.png` — wordmark logo
