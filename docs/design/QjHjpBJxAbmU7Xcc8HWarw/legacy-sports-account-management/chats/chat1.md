# Mobile Management UI

_Started 2026-05-02 16:50 UTC_

---

## User

Prompt is attached. Relevant page is management.md. Be sure to build UI for all mobile breakpoints.

## Assistant

_[tool: read_file]_

_[tool: read_file]_

Let me explore the design system to understand the components and patterns I should use.

_[tool: list_files]_

_[tool: read_file]_

_[tool: list_files]_

_[tool: list_files]_

[Continuing exploration of the design system to gather UI patterns.]

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

[Continuing exploration to understand patterns and assets.]

_[tool: read_file]_

_[tool: list_files]_

_[tool: read_file]_

I have enough context now. Let me set up the project and build the management page mockup.

_[tool: copy_files]_

_[tool: snip]_

Now I'll build the management page mockup with all four states (loading, error, empty, populated), both admin and non-admin warning text, the two confirmation dialogs, and responsive mobile + desktop layouts.

_[tool: write_file]_

I need to fix the icon paths — they're using `../../` but the file is in `scratch/mockups/`, not the design system folder. Let me check and finalize.

_[tool: snip]_

[Fixing icon paths — file is at scratch/mockups/, needs ../../ to reach project root for assets.]

_[tool: grep]_

_[tool: run_script]_

_[tool: snip]_

_[tool: done]_

_[tool: fork_verifier_agent]_

The management page mockup is at `scratch/mockups/management.html`.

**What's in it**

- Mobile (375px) + desktop (1280px) canvases side-by-side
- 4 togglable states: Loading (shimmer skeletons), Empty, Error (inline error card with retry), Populated
- 2 access levels: Admin / Non-admin warning text variants
- 2 confirmation dialogs ("Are you sure?" → "This cannot be undone.") plus Deleting state with spinner
- Danger Zone card (seam-red themed) + Information card (navy) with consequence list
- aria-live region, autofocus on destructive button, 44px touch targets, motion annotations as HTML comments

Use the segmented controls at the top to flip between states/access/dialog variants — both canvases mirror in sync.
