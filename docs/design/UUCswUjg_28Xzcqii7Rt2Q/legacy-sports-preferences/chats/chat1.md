# Mobile breakpoints

_Started 2026-05-02 16:53 UTC_

---

## User

Prompt is attached. Preferences.md is the relevant page. Build all mobile breakpoints

## Assistant

_[tool: read_file]_

_[tool: read_file]_

I'll explore the design system to understand existing patterns before designing.

_[tool: list_files]_

_[tool: read_file]_

I'll explore the existing UI kits to match the patterns, then build.

_[tool: list_files]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: snip]_

Now I have full context. Let me build the Preferences page mockup.

_[tool: list_files]_

Let me set up the project folder and copy needed assets.

_[tool: copy_files]_

Now let me build the preferences page. I'll plan the design:

**Design system observations:**

- Mobile-primary mockup at 375px, with desktop preview at 1280px
- 4 togglable states: Loading, Error, Empty, Populated
- Sticky nav, sections collapsible, save banner fixed
- Use Big Shoulders Display + Literata, custom toggles in brand navy/gold

Let me build it as a single self-contained file showing both mobile breakpoints (small mobile 375px and a wider 768px tablet) plus a 1280px desktop, all in one canvas-style view.

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

_[tool: done]_

_[tool: snip]_

_[tool: fork_verifier_agent]_

Built `scratch/mockups/preferences.html` — Preferences page across three mobile breakpoints (360 / 375 / 414 px) in one canvas, with a top tab to flip between **Populated**, **Loading**, **Error**, and **Empty (unauthed)** states.

Highlights:

- Three collapsible sections (Appearance, Sports & Stats, Notifications) — chevron rotates, body collapses, state syncs across all frames
- Theme picker as 3-up swatch cards (System / Light / Dark) — qualitative choice gets visual weight, not a 3-way switch
- Custom navy/gold toggles, segmented controls, and a ±1 / ±10 stepper for the close-game threshold
- Auto-save banner with gold check rises from below for 2 s on any change
- Loading state uses geometry-matching skeletons (not generic bars); Error lives inside the Notifications section with a Retry; Empty replaces Notifications with a sign-in gate while keeping local Appearance/Sports prefs available
- All interactive elements ≥ 44×44 px (toggles wrapped in 44 px hit-pads); motion intent annotated in HTML comments
