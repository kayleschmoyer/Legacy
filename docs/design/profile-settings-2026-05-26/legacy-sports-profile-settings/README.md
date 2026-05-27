# CODING AGENTS: READ THIS FIRST

This is a **handoff bundle** from Claude Design (claude.ai/design).

A user mocked up designs in HTML/CSS/JS using an AI design tool, then exported this bundle so a coding agent can implement the designs for real.

## What you should do — IMPORTANT

**This bundle was added via a manual local sync** (zip dropped into the repo, not `/sync-designs`), so there are no chat transcripts under `legacy-sports-profile-settings/chats/`. The design intent must be inferred from the source files themselves.

**Find the primary design file under `legacy-sports-profile-settings/project/` and read it top to bottom.** The entry points are:

- `Profile Settings.html` — the rendered prototype (root HTML)
- `ProfileSettings.jsx` — the full `/profile/settings` page component (read this first)
- `PublicProfileHero.jsx` — the public profile hero card
- `BreakpointFrame.jsx` — container-query host wrapper used to demo responsive states
- `Icons.jsx` — inline SVG icon set
- `design-canvas.jsx` — design canvas / page layout
- `styles.css` — all layout, container queries, and component styles
- `assets/colors_and_type.css` — design tokens (colors, type scale)

Then **follow its imports**: open every file it pulls in (shared components, CSS, scripts) so you understand how the pieces fit together before you start implementing.

**If anything is ambiguous, ask the user to confirm before you start implementing.** It's much cheaper to clarify scope up front than to build the wrong thing.

## About the design files

The design medium is **HTML/CSS/JS** — these are prototypes, not production code. Your job is to **recreate them pixel-perfectly** in whatever technology makes sense for the target codebase (React in `apps/web`). Match the visual output; don't copy the prototype's internal structure unless it happens to fit.

**Don't render these files in a browser or take screenshots unless the user asks you to.** Everything you need — dimensions, colors, layout rules — is spelled out in the source.

## Bundle contents

- `legacy-sports-profile-settings/README.md` — this file
- `legacy-sports-profile-settings/chats/` — empty (manual sync; no transcripts)
- `legacy-sports-profile-settings/project/` — the `Legacy Sports Profile Settings` project files (HTML prototype, JSX components, CSS, assets)
