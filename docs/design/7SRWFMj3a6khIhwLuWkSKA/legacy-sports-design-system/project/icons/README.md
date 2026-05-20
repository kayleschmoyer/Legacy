# Iconography

## Brand SVG set (`icons/brand/`)

Sport-themed glyphs redrawn from `shared-components/src/components/icons/BrandIcon.tsx`. **32×32 viewBox, 1.8px stroke, two-tone.** Primary stroke is `#DEE6FF` (--fg2); accent is `#C5A55A` (gold) or `#C41E3A` (seam red).

The full library has ~80 glyphs. These 16 cover 90% of product surfaces:

| File               | When to use                                              |
| ------------------ | -------------------------------------------------------- |
| `baseball.svg`     | Sport picker, baseball content                           |
| `football.svg`     | Sport picker (coming soon)                               |
| `stats.svg`        | Player stats, bar charts                                 |
| `draft.svg`        | Draft board, draft CTA                                   |
| `live.svg`         | Live game / live draft indicator (paired with red pulse) |
| `trophy.svg`       | Championship, season results                             |
| `matchup.svg`      | Matchup view, head-to-head                               |
| `roster.svg`       | My team, lineup                                          |
| `standings.svg`    | League standings                                         |
| `league.svg`       | League home, league card                                 |
| `commissioner.svg` | Commissioner tools (gavel)                               |
| `scoreboard.svg`   | Scoreboard page                                          |
| `secure.svg`       | Shield with check — auth / privacy                       |
| `award.svg`        | Medal — weekly awards                                    |
| `bell.svg`         | Notifications                                            |
| `zap.svg`          | Instant / fast action                                    |

### Usage

```html
<img src="icons/brand/baseball.svg" width="32" height="32" alt="" />
```

To **recolor**, inline the SVG and swap the stroke attribute, or use a CSS filter. For a 1-color variant, replace `#DEE6FF` / `#C5A55A` / `#C41E3A` with `currentColor`.

## Lucide fallback (CDN)

For generic UI glyphs (arrows, close, search, settings, user, clock, chevrons, menu, etc.) the product uses **Lucide** via `@tamagui/lucide-icons`. In HTML artifacts, reference Lucide via CDN:

```html
<!-- Static SVG — fastest -->
<img
  src="https://unpkg.com/lucide-static@latest/icons/chevron-right.svg"
  width="20"
  height="20"
  alt=""
/>

<!-- Or use the runtime for `currentColor` inheritance: -->
<script src="https://unpkg.com/lucide@latest"></script>
<i data-lucide="chevron-right"></i>
<script>
  lucide.createIcons();
</script>
```

Common Lucide aliases used in product:

- `chevron-left`, `chevron-right`, `chevron-down`, `chevron-up`
- `x` (close), `menu`, `search`, `plus`, `minus`
- `user`, `users`, `settings`, `log-out`
- `clock`, `calendar`, `filter`, `arrow-right`
- `check`, `alert-circle`, `info`, `help-circle`
- `eye`, `eye-off`, `lock`, `unlock`

Match Lucide stroke (2px) visually — no need to adjust.

## Rules

- **No emoji.** Ever.
- **No PNG icons.** Always SVG.
- **No hand-rolled SVG outside the BrandIcon style.** If you need a sport glyph not in the set, read the source `BrandIcon.tsx` and port it — don't invent.
- **Size:** 16px (inline), 20px (nav), 24px (buttons), 32px (feature cards), 44+ (hero illustrations).
- **Color:** Default to `currentColor` when inlined. Accent stays gold or seam-red; never swap roles.
- **No icons inside paragraph text.** Icons belong in chrome (nav, buttons, status chips, metadata rows), not inside prose.
