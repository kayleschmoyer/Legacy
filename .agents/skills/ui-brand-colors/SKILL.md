---
name: ui-brand-colors
description: 'Enforce Legacy Sports brand color palette whenever adding or editing UI components in apps/web or apps/app. NEVER use raw Tailwind $blue tokens, arbitrary hex values, or inline rgba(). Always import from apps/web/src/constants/colors.ts. Load this skill before any UI work involving colors, buttons, badges, or highlights.'
---

# UI Brand Colors

**Always load this skill before writing or reviewing any UI component colors.**

## The Problem

Legacy Sports has a heritage brand identity. Raw Tamagui `$blue9`/`$blue10`/`$blue11` tokens produce generic Tailwind blue — do NOT use them.

## Brand Palette

| Constant           | Hex       | Use for                                                          |
| ------------------ | --------- | ---------------------------------------------------------------- |
| `BRAND_NAVY`       | `#1B3A5C` | Hover/darker interactive state                                   |
| `BRAND_NAVY_LIGHT` | `#2C4A7C` | Primary interactive bg (buttons, active tabs, spinners, borders) |
| `BRAND_NAVY_DARK`  | `#143050` | Press/active state                                               |
| `BRAND_GOLD_LIGHT` | `#D4BB78` | Accent text, section labels, "YOU" badges, active tab text       |
| `BRAND_GOLD`       | `#C5A55A` | Strong accent text, headings                                     |
| `BRAND_SEAM_RED`   | `#C41E3A` | Destructive, error, highlight                                    |

All live in `apps/web/src/constants/colors.ts`.

## Token Mapping (replace these)

| Old Tamagui token          | Replace with                                                  |
| -------------------------- | ------------------------------------------------------------- |
| `$blue9`                   | `BRAND_NAVY_LIGHT`                                            |
| `$blue10` (bg/spinner)     | `BRAND_NAVY_LIGHT`                                            |
| `$blue10` (text)           | `BRAND_GOLD_LIGHT`                                            |
| `$blue11` (text)           | `BRAND_GOLD_LIGHT`                                            |
| `$blue12` (text)           | `BRAND_GOLD`                                                  |
| `$blue8` (border/active)   | `BRAND_NAVY_LIGHT`                                            |
| `$blue7` (border)          | `withAlpha(BRAND_NAVY_LIGHT, 0.5)`                            |
| `$blue6` (subtle border)   | `withAlpha(BRAND_NAVY_LIGHT, 0.35)`                           |
| `$blue4` (surface tint)    | `withAlpha(BRAND_NAVY_LIGHT, 0.25)`                           |
| `$blue3` (selected bg)     | `withAlpha(BRAND_NAVY_LIGHT, 0.18)`                           |
| `$blue2` (info bg)         | `withAlpha(BRAND_NAVY_LIGHT, 0.12)`                           |
| `$blue1` (subtle bg)       | `withAlpha(BRAND_NAVY_LIGHT, 0.06)`                           |
| `var(--blue10)` (icon CSS) | `BRAND_NAVY_LIGHT` or `BRAND_GOLD_LIGHT` depending on context |

## Correct Import

```ts
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  withAlpha,
} from '../../constants/colors'; // adjust relative path to file depth
```

Path is relative to the file being edited:

- `apps/web/src/components/*.tsx` → `'../constants/colors'`
- `apps/web/src/components/matchup/*.tsx` → `'../../constants/colors'`
- `apps/web/src/pages/baseball/*.tsx` → `'../../constants/colors'`
- `apps/web/src/features/**/*.tsx` → `'../../constants/colors'`

## Usage Examples

### styled() component

```tsx
const PrimaryButton = styled(Button, {
  backgroundColor: BRAND_NAVY_LIGHT, // ✅ not '$blue9'
  hoverStyle: { backgroundColor: BRAND_NAVY },
  pressStyle: { backgroundColor: BRAND_NAVY_DARK },
});
```

### JSX prop

```tsx
<Text color={BRAND_GOLD_LIGHT}>Active</Text>        // ✅ not color="$blue11"
<Button backgroundColor={BRAND_NAVY_LIGHT}>CTA</Button>
<Spinner color={BRAND_NAVY_LIGHT} />
```

### Tinted surfaces / borders

```tsx
<Card
  backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)} // ✅ not '$blue2'
  borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.5)} // ✅ not '$blue7'
/>
```

### Active tab underline

```tsx
borderBottomColor={isActive ? BRAND_NAVY_LIGHT : 'transparent'}
color={isActive ? BRAND_GOLD_LIGHT : '$textMuted'}
```

## Icons

For icon `color` in JSX (which takes a CSS string), pass the hex constant directly:

```tsx
<Zap size={22} color={BRAND_NAVY_LIGHT} />          // bg icons
<Share2 size={16} color={BRAND_GOLD_LIGHT} />       // text-adjacent icons
```

## Never Do

```tsx
// ❌ Generic Tamagui blue tokens
backgroundColor: '$blue9';
color = '$blue11';

// ❌ Tamagui theme prop — applies generic blue palette to interactive elements
theme = 'blue'; // use backgroundColor={BRAND_NAVY_LIGHT} + pressStyle/hoverStyle instead

// ❌ Inline hex that isn't a defined constant
backgroundColor = '#3B82F6';

// ❌ Tailwind class names
className = 'text-blue-500';
```

## Semantic Color Rules

- **Primary CTA buttons** → `BRAND_NAVY_LIGHT` bg, white text
- **Active nav item** → `BRAND_NAVY_LIGHT` border underline, `BRAND_GOLD_LIGHT` text
- **"Your team" row highlight** → `withAlpha(BRAND_NAVY_LIGHT, 0.18)` bg
- **Info/instruction cards** → `withAlpha(BRAND_NAVY_LIGHT, 0.12)` bg
- **Accent labels ("YOU", season badge, counts)** → `BRAND_GOLD_LIGHT` text
- **Spinners** → `BRAND_NAVY_LIGHT`
- **Copy/action buttons** → `BRAND_NAVY_LIGHT` bg (with `$green9` for confirmed state)
