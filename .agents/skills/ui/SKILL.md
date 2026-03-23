---
name: ui
description: 'Brand colors and UI component standards — load when creating/styling components, choosing colors, layout patterns, or reviewing visual changes.'
---

# UI Skill

Load this skill when creating or styling UI components, choosing colors, working with layout patterns, or reviewing visual changes.

## Critical Rule

**NEVER use raw Tamagui blue tokens** (`$blue9`, `$blue10`, `$blue11`, `theme="blue"`, etc.) — they produce generic Tailwind blue that violates the brand identity. Always use brand color constants from `apps/web/src/constants/colors.ts`.

## Brand Color Quick Reference

| Constant           | Hex       | Primary use                          |
| ------------------ | --------- | ------------------------------------ |
| `BRAND_NAVY`       | `#1B3A5C` | Hover/darker interactive state       |
| `BRAND_NAVY_LIGHT` | `#2C4A7C` | Primary interactive bg, borders      |
| `BRAND_NAVY_DARK`  | `#143050` | Press/active state                   |
| `BRAND_GOLD_LIGHT` | `#D4BB78` | Accent text, badges, active tab text |
| `BRAND_GOLD`       | `#C5A55A` | Strong accent text, headings         |
| `BRAND_SEAM_RED`   | `#C41E3A` | Destructive, error, highlight        |

Import from `apps/web/src/constants/colors.ts` (adjust relative path to file depth). Use `withAlpha(BRAND_NAVY_LIGHT, opacity)` for tinted surfaces/borders.

## Tamagui Patterns

- **Layout**: `XStack` (row), `YStack` (column). Spacing via tokens (`$2`, `$4`, `$6`).
- **Interactive cards**: `animation: 'quick'`, `pressStyle: { scale: 0.98 }`, `hoverStyle` for border/bg changes.
- **Glassmorphism headers**: `position: 'sticky'`, `top: NAV_HEIGHT_PX`, `zIndex: CONTENT_STICKY_Z_INDEX`, `backgroundColor: '$background075'`, `backdropFilter: 'blur(12px)'`. Import constants from `../../constants/dimensions`.
- **Responsiveness**: Use `$sm`, `$md` breakpoint keys. Test on small screens.
- **Icons**: `@tamagui/lucide-icons` — pass brand hex constants to `color` prop directly.

## Component Checklist

- Accessibility: interactive elements have accessible labels/roles
- Responsiveness: tested with `$sm` variants
- Type safety: strict Props interfaces, no `any`
- Performance: `fetchPolicy: 'cache-and-network'` for frequently-updated lists
- Colors: all color values come from `colors.ts` constants (no raw tokens, hex literals, or Tailwind classes)

## Detailed References

- **[references/brand-colors.md](references/brand-colors.md)** — full brand palette, token mapping table, import paths, usage examples, semantic color rules
- **[references/styling-guide.md](references/styling-guide.md)** — Tamagui styling patterns, glassmorphism, interactive cards, gradients, layout best practices
- **[references/websocket-refetch-ux.md](references/websocket-refetch-ux.md)** — prevent full-page content flash when Apollo queries are refetched via WebSocket events; loading guard patterns, background refresh tracking, subtle update indicators
