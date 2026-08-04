# Sync report: Homepage

**Design ID**: `nxFiEGqu3yPCDKpoNDmQWA`
**Source**: `designsync-local` (DesignSync MCP tool, projectId `714ce35a-d395-4e13-aadd-8d5d9f021104`)
**Synced at**: 2026-08-04T21:40:55.000Z
**Bundle hash**: `sha256-9b50d90fbb61077912118b894c498d0301feddeec9a0fc993f9b806f94e0fcd3`
**Files**: 21
**Total size**: see individual file listing below

## What changed (LS-9030 — new football hero exploration + home.html revisions)

Compared to the previous sync (LS-8973, hash `23f32c9b49f0f536dfbcc0173bdac54b610dbe4d0c76680dfb2802ce723b67a0`):

- **`project/scratch/mockups/home.html`** — updated in the Claude Design project since the last pull (688 insertions / 107 deletions vs. the prior bundle copy). Re-pulled verbatim.
- **New: `project/scratch/mockups/hero-football-directions.html`** — a design-exploration doc presenting six non-ticket hero-banner directions for football matchups (scoreboard slab, broadcast lower-third, chalk playbook, field-position strip, 1990s broadcast scorebug, and a playbook+scorebug hybrid). Explicitly scoped as filling the same slots as the ticket hero on `/` so any direction is a component swap, not a page-contract change.
- **New: `project/scratch/mockups/ticket-hero-football-options.html`** — four football skins for the existing ticket-hero component (turf-accent token swap, dark "night game" stock, structural "game program" pre-kickoff variant, and a "chalk scoreboard" slate skin), referencing the baseball ticket in production for comparison.
- **`project/uploads/PROMPT.md`, `project/uploads/home.md`** — re-pulled, unchanged (byte-identical to the prior sync).
- **`project/icons/brand/*.svg`** (11 files) — re-pulled, unchanged.
- **`project/uploads/pasted-1785877893078-0.png`** — new reference screenshot pulled successfully (44,513 bytes).
- **Gap**: two additional pasted reference images in the Claude Design project's `uploads/` (`pasted-1785870995051-0.png`, `pasted-1785873442793-0.png`) and one more (`pasted-1785875517886-0.png`, which hit the `get_file` 256 KiB cap — `truncated: true`) could not be reliably pulled without risking silent corruption of the binary bytes, and are **not written to this bundle**. None of the three are referenced by path from the HTML mockups (they are supplementary inspiration/reference images, not rendered assets), so they do not block implementation. If a future pass needs them, use the Chrome "Export → Project HTML (.zip)" fallback per `references/designsync-tool.md`.

## Pages

- `legacy-sports-homepage/project/scratch/mockups/home.html`
- `legacy-sports-homepage/project/scratch/mockups/hero-football-directions.html`
- `legacy-sports-homepage/project/scratch/mockups/ticket-hero-football-options.html`

## All files

```
legacy-sports-homepage/README.md
legacy-sports-homepage/chats/chat1.md
legacy-sports-homepage/project/assets/logo.png
legacy-sports-homepage/project/icons/brand/award.svg
legacy-sports-homepage/project/icons/brand/baseball.svg
legacy-sports-homepage/project/icons/brand/bell.svg
legacy-sports-homepage/project/icons/brand/draft.svg
legacy-sports-homepage/project/icons/brand/football.svg
legacy-sports-homepage/project/icons/brand/league.svg
legacy-sports-homepage/project/icons/brand/live.svg
legacy-sports-homepage/project/icons/brand/matchup.svg
legacy-sports-homepage/project/icons/brand/scoreboard.svg
legacy-sports-homepage/project/icons/brand/standings.svg
legacy-sports-homepage/project/icons/brand/stats.svg
legacy-sports-homepage/project/icons/brand/trophy.svg
legacy-sports-homepage/project/scratch/mockups/hero-football-directions.html
legacy-sports-homepage/project/scratch/mockups/home.html
legacy-sports-homepage/project/scratch/mockups/ticket-hero-football-options.html
legacy-sports-homepage/project/uploads/PROMPT.md
legacy-sports-homepage/project/uploads/home.md
legacy-sports-homepage/project/uploads/pasted-1785877893078-0.png
```
