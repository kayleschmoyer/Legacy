# Sync report: Homepage

**Design ID**: `nxFiEGqu3yPCDKpoNDmQWA`
**Source**: `designsync-local` (DesignSync MCP tool, projectId `714ce35a-d395-4e13-aadd-8d5d9f021104`)
**Synced at**: 2026-08-10T00:00:00.000Z
**Bundle hash**: `sha256-4242ceaaf43f0ca50d370d380c2f669bdd79c8c8654e3a8d8c4c181e10ad914e`
**Files**: 20

## What changed (LS-9278)

Compared to the immediately-prior pull (LS-9046, hash `sha256-800946e3e8e76a226f245eb0219a1d272ff0bcecef85e3b5b5aab25e3df0762d`):

All changes are confined to `project/scratch/mockups/home.html`, both in the `@container tkhero (max-width: 440px)` block and its `[data-viewport="mobile"]` equivalent (the baseball ticket-hero's narrow-width styling):

- **Action buttons go row, not column**: `.ticket-hero .tk-actions` switches from `flex-direction: column` (buttons stacked, full width) to `flex-direction: row` with `gap: 8px`; `.ticket-hero .tk-btn` switches from `width: 100%` to `flex: 1 1 0; min-width: 0` (equal-flex buttons sharing one row) — matches the new comment: "Actions stay in ONE row (equal-flex) rather than stacking."
- **Tightened vertical rhythm**: `.tk-num` font-size 36px→34px, `.tk-title` 26px→25px, `.tk-sub` 13.5px→13px, `.tk-head` gap 8px→6px with a new `padding-bottom: 12px`, `.tk-meta` gap 7px→6px. New `margin-top` values added to `.tk-actions` (14px), `.tk-meta` (10px), `.tk-sub` (6px), plus new rules for `.tk-hero-grid` (gap 14px), `.tk-hero-score` (padding-top 14px), and `.tk-link` (margin-top 12px) — none of which existed in this breakpoint before.
- Same set of changes duplicated verbatim under `.frame[data-viewport="mobile"]` (the review-bar's simulated-mobile-frame equivalent of the container-query breakpoint).
- **No token changes, no new components, no markup changes** — pure CSS geometry tightening at the narrow band.

All other bundle files (`README.md`, `chats/chat1.md`, `uploads/PROMPT.md`, `uploads/home.md`, the 9 brand icon SVGs, `assets/logo.png`) are byte-identical to the LS-9046 pull — verified via direct content comparison, not just the hash.

## Uploads: now-retrievable (not yet embedded)

Two previously-truncated reference images (`uploads/pasted-1785870995051-0.png`, `uploads/pasted-1785873442793-0.png`) round-tripped successfully this pass (`truncated: false`) but were **not** written into the bundle — they are user-pasted reference material, not referenced by path from `home.html`, and don't block implementation. A future pass can pull them in if needed.

## Gaps carried forward

- `uploads/pasted-1785875517886-0.png` still hits the `get_file` 256 KiB cap (`truncated: true`) — not written to the bundle (the previous truncated copy has also been removed rather than kept, since a truncated PNG is not valid reference material). Not referenced by path from `home.html`.
- `project/assets/logo.png` still hits the 256 KiB cap on every `get_file` read; the existing synced copy is reused as-is (content presumed unchanged — no logo edits described, not flagged in the diff).

## Pages

- `legacy-sports-homepage/project/scratch/mockups/home.html`

## Next step

Implement in this same PR:

1. `LeagueHeroCard`/`TicketButton` narrow-viewport action-button layout in `lib/shared-components/src/features/home/HomeScreen.tsx` — row instead of column below the narrow breakpoint.
2. The home dashboard's `loading` state: replace the bare `Spinner` with a skeleton mirroring the `tpl-returning-loading` geometry from `home.html` (hero card, league-list rows, On This Day rail) — this design was already present in the LS-9046 pull but was never implemented.
