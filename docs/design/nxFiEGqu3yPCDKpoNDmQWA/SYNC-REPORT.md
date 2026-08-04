# Sync report: Homepage

**Design ID**: `nxFiEGqu3yPCDKpoNDmQWA`
**Source**: `designsync-local` (DesignSync MCP tool, projectId `714ce35a-d395-4e13-aadd-8d5d9f021104`)
**Synced at**: 2026-08-04T21:59:27.000Z
**Bundle hash**: `sha256-17f28c2041df0346097b9f44bfdbfb2875a850a30c2f74697435644e433d049c`
**Files**: 19
**Total size**: see individual file listing below

## What changed (LS-9032 — exploratory assets cleaned up at the source, follow-up to LS-9030/#6701)

Compared to the immediately-prior pull in this same ticket (hash `sha256-9b50d90fbb61077912118b894c498d0301feddeec9a0fc993f9b806f94e0fcd3`):

- **Removed: `project/scratch/mockups/hero-football-directions.html`** and **`project/scratch/mockups/ticket-hero-football-options.html`** — deleted from the Claude Design project (the design exploration concluded; no direction was picked for implementation).
- **`project/scratch/mockups/home.html`** — the dead CSS/markup that referenced the exploration (`.league-hero`, `.matchup`, `.ticket-fb`, and the "retained in case we revert" comments) was removed now that the exploration is closed. Net: 125 lines deleted, 7 changed.
- All other files (icons, `uploads/PROMPT.md`, `uploads/home.md`, `uploads/pasted-1785877893078-0.png`) unchanged.
- **Gap carried forward**: two pasted reference images in `uploads/` (`pasted-1785870995051-0.png`, `pasted-1785873442793-0.png`) and one more (`pasted-1785875517886-0.png`, which hits the `get_file` 256 KiB cap — `truncated: true`) still could not be reliably pulled without risking silent corruption of the binary bytes. None are referenced by path from `home.html`, so they do not block implementation. Use the Chrome "Export → Project HTML (.zip)" fallback per `references/designsync-tool.md` if a future pass needs them.

## Pages

- `legacy-sports-homepage/project/scratch/mockups/home.html`

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
legacy-sports-homepage/project/scratch/mockups/home.html
legacy-sports-homepage/project/uploads/PROMPT.md
legacy-sports-homepage/project/uploads/home.md
legacy-sports-homepage/project/uploads/pasted-1785877893078-0.png
```
