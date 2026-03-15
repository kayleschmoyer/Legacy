---
applyTo: 'apps/web/**/*.tsx'
---

# UI Brand Colors

**Prefer Tamagui theme `$tokenName` values for component props.** Use the brand color constants from `apps/web/src/constants/colors.ts` only for raw hex/rgba values in CSS strings (gradients, box-shadows) or when no suitable theme token exists. Never use arbitrary hex values or inline `rgba()`.

## Brand Palette

| Constant           | Hex       | Use for                                            |
| ------------------ | --------- | -------------------------------------------------- |
| `BRAND_NAVY`       | `#1B3A5C` | Hover/darker interactive state                     |
| `BRAND_NAVY_LIGHT` | `#2C4A7C` | Primary interactive bg (buttons, tabs, spinners)   |
| `BRAND_NAVY_DARK`  | `#143050` | Press/active state                                 |
| `BRAND_GOLD_LIGHT` | `#D4BB78` | Accent text, labels, "YOU" badges, active tab text |
| `BRAND_GOLD`       | `#C5A55A` | Strong accent text, headings                       |
| `BRAND_SEAM_RED`   | `#C41E3A` | Destructive, error, highlight                      |

## Token Replacement

| Old token                | Replace with                        |
| ------------------------ | ----------------------------------- |
| `$blue9`, `$blue10` bg   | `BRAND_NAVY_LIGHT`                  |
| `$blue10`–`$blue12` text | `BRAND_GOLD_LIGHT` or `BRAND_GOLD`  |
| `$blue7` border          | `withAlpha(BRAND_NAVY_LIGHT, 0.5)`  |
| `$blue3` selected bg     | `withAlpha(BRAND_NAVY_LIGHT, 0.18)` |
| `$blue2` info bg         | `withAlpha(BRAND_NAVY_LIGHT, 0.12)` |

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
} from '../../constants/colors'; // adjust relative path
```

## Never Do

```tsx
backgroundColor: '$blue9'; // ❌ Generic Tamagui blue
backgroundColor = '#3B82F6'; // ❌ Inline hex
className = 'text-blue-500'; // ❌ Tailwind class
```
