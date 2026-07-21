---
name: ui
description: 'Theme tokens and UI component standards — load when creating/styling components, choosing colors, layout patterns, or reviewing visual changes. Both light and dark themes are supported on every page.'
metadata:
  scope: 'apps/web/**, apps/app/**, lib/shared-components/**'
---

# UI Skill

Load this skill when creating or styling UI components, choosing colors, working with layout patterns, or reviewing visual changes.

## Critical Rules

1. **Both themes are supported on every page** (product decision, epic LS-8518). The app resolves `system | light | dark` per user (web `ThemeContext` + native `ThemeContext`, server-synced). Never hardcode a palette value — a hex like `#0A0F1A` or `#F8FAFC` renders identically in both themes and breaks one of them.
2. **All colors come from Tamagui theme tokens** (`$surfaceCard`, `$brandNavy`, `$textMuted`, …). Tokens resolve per active theme; raw hex/rgba do not.
3. **NEVER use raw Tamagui blue tokens** (`$blue1`–`$blue12`, `theme="blue"`) — they render generic Tailwind blue and violate the brand. Use `$brandNavy*` / `$brandGold*` tokens (mapping table in [references/brand-colors.md](references/brand-colors.md)).
4. **The theme-compliance ratchet gates CI** (`make lint-theme-compliance`, LS-8519). Any PR that increases hardcoded-color counts fails `custom-checks`. If you reduce counts, run `make update-theme-baseline` and commit the baseline in the same PR.
5. **Do not add usages of the legacy constants files** — `apps/web/src/constants/colors.ts` and `lib/shared-components/src/utils/colors.ts` are dark-only and being retired (LS-8526). Never re-declare `const BRAND_* = '#...'` locally.

## Theme Token Quick Reference

All defined in `lib/tamagui-config` for **both** `brandDark` and `brandLight`:

| Need                                     | Token                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Page background / text                   | `$background`, `$color`                                                                                       |
| Surface tiers (subtle → panel → card)    | `$surfaceSubtle`, `$surfacePanel`, `$surfaceCard`                                                             |
| Borders                                  | `$surfacePanelBorder`, `$outlineSubtle`, `$outlineStrong`, `$borderColor`                                     |
| Text tiers                               | `$color12` (high contrast), `$color` (primary), `$textMuted`, `$textOnAccent`, or `$fg1`–`$fg4`/`$fgOnAccent` |
| Primary interactive (buttons, selected)  | `$brandNavyLight` bg, `$brandNavy` hover, `$brandNavyDark` press                                              |
| Accent text/badges (earned moments only) | `$brandGoldLight`, `$brandGold`                                                                               |
| Destructive / error / losing             | `$brandSeamRed`, `$brandSeamRedDark` press                                                                    |
| Tinted interactive surfaces              | `$surfaceInteractive`, `$accentMuted`, `$successMuted`, `$warningMuted`                                       |
| Glassmorphism                            | `$background075`, `$glassSurface`, `$glassBorder`, `$glassBorderHover`                                        |
| Position colors                          | `$positionPitcher`, `$positionCatcher`, `$positionInfield`, `$positionOutfield`, `$positionUtility`           |
| Focus ring                               | `$focusRing`                                                                                                  |
| Status badges (StatusBadge variant map)  | `$status{Info,Success,Warning,Danger,Neutral,Accent}{Bg,Fg,Border}`                                           |

## Raw-CSS Strings (gradients, box-shadows, canvas)

When a prop genuinely needs a CSS string a token can't fill:

- **Web:** use CSS variables — Tamagui emits every token as `var(--tokenName)`, which stays theme-aware: `background: 'linear-gradient(135deg, var(--surfacePanel), var(--brandNavy))'`. In `.css` files, same pattern (see `elite-draft/styles.ts` for the `var(--token, fallback)` form).
  - ⚠️ **Never on an animated component.** If the element has an `animation` (or `animateOnly`) prop, a `var(--token)` colour **crashes the page at runtime**: Tamagui's react-native animation driver interpolates colours through RN's normalizer, which can't parse a CSS custom property, returns `null`, then `.map`s it. Build, typecheck and lint all stay green — it only fails in the browser. Use token props there instead:

    ```tsx
    // ✅ animated → $token props
    <YStack animation="quick" backgroundColor="$surfaceCard"
            hoverStyle={{ backgroundColor: '$color4' }} />

    // ❌ animated + var() → TypeError: Cannot read properties of null (reading 'map')
    <YStack animation="quick" style={{ background: 'var(--surfaceCard)' }} />
    ```

    A `var(--token)` on a _child_ of an animated component, or on any non-animated element, is fine. Enforced by `make lint-animated-theme-vars` (LS-8554).

- **Native:** no CSS vars — use `useThemeTokens()` from `@legacy-sports/shared-components/ui` to resolve raw values for the active theme at render time:

  ```tsx
  import { useThemeTokens } from '@legacy-sports/shared-components/ui';

  const { surface, text, shadows } = useThemeTokens();
  <View
    style={{ backgroundColor: surface.surfaceCard, shadowColor: text.fg1 }}
  />;
  ```

  Prefer a token prop wherever one exists — reach for `useThemeTokens()` only when the prop genuinely needs a raw value (gradient stops, native shadow objects, canvas).

- Never build the string from hex constants.

## Tamagui Patterns

- **Layout**: `XStack` (row), `YStack` (column). Spacing via tokens (`$2`, `$4`, `$6`).
- **Interactive cards**: `animation: 'quick'`, `pressStyle: { scale: 0.98 }`, `hoverStyle` for border/bg changes (tokens only).
- **Glassmorphism headers**: `position: 'sticky'`, `top: NAV_HEIGHT_PX`, `zIndex: CONTENT_STICKY_Z_INDEX`, `backgroundColor: '$background075'`, `backdropFilter: 'blur(12px)'`. Import constants from `../../constants/dimensions`.
- **Responsiveness**: Use `$sm`, `$md` breakpoint keys. Test on small screens.
- **Icons**: `@tamagui/lucide-icons` accepts theme tokens — `<Zap color="$brandNavyLight" />`. Never pass hex.
- **Forced theme**: never wrap a page in `<Theme name="dark">` / `"legacy_dark"` to sidestep theming — that ships a dark island into light mode (being removed under LS-8530).

## Component Checklist

- Both themes: verify in light AND dark (Storybook ThemeGallery, or toggle in-app preferences)
- Accessibility: interactive elements have accessible labels/roles
- Responsiveness: tested with `$sm` variants
- Type safety: strict Props interfaces, no `any`
- Performance: `fetchPolicy: 'cache-and-network'` for frequently-updated lists
- Colors: theme tokens only — no raw tokens' hex, no `$blue*`, no Tailwind classes, no `withAlpha(HEX_CONSTANT, …)`

## Detailed References

- **[references/brand-colors.md](references/brand-colors.md)** — full token palette, `$blue*` → brand-token replacement table, semantic usage rules
- **[references/styling-guide.md](references/styling-guide.md)** — Tamagui styling patterns, glassmorphism, interactive cards, gradients, layout best practices
- **[references/websocket-refetch-ux.md](references/websocket-refetch-ux.md)** — prevent full-page content flash when Apollo queries are refetched via WebSocket events
