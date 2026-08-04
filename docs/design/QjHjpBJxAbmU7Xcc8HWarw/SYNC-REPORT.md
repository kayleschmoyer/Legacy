# Sync report: Account Management

**Design ID**: `QjHjpBJxAbmU7Xcc8HWarw`
**Source**: `designsync-local` (DesignSync MCP tool, projectId `019de999-00d9-72cf-bb9a-3110eab0e366`)
**Synced at**: 2026-08-04T15:22:45.000Z
**Bundle hash**: `b36d5d0792908ad5a482e1992441cca34f5733f64a6109fefdff0ec39a3ac4b3`
**Files**: 13
**Total size**: 399087 bytes

## What changed (LS-8964, per LS-8954 audit findings)

Re-ran the mockup at the source (Claude Design project, not `docs/design/` directly) to close audit gaps against `docs/agents/pages/PROMPT.md`, then pulled the fixed file back into this bundle. Only `project/scratch/mockups/management.html` changed.

- **HIGH** — removed the third font (JetBrains Mono) from the Google Fonts `<link>` and the `--font-mono` token; the one remaining numeric use (`.canvas-label .px`) now uses Literata + `tabular-nums`.
- **HIGH** — removed off-brief/dead `:root` tokens (`--brand-navy-dark`, `--bg-raised`, `--danger`, `--danger-fg`, `--danger-soft`, and the raw `#06090f` stage background). Interaction-state color variants (`--brand-navy-light`, `--brand-seam-red-light/dark`, `--brand-gold-light`) are now derived from the four canonical brand hexes via `color-mix()` instead of hand-picked hex, so every color traces back to a `brand.md` token.
- **MED** — replaced the invented `1100px` canvas-stacking breakpoint with the canonical `lg` (980px) threshold, and added a `<!-- BREAKPOINTS -->` annotation explaining the page's band coverage across all seven bands (xxs–xxl).
- **MED** — added `:focus-visible` rules (2px primary-text outline, no gold) for all 24 previously-unstyled interactive elements: `.btn`, `.icon-btn`, segmented toggle buttons, nav tabs, breadcrumb links.
- **LOW** — added `font-variant-numeric: tabular-nums` to the remaining numeric surfaces (canvas pixel dims, dialog "you will lose" counts).
- **LOW** — replaced the "DESIGN INTENT" comment block with a proper `<!-- HANDOFF -->` block (final file, key decisions, deviations, open questions).
- **LOW** — added `<!-- COMPONENT: ... -->` annotations for the six reusable patterns (settings-card, btn, consequence-list, skeleton-card, error-card, empty-state, confirm-dialog).

Preserved per the audit: dark-only surfaces, Google-CDN brand fonts (now exactly two), single `:root` token discipline, the 4-state `<template>`-based switcher, semantic HTML, and the 70ch body-copy width.

## Pages

- `legacy-sports-account-management/project/scratch/mockups/management.html`

## All files

```
legacy-sports-account-management/README.md
legacy-sports-account-management/chats/chat1.md
legacy-sports-account-management/project/assets/logo.png
legacy-sports-account-management/project/icons/bell.svg
legacy-sports-account-management/project/icons/commissioner.svg
legacy-sports-account-management/project/icons/draft.svg
legacy-sports-account-management/project/icons/league.svg
legacy-sports-account-management/project/icons/live.svg
legacy-sports-account-management/project/icons/scoreboard.svg
legacy-sports-account-management/project/icons/secure.svg
legacy-sports-account-management/project/scratch/mockups/management.html
legacy-sports-account-management/project/uploads/PROMPT.md
legacy-sports-account-management/project/uploads/management.md
```
