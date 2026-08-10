# Sync Report — Profile Settings

- **Design id**: `profile-settings-2026-05-26`
- **Slug**: `legacy-sports-profile-settings`
- **Title**: Legacy Sports Profile Settings
- **Status**: active
- **Source**: `designsync-local` — DesignSync MCP tool, project `b8ccd637-83f4-481b-93ba-281e9680ba4f`
- **Synced at**: 2026-08-09T23:24:42.000Z
- **Bundle hash**: `sha256-181ef058f755d29ce73c43bcb07b956f4019012df7bcc09e07063020f535fc6d`
- **File count**: 20
- **Jira ticket**: LS-9219

## What changed vs the previous sync (LS-8972, `sha256-f8f29079116f7e827980aa768b6e1db4635c107ed835e72a0e51e1e011281b71`)

Follow-up to LS-9023 (loading skeleton + empty state artboards), completed directly in a human-led Claude Design session:

- **New file `ProfileStates.jsx`**: adds `ProfileSettingsSkeleton`, `PublicProfileEmpty`, and a `ShimmerNote` helper.
  - The loading skeleton renders the **actual** `<ProfileSettings/>` component tree inside a `.lg-skeleton` wrapper, so card order, heights, wrap points, and container-query behavior match the populated state exactly by construction — only the paint is blanked (text runs become per-rendered-line bars sized in `lh` units; icons/avatars/switches/buttons/chips become flat fills).
  - Shimmer animation is documented but not implemented, per the AC: a hidden `<ShimmerNote/>` element emits a real HTML comment into the DOM (`<!-- shimmer: 1.5s ease-in-out infinite · ... · disabled under prefers-reduced-motion -->`).
  - The empty state (`PublicProfileEmpty`) covers both the owner view (CTA to enable a section, suggested-sections chips) and the visitor view (no settings CTA), sharing the hero shell so the page never collapses to nothing.
- **`Profile Settings.html`**: added a new `<DCSection id="loading-empty">` with 5 new artboards (`state-skeleton`, `state-skeleton-mobile`, `state-empty-owner`, `state-empty-visitor`, `state-empty-mobile`) and a `<script>` tag loading the new `ProfileStates.jsx`.
- **`styles.css`**: added the `.lg-skeleton` rule block (per-selector last-line-width custom properties for varied bar lengths, icon/avatar/switch/button flat-fill overrides) and the `.lg-empty` rule block (dashed-border card, icon badge, suggested-section chips, CTA row).
- **`Icons.jsx`, `ProfileSettings.jsx`, `PublicProfileHero.jsx`, `BreakpointFrame.jsx`**: reformatted from multi-line JSX to condensed single-line JSX by the Claude Design session's own tooling — content/behavior unchanged, whitespace-only diff.
- **Icon SVGs** (`award`, `bell`, `draft`, `league`, `live`, `scoreboard`, `secure`, `trophy`): trailing-newline-only diff, no visual change.
- **`design-canvas.jsx`, `assets/colors_and_type.css`**: unchanged (byte-identical), not rewritten.

## Skipped

- **`assets/logo.png`**: `get_file` returned `truncated: true` (hit the 256 KiB cap). Reused the existing tracked copy rather than write a corrupted file — the logo is not part of this session's scope (only `ProfileStates.jsx` was added) and is extremely unlikely to have changed. If a future sync needs to verify/update it, use the Chrome Export → Project HTML .zip fallback per `designsync-tool.md`.
- **`_ds/legacy-sports-design-system-670f7892-.../`**: present in the project's file listing but is the linked shared Design System project's own files (fonts, ui_kits, colors_and_type.css, `_ds_bundle.js`/`_ds_manifest.json`), not this bundle's content — excluded, matching the existing bundle's scope.
- **`.thumbnail`**: internal Claude Design thumbnail, not bundle content — excluded.

## Notes

- No `chats/` transcript exists for this bundle (added via manual local sync originally, not `/sync-designs`) — pre-existing gap, unrelated to this sync.
- All fetched content re-verified against the AC in LS-9023: shimmer annotated via HTML comment (not implemented), skeleton geometry matches the populated `pub-mixed` state 1:1 by construction, empty state covers zero-sections-enabled for both owner and visitor.
