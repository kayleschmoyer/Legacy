# Sync report: Homepage

**Design ID**: `nxFiEGqu3yPCDKpoNDmQWA`
**Source**: `designsync-local` (DesignSync MCP tool, projectId `714ce35a-d395-4e13-aadd-8d5d9f021104`)
**Synced at**: 2026-08-04T23:55:00.000Z
**Bundle hash**: `sha256-800946e3e8e76a226f245eb0219a1d272ff0bcecef85e3b5b5aab25e3df0762d`
**Files**: 20

## What changed (LS-9046)

Compared to the immediately-prior pull (LS-9032, hash `sha256-17f28c2041df0346097b9f44bfdbfb2875a850a30c2f74697435644e433d049c`):

Both hero cards — the baseball ticket-hero (LS-9034, merged) and the football playboard-hero (LS-9035, merged) — gained a **"no current matchup"** state for the between-weeks / bye-week / pre-season case. All changes are confined to `project/scratch/mockups/home.html`:

- **New review-bar toggle**: `Matchup: Live / None`, wired via `data-matchup` on the `.frame` element plus `.m-live` / `.m-none` visibility classes wrapping each hero variant (`.frame[data-matchup="live"] .m-none, .frame[data-matchup="none"] .m-live { display: none; }`).
- **Baseball ticket-hero, no-matchup variant**: the `.tk-score` block is replaced by a new `.tk-standing` block — two `.tk-stat` cells (record, rank) separated by a dashed rule (`border-left: 1px dashed var(--tk-rule)`), plus a `.tk-standing-note` line naming the next matchup and lock time. The header live-marker becomes plain "Active · Week X/Y" text (no pulse dot), and the deadline slot reads "Next matchup `<time>`" instead of a close time.
- **Football playboard-hero, no-matchup variant**: header reads "Bye week · Week X/Y" instead of live/clock; the bug's second plate becomes a new `.bug-row.bug-standing` row showing rank instead of an opponent score; the bottom bar reads "Bye" instead of time-remaining.
- **New responsive breakpoints on the playboard**: `container-type: inline-size; container-name: pboard;` added to `.playboard` itself (previously only `.ticket-hero` had a container context), plus two new `@container pboard` breakpoints — 560px (bug drops below the identity block, full-width) and 380px (actions go full-width, title shrinks). The playboard had no responsive container-query breakpoints of its own before this pass.
- Review-bar helper copy and the render/state JS were updated to wire the new `matchup` toggle (default `live`) alongside the existing `sport`/`state`/`band` toggles.
- **No new design tokens** — the standing/stat text reuses existing `--tk-ink-trail` / `--brand-navy` (baseball) and existing bug chrome colors (football).

All other bundle files (`README.md`, `chats/chat1.md`, `uploads/PROMPT.md`, `uploads/home.md`, the 9 brand icon SVGs, `assets/logo.png`, and the previously-synced `uploads/pasted-1785877893078-0.png`) are byte-identical to the LS-9032 pull — verified via direct content comparison, not just the hash.

## New file

- **`uploads/pasted-1785899843286-0.png`** — one new pasted reference image, pulled successfully (not truncated, 129,552 bytes decoded).

## Gaps carried forward (unchanged from LS-9032)

Three pasted reference images in `uploads/` still cannot be reliably pulled:

- `pasted-1785870995051-0.png`
- `pasted-1785873442793-0.png`
- `pasted-1785875517886-0.png` — hits the `get_file` 256 KiB cap (`truncated: true`)

None are referenced by path from `home.html`, so they do not block implementation. `project/assets/logo.png` also hits the 256 KiB cap on every `get_file` read (`truncated: true`); the existing synced copy (310,695 bytes, obtained via an earlier fallback pull) was reused as-is rather than overwritten with truncated bytes — content presumed unchanged (not flagged in the diff, no logo edits described). Use the Chrome "Export → Project HTML (.zip)" fallback per `references/designsync-tool.md` if a future pass needs the three still-missing uploads.

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
legacy-sports-homepage/project/uploads/pasted-1785899843286-0.png
```

## Next step

Locally: implement the no-current-matchup state in `lib/shared-components/src/features/home/HomeScreen.tsx` (and mobile equivalent) for both hero cards built under LS-9034/LS-9035. A follow-up implementation ticket will be filed once this sync PR merges, referencing the exact CSS/markup diff captured above.
