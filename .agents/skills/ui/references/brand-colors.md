---
name: ui-brand-colors
description: 'Use Tamagui theme tokens ($brandNavy, $surfaceCard, $textMuted — not hex constants, raw $blue tokens, or Tailwind classes) when adding or editing UI component colors. Load before any UI work involving colors, buttons, badges, or highlights.'
---

# Brand Colors — Theme Tokens

**Always load this reference before writing or reviewing any UI component colors.**

## The Rules

1. Legacy Sports supports **light and dark themes on every page**. Only Tamagui theme tokens resolve per-theme; any raw hex (`#2C4A7C`), rgba string, or imported hex constant renders the same value in both themes and breaks one of them.
2. Raw Tamagui `$blue1`–`$blue12` and `theme="blue"` render generic Tailwind blue — banned. Use the brand tokens below.
3. The legacy hex-constant files (`apps/web/src/constants/colors.ts`, `lib/shared-components/src/utils/colors.ts`) are dark-only and being retired (LS-8526). **Do not add imports of them**, and never re-declare `const BRAND_* = '#...'` locally — the theme-compliance ratchet (LS-8519) fails CI on new hardcoded colors.

## Brand Token Palette

Every token exists in both `brandDark` and `brandLight` in `lib/tamagui-config` (light theme auto-substitutes AA-contrast variants, e.g. gold desaturates on white):

| Token               | Dark value | Use for                                                          |
| ------------------- | ---------- | ---------------------------------------------------------------- |
| `$brandNavy`        | `#1B3A5C`  | Hover/darker interactive state                                   |
| `$brandNavyLight`   | `#2C4A7C`  | Primary interactive bg (buttons, active tabs, spinners, borders) |
| `$brandNavyDark`    | `#143050`  | Press/active state                                               |
| `$brandGoldLight`   | `#D4BB78`  | Accent text, section labels, "YOU" badges, active tab text       |
| `$brandGold`        | `#C5A55A`  | Strong accent text, headings, trophy states                      |
| `$brandSeamRed`     | `#C41E3A`  | Destructive, error, losing states                                |
| `$brandSeamRedDark` | `#8B1A2B`  | Destructive press state                                          |

Surfaces, text tiers, glass, position colors: see the Quick Reference table in [../SKILL.md](../SKILL.md).

## `$blue*` Replacement Table

| Banned                               | Replace with                                                    |
| ------------------------------------ | --------------------------------------------------------------- |
| `$blue9` / `$blue10` (bg/spinner)    | `$brandNavyLight`                                               |
| `$blue10` / `$blue11` (text)         | `$brandGoldLight`                                               |
| `$blue12` (text)                     | `$brandGold`                                                    |
| `$blue8` (border/active)             | `$brandNavyLight`                                               |
| `$blue7` / `$blue6` (borders)        | `$outlineStrong` / `$outlineSubtle`                             |
| `$blue4` (surface tint)              | `$accentMuted`                                                  |
| `$blue3` (selected bg)               | `$surfaceInteractive`                                           |
| `$blue2` / `$blue1` (info/subtle bg) | `$surfaceInteractive` / `$surfaceSubtle`                        |
| `theme="blue"`                       | `backgroundColor="$brandNavyLight"` + `hoverStyle`/`pressStyle` |
| `var(--blue10)` (CSS strings)        | `var(--brandNavyLight)` or `var(--brandGoldLight)` by context   |

## Usage Examples

### styled() component

```tsx
const PrimaryButton = styled(Button, {
  backgroundColor: '$brandNavyLight', // not '$blue9', not BRAND_NAVY_LIGHT
  hoverStyle: { backgroundColor: '$brandNavy' },
  pressStyle: { backgroundColor: '$brandNavyDark' },
});
```

### JSX props

```tsx
<Text color="$brandGoldLight">Active</Text>
<Button backgroundColor="$brandNavyLight">CTA</Button>
<Spinner color="$brandNavyLight" />
<Zap size={22} color="$brandNavyLight" />   // lucide icons take tokens
```

### Tinted surfaces / borders

```tsx
<Card
  backgroundColor="$surfaceInteractive" // not withAlpha(BRAND_NAVY_LIGHT, 0.18)
  borderColor="$outlineStrong"
/>
```

### Active tab underline

```tsx
borderBottomColor={isActive ? '$brandNavyLight' : 'transparent'}
color={isActive ? '$brandGoldLight' : '$textMuted'}
```

### Raw CSS strings (web only — gradients, shadows)

```tsx
// CSS vars stay theme-aware; hex constants don't.
style={{ background: 'linear-gradient(135deg, var(--surfacePanel), var(--brandNavy))' }}
```

## Never Do

```tsx
backgroundColor: '$blue9'; // generic Tailwind blue
theme = 'blue'; // same
backgroundColor = '#3B82F6'; // raw hex — breaks a theme
color = { BRAND_GOLD_LIGHT }; // dark-only constant — breaks light
const BRAND_NAVY = '#1B3A5C'; // local palette re-declaration
className = 'text-blue-500'; // Tailwind classes
<Theme name="dark">…</Theme>; // forced-dark island (LS-8530)
```

Also brand-banned regardless of mechanism: purple/violet/pink/neon accents, gradient text (`background-clip: text`), accent stripes wider than 1px (see `docs/design/brand.md`).

## Plain-CSS pages (non-Tamagui)

`league-detail-v2` (`apps/web/src/pages/baseball/league-detail-v2/styles.css`) is plain CSS, not Tamagui — it defines its own `--brand-*`/`--fg*`/`--surface-*`/`--outline-*` custom properties scoped to `.ls-root`, with light-theme overrides under `.t_light .ls-root` (`.t_light` is applied to `<html>` by `apps/web/src/context/ThemeContext.tsx`). The light values are sourced from `lib/design-tokens`' `lightSurface`/`lightText` and match the `league-detail-page` design-sync bundle's `.theme-light` override block (`docs/design/qDGBVlOyaV-306Id0kWq0Q/league-detail-page/project/ds/colors_and_type.css`) — do not hand-edit `docs/design/`, but keep this file's light block in sync if a future `/sync-designs` run changes those source values. Any future plain-CSS page following this pattern should scope its dark values to its root class and add a `.t_light <root-class> { ... }` override block the same way, rather than inventing a new theming mechanism.

## Semantic Rules

- **Primary CTA buttons** → `$brandNavyLight` bg, `$textOnAccent` text
- **Active nav item** → `$brandNavyLight` underline, `$brandGoldLight` text
- **"Your team" row highlight** → `$surfaceInteractive` bg
- **Info/instruction cards** → `$surfaceInteractive` bg, `$outlineSubtle` border
- **Accent labels ("YOU", season badge, counts)** → `$brandGoldLight` text
- **Spinners** → `$brandNavyLight`
- **Wins/trophies** → `$brandGold`; **losses/alerts** → `$brandSeamRed`
