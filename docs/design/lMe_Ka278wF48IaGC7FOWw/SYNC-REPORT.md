# Sync report: Scoreboard Page

**Design ID**: `lMe_Ka278wF48IaGC7FOWw`
**Source**: DesignSync (local), projectId `019dd0ef-060e-7d50-8ac5-d5313459be01`
**Synced at**: 2026-08-04T11:20:00.000Z
**Bundle hash**: `666df2e245f355b077f667dc29f3e7be6237d935dac2698b056ac9e9567fd93b`
**Files**: 41
**Total size**: 1379422 bytes

## What changed (LS-8971 — re-run against updated PROMPT.md brief)

Fixed at the source (Claude Design project), then re-pulled — this bundle reflects the corrected project, not a local patch:

- **Off-palette NFL turf greens removed** (`#1F5A3A` / `#2D6A4F` / `#143824`). brand.md authorizes exactly one interactive/selected hue (brand-navy); no per-sport accent exists (confirmed no such ruling landed on LS-9004). NFL now shares the same navy team-mark, selected-pill, and section-breakdown treatment as MLB — sport identity carries via the status-line tag, inline glyph, and NFL-only fields (down/distance, possession dot) instead.
- **JetBrains Mono dropped**. The self-hosted DS `colors_and_type.css` no longer `@import`s JetBrains Mono from Google Fonts; `--font-mono` falls back to the OS monospace stack so tabular stat numerals still align without a third custom typeface.
- **Fonts moved to Google Fonts CDN**. Big Shoulders Display + Literata now load via `<link>` tags in `scoreboard.html`'s `<head>` (PROMPT.md mandate) instead of self-hosted `@font-face` + bundled woff2 files; the DS CSS's `@font-face` blocks were removed.
- **Banned light-theme override removed**. `colors_and_type.css`'s `.theme-light` / `[data-theme='light']` block is gone — the app is dark-mode only.
- **Raw hex outside `:root` tokenized**. All raw hex literals in the mockup (`#2C4A7C` ×5, plus `#C41E3A`, `#C5A55A`, `#0D1526`, `#2D6A4F` in the inline SVG glyphs/illustrations) now reference CSS custom properties via inline `style` attributes.
- **Div-grid stat rows converted to a real `<table>`** (`sb-score-table`): the team|score rows per game card were a div grid despite being genuinely tabular data; they're now `<tr>`/`<td>` markup. The linescore was already a real `<table>` and is unchanged.
- **Stale duplicate `scoreboard v1.html` deleted** at the source — `scoreboard.html` is the sole canonical mockup file.
- **Postponed section added**, reconciling code shipped since the original mockup (`partitionScoreboardGames` splits Postponed from Upcoming, LS-4838): one MLB rainout example, sport-generic card/section chrome.
- **Breakpoints remapped to the 7 canonical bands** (xxs/xs/sm/md/lg/xl/xxl — 0/660/800/860/980/1120/1280) from PROMPT.md; the invented viewport-switcher widths (375/768/1024/1280/1440) and container-query thresholds (800/540/420) are gone. Adjacent bands that don't change layout are annotated as sharing one, per the brief's "annotate the coverage" allowance.
- **HANDOFF comment block added** at the top of `scoreboard.html`, documenting key decisions (including the deliberate NFL-vision-ahead-of-code stance and the Error/Empty/No-data button-row gap vs. shipped code) plus `COMPONENT:` annotations for `sb-score-table` / `sb-linescore-table`.
- **Preserved deliberately, not watered down**: the full NFL roadmap surface (down & distance, possession indicator, quarter linescores, per-team records) stays exactly as designed, even though shipped code only has the LS-4584 "NFL scoreboard coming soon" placeholder — this mockup is the roadmap that placeholder stands in for.
- Real historical MLB franchises (LAD/NYY/BOS/etc.) as representative data — allowed per the LS-9004 ruling for player/stat/scoreboard surfaces; no change needed.

## All files

```
scoreboard-page/README.md
scoreboard-page/chats/chat1.md
scoreboard-page/chats/chat2.md
scoreboard-page/project/ds/colors_and_type.css
scoreboard-page/project/ds/fonts/Big-Shoulders-Display-normal-600-latin-ext.woff2
scoreboard-page/project/ds/fonts/Big-Shoulders-Display-normal-600-latin.woff2
scoreboard-page/project/ds/fonts/Big-Shoulders-Display-normal-600-vietnamese.woff2
scoreboard-page/project/ds/fonts/Big-Shoulders-Display-normal-700-latin-ext.woff2
scoreboard-page/project/ds/fonts/Big-Shoulders-Display-normal-700-latin.woff2
scoreboard-page/project/ds/fonts/Big-Shoulders-Display-normal-700-vietnamese.woff2
scoreboard-page/project/ds/fonts/Big-Shoulders-Display-normal-800-latin-ext.woff2
scoreboard-page/project/ds/fonts/Big-Shoulders-Display-normal-800-latin.woff2
scoreboard-page/project/ds/fonts/Big-Shoulders-Display-normal-800-vietnamese.woff2
scoreboard-page/project/ds/fonts/Literata-italic-400-cyrillic-ext.woff2
scoreboard-page/project/ds/fonts/Literata-italic-400-cyrillic.woff2
scoreboard-page/project/ds/fonts/Literata-italic-400-greek-ext.woff2
scoreboard-page/project/ds/fonts/Literata-italic-400-greek.woff2
scoreboard-page/project/ds/fonts/Literata-italic-400-latin-ext.woff2
scoreboard-page/project/ds/fonts/Literata-italic-400-latin.woff2
scoreboard-page/project/ds/fonts/Literata-italic-400-vietnamese.woff2
scoreboard-page/project/ds/fonts/Literata-normal-400-cyrillic-ext.woff2
scoreboard-page/project/ds/fonts/Literata-normal-400-cyrillic.woff2
scoreboard-page/project/ds/fonts/Literata-normal-400-greek-ext.woff2
scoreboard-page/project/ds/fonts/Literata-normal-400-greek.woff2
scoreboard-page/project/ds/fonts/Literata-normal-400-latin-ext.woff2
scoreboard-page/project/ds/fonts/Literata-normal-400-latin.woff2
scoreboard-page/project/ds/fonts/Literata-normal-400-vietnamese.woff2
scoreboard-page/project/ds/fonts/Literata-normal-600-cyrillic-ext.woff2
scoreboard-page/project/ds/fonts/Literata-normal-600-cyrillic.woff2
scoreboard-page/project/ds/fonts/Literata-normal-600-greek-ext.woff2
scoreboard-page/project/ds/fonts/Literata-normal-600-greek.woff2
scoreboard-page/project/ds/fonts/Literata-normal-600-latin-ext.woff2
scoreboard-page/project/ds/fonts/Literata-normal-600-latin.woff2
scoreboard-page/project/ds/fonts/Literata-normal-600-vietnamese.woff2
scoreboard-page/project/ds/icons/baseball.svg
scoreboard-page/project/ds/icons/live.svg
scoreboard-page/project/ds/icons/scoreboard.svg
scoreboard-page/project/ds/logo.png
scoreboard-page/project/scratch/mockups/scoreboard.html
scoreboard-page/project/uploads/PROMPT.md
scoreboard-page/project/uploads/scoreboard.md
```

Note: the DS font woff2 files above are now unused by the mockup (fonts load from Google Fonts CDN instead) but were left in place rather than deleted, since they're harmless orphaned assets and deleting 25 files was judged out of scope for this fix.
