# CODING AGENTS: READ THIS FIRST

This is a **handoff bundle** from Claude Design (claude.ai/design).

A user mocked up designs in HTML/CSS/JS using an AI design tool, then exported this bundle so a coding agent can implement the designs for real.

> **Manual import note**: this bundle was uploaded by the user as a zip (not produced by `/sync-designs`). There are no chat transcripts under `chats/` — the prototype source files are the authoritative spec. Tracking ticket: **LS-4922** (child of design-sync bucket epic LS-4568).

## What you should do — IMPORTANT

**Find the primary design file under `legacy-sports-user-page/project/` and read it top to bottom.** Entrypoint is `project/index.html`. Then **follow its imports**: `tweaks-panel.jsx` → `data.jsx` → `helpers.jsx` → `profile.jsx` → `settings.jsx` → `app.jsx`. Open every file it pulls in (shared components, CSS, scripts) so you understand how the pieces fit together before you start implementing.

**If anything is ambiguous, ask the user to confirm before you start implementing.** It's much cheaper to clarify scope up front than to build the wrong thing.

## About the design files

The design medium is **HTML/CSS/JS** — these are prototypes, not production code. Your job is to **recreate them pixel-perfectly** in whatever technology makes sense for the target codebase (React, Vue, native, whatever fits). Match the visual output; don't copy the prototype's internal structure unless it happens to fit.

**Don't render these files in a browser or take screenshots unless the user asks you to.** Everything you need — dimensions, colors, layout rules — is spelled out in the source. Read the HTML and CSS directly; a screenshot won't tell you anything they don't.

## Bundle contents

- `legacy-sports-user-page/README.md` — this file
- `legacy-sports-user-page/chats/` — empty (no transcripts in this manual import)
- `legacy-sports-user-page/project/` — HTML prototype + supporting JSX/CSS + `design-system/` (tokens, fonts, brand icons)

## Target pages in this repo

The bundle covers two views and maps onto these routes in `apps/web`:

| Design view (in bundle)                | Target route                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `project/settings.jsx` (Settings tab)  | **`/profile/settings`** — existing route at `apps/web/src/pages/profile/ProfileSettingsPage.tsx`  |
| `project/profile.jsx` (Public profile) | **New route** (suggested `/u/:handle` or `/profile/:handle`), under `apps/web/src/pages/profile/` |

The Settings view is the primary implementation target; the public profile view is net-new.
