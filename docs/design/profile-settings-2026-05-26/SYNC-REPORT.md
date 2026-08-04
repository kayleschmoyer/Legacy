# Sync Report — Profile Settings

- **Design id**: `profile-settings-2026-05-26`
- **Slug**: `legacy-sports-profile-settings`
- **Title**: Legacy Sports Profile Settings
- **Status**: active
- **Source**: `designsync-local` — DesignSync MCP tool, project `b8ccd637-83f4-481b-93ba-281e9680ba4f`
- **Synced at**: 2026-08-04T15:49:13.000Z
- **Bundle hash**: `sha256-f8f29079116f7e827980aa768b6e1db4635c107ed835e72a0e51e1e011281b71`
- **File count**: 19
- **Jira ticket**: LS-8972

## What changed vs the previous sync (LS-4931, `f9ed551882e3ef4ad53254241adc51ba725ff3f1941f8ecefeae883185be3502`)

Design-source fixes applied directly in the Claude Design project (per LS-8954's audit + the LS-9004 brand ruling), then re-pulled:

- **OAuth branding (LS-9004 ruling — exempt, not banned)**: normalized Discord button/icon treatments to the single canonical vendor blurple `#5865F2` everywhere (previously drifted across three ad hoc tints `#5865f2`/`#6f7afa`/`#aab3ff`); hover state now uses Discord's own documented dark-blurple hover `#4752C4` instead of an invented lighter tint.
- **Light page canvas**: the pan/zoom design-canvas chrome (`design-canvas.jsx`'s `DC` config) and the document-level `html,body` background in `Profile Settings.html` rendered on a light warm-gray `#f0eee9` canvas around the dark product frames — flipped to the canonical dark `BG_PAGE` (`#0A0F1A`) plus matching light-on-dark grid/label/title/subtitle chrome colors and hover treatments (the app is dark-mode only per brand.md).
- **Self-hosted fonts**: replaced ~40 `@font-face` rules pointing at bundled `assets/fonts/*.woff2` with the brief-mandated Google Fonts CDN `@import` for Big Shoulders Display + Literata; deleted the now-unused 30 self-hosted font files from the project.
- **Off-brief third typeface**: removed the JetBrains Mono `@import` and the `--font-mono` token; all four `font-family: var(--font-mono)` usages now use `var(--font-body)` (Literata) with `font-variant-numeric: tabular-nums`, matching the two-typeface brief and the already-fixed Design System bundle.
- **Off-palette hex**: `.lg-card-danger`'s gradient used purple-tinted stops (`#1a1426`/`#3a1320`) instead of a seam-red tone — replaced with a seam-red-based gradient. The `Live` status chip and the connected-session row icon used a generic bright green (`rgba(34,197,94,…)`) instead of the brand's muted turf-green semantic tokens — replaced with `var(--success-soft)`/`var(--success-border)`/`var(--success-fg)` (and the matching raw-rgba equivalents in the `lg-flash` keyframe, which can't take a CSS var). Also tokenized 5 repeated raw-hex gradient stops (`#0e162a`/`#16223a`/`#1b3a5c`, none of which matched the 4-value BG palette exactly) to `var(--surface-subtle)`/`var(--surface-card)`/`var(--brand-navy)`.
- **Light-theme override block**: removed the `.theme-light`/`[data-theme='light']` CSS block from `assets/colors_and_type.css` — banned unconditionally per brand.md regardless of ruling outcomes.
- **Invented breakpoints**: `@container page (max-width: 519px)` merged into the canonical `@container page (max-width: 659px)` (the complement of the 660px `$xs` threshold, already used elsewhere in the same file); `@container page (min-width: 720px)` changed to the canonical `@container page (min-width: 660px)`. All breakpoints in the bundle are now exactly the canonical set (660/860/980, plus their 659/519→659 complement).

## Not fixed here (flagged as a separate follow-up)

- **Missing loading skeleton / empty state**: filed as LS-9023 for human-led pickup — adding new artboards is a creative design addition, not a mechanical DesignSync fix.

## Notes

- No `chats/` transcript exists for this bundle (added via manual local sync originally, not `/sync-designs`) — pre-existing gap, not introduced by this sync.
- Fixes were applied at the source (Claude Design project `b8ccd637-83f4-481b-93ba-281e9680ba4f`) via the DesignSync MCP tool, never by hand-editing `docs/design/`.
