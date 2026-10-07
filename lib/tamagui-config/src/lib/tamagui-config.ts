import { createAnimations } from '@tamagui/animations-react-native';
import { config, createGenericFont } from '@tamagui/config';
import {
  brand,
  breakpoints,
  chromeDark,
  chromeLight,
  darkSurface,
  darkText,
  colors as designTokenColors,
  glassDark,
  glassLight,
  leading,
  lightSurface,
  lightText,
  positions,
  positionsLight,
  radii,
  scaleDark,
  scaleLight,
  semantic,
  semanticLight,
  shadowBase,
  shadowsDark,
  shadowsLight,
  spacing,
  typeScale,
  withAlpha,
} from '@legacy-sports/design-tokens';
import {
  createTamagui,
  createTokens,
  type TamaguiInternalConfig,
} from 'tamagui';

// Legacy Sports — Heritage-meets-modern brand themes
// Identity: "Night stadium" dark with vintage sport character
// Baseball: deep navy + seam red + aged gold
// Football: turf green + amber
// Typography: display headings (Big Shoulders Display) + body (Literata) + tabular mono
// All hex/rgba values are sourced from @legacy-sports/design-tokens — the
// single palette source of truth (LS-8525). Keep existing token names for
// full compatibility; ensure AA contrast.

const lightGold = designTokenColors.light.brandGoldOverride;

const brandDark = {
  // Backgrounds — unified deep navy (single source of truth)
  background: darkSurface.bg,
  backgroundHover: darkSurface.bgHover,
  backgroundPress: darkSurface.bgPress,
  backgroundFocus: chromeDark.backgroundFocus,
  backgroundStrong: chromeDark.backgroundStrong,
  backgroundTransparent: withAlpha(darkSurface.bg, 0.85),

  // Surfaces (elevations)
  color1: darkSurface.surfaceSubtle,
  color2: darkSurface.surfacePanel,
  color3: darkSurface.surfaceCard,
  color4: darkSurface.surfaceRaised,
  color5: chromeDark.color5,
  color6: chromeDark.color6,
  color7: chromeDark.color7,
  color8: chromeDark.color8,
  color9: chromeDark.color9,
  color10: darkText.fg4,
  color11: darkText.fg2, // subtle text on dark surfaces
  color12: chromeDark.color12, // high contrast text

  // Extended surfaces for dashboards & roster layouts
  surfacePanel: darkSurface.surfacePanel,
  surfacePanelBorder: darkSurface.panelBorder,
  surfaceCard: darkSurface.surfaceCard,
  surfaceRaised: darkSurface.surfaceRaised,
  surfaceSubtle: darkSurface.surfaceSubtle,
  surfaceInteractive: withAlpha(brand.navy, 0.22),
  accentMuted: withAlpha(brand.navy, 0.3),
  successMuted: chromeDark.successMuted,
  warningMuted: chromeDark.warningMuted,
  errorMuted: withAlpha(brand.seamRed, 0.18),
  outlineSubtle: darkSurface.outlineSubtle,
  outlineDefault: darkSurface.outlineDefault,
  outlineStrong: darkSurface.outlineDefault,
  textMuted: darkText.fg3,
  textOnAccent: darkText.fgOnAccent,
  // Dark text for gold/amber-filled surfaces (buttons, chips) — gold is a
  // mid-light hue in both themes, so this stays constant across themes.
  textOnGold: '#1A1206',
  // Discord's brand blurple — third-party OAuth brand identity, invariant
  // across our app themes.
  discordBlurple: '#5865F2',

  // Text tiers (semantic — cf. Goal #2 in LS-8525)
  fg1: darkText.fg1,
  fg2: darkText.fg2,
  fg3: darkText.fg3,
  fg4: darkText.fg4,
  fgOnAccent: darkText.fgOnAccent,

  // Glass surface tokens — for glassmorphism overlays & cards
  glassSurface: glassDark.surface,
  glassSurfaceLight: glassDark.surfaceLight,
  glassBorder: glassDark.border,
  glassBorderHover: glassDark.borderHover,
  glassTextSubdued: withAlpha(darkText.fg1, 0.65),
  glassTextMuted: withAlpha(darkText.fg1, 0.45),

  // Semi-transparent background — used for glassmorphism sticky headers
  // e.g. `backgroundColor: '$background075'` with `backdropFilter: 'blur(...)'`
  background075: glassDark.surface,

  // Heritage brand accents
  brandNavy: brand.navy, // deep baseball navy
  brandNavyLight: brand.navyLight, // lighter navy for gradients
  brandNavyDark: brand.navyDark, // darker navy for press states
  // Gradient end-stop for surfaceCard -> navy panel gradients (LS-9134).
  // Opaque navy in dark theme (unchanged); in light theme a full-strength
  // navy stop turns the same recipe into a jarring white-to-black-navy
  // block, so this end stops at a soft tint instead.
  cardGradientEnd: brand.navy,
  brandSeamRed: brand.seamRed, // baseball seam red
  brandSeamRedLight: brand.seamRedLight, // lighter seam red for hover/glow
  brandSeamRedDark: brand.seamRedDark, // darker seam red for press states
  brandGold: brand.gold, // aged gold — trophies, pennants, vintage borders
  brandGoldLight: brand.goldLight, // lighter gold for hover
  brandGoldDark: brand.goldDark, // darker gold for press states

  // Text
  color: darkText.fg1,
  colorHover: darkText.fg1Strong,
  colorPress: chromeDark.colorPress,
  colorFocus: darkText.fg1Strong,
  colorTransparent: withAlpha(darkText.fg1, 0.85),

  // Borders
  borderColor: darkSurface.outlineDefault,
  borderColorHover: chromeDark.borderColorHover,
  borderColorPress: chromeDark.borderColorPress,
  borderColorFocus: darkSurface.outlineStrong,

  // Shadows
  shadowColor: withAlpha(shadowBase.dark, 0.6),
  shadowColorHover: withAlpha(shadowBase.dark, 0.7),
  shadowColorPress: withAlpha(shadowBase.dark, 0.5),
  shadowColorFocus: withAlpha(shadowBase.dark, 0.8),

  // Primary (deep navy blue — brand-shifted from generic Tailwind blue)
  ...scaleDark, // blue9 = links/focus, green7 = turf
  red6: brand.seamRed, // seam red (heritage)
  red7: brand.seamRedLight,

  // Status-variant colors — StatusBadge semantic map
  statusInfoBg: semantic.infoSoft,
  statusInfoFg: semantic.infoFg,
  statusInfoBorder: semantic.infoBorder,
  statusSuccessBg: semantic.successSoft,
  statusSuccessFg: semantic.successFg,
  statusSuccessBorder: semantic.successBorder,
  statusWarningBg: semantic.warningSoft,
  statusWarningFg: semantic.warningFg,
  statusWarningBorder: semantic.warningBorder,
  statusDangerBg: semantic.dangerSoft,
  statusDangerFg: semantic.dangerFg,
  statusDangerBorder: semantic.dangerBorder,
  statusNeutralBg: semantic.neutralSoft,
  statusNeutralFg: semantic.neutralFg,
  statusNeutralBorder: semantic.neutralBorder,
  statusAccentBg: semantic.accentSoft,
  statusAccentFg: semantic.accentFg,
  statusAccentBorder: semantic.accentBorder,

  // Sport-specific accents (semantic helpers)
  sportBaseballPrimary: brand.navy, // deep navy
  sportBaseballSecondary: brand.seamRed, // seam red
  sportFootballPrimary: chromeDark.sportFootballPrimary, // turf green
  sportFootballSecondary: chromeDark.sportFootballSecondary, // amber

  // Position colors — baseball-themed
  positionPitcher: positions.pitcher, // seam red — the baseball itself
  positionCatcher: positions.catcher, // steel gray — catcher's gear
  positionInfield: positions.infield, // warm brown — infield dirt
  positionOutfield: positions.outfield, // field green — outfield grass
  positionUtility: positions.utility, // aged gold — versatility/trophy

  focusRing: chromeDark.focusRing,
};

const brandLight = {
  // Backgrounds (neutral warm gray)
  background: lightSurface.bg,
  backgroundHover: lightSurface.bgHover,
  backgroundPress: lightSurface.bgPress,
  backgroundFocus: chromeLight.backgroundFocus,
  backgroundStrong: chromeLight.backgroundStrong,
  backgroundTransparent: withAlpha(lightSurface.bg, 0.85),

  // Surfaces — offset from #FFFFFF background so cards/panels are visually distinct
  color1: lightSurface.surfaceCard,
  color2: lightSurface.surfaceSubtle,
  color3: chromeLight.color3,
  color4: chromeLight.color4,
  color5: chromeLight.color5,
  color6: chromeLight.color6,
  color7: chromeLight.color7,
  color8: lightText.fg4,
  color9: chromeLight.color9,
  color10: chromeLight.color10,
  color11: lightText.fg2, // main text
  color12: lightText.fg1, // strongest text

  // Extended surfaces for dashboards & roster layouts
  surfacePanel: lightSurface.surfacePanel,
  surfacePanelBorder: lightSurface.panelBorder,
  surfaceCard: lightSurface.surfaceCard,
  surfaceRaised: lightSurface.surfaceRaised,
  surfaceSubtle: lightSurface.surfaceSubtle,
  surfaceInteractive: withAlpha(brand.navy, 0.06),
  accentMuted: withAlpha(brand.navy, 0.1),
  successMuted: chromeLight.successMuted,
  warningMuted: chromeLight.warningMuted,
  errorMuted: withAlpha(brand.seamRed, 0.12),
  outlineSubtle: lightSurface.outlineSubtle,
  outlineDefault: lightSurface.outlineDefault,
  outlineStrong: chromeLight.outlineStrong,
  textMuted: lightText.fg3,
  textOnAccent: lightText.fgOnAccent,
  textOnGold: '#1A1206',
  // Discord's brand blurple — third-party OAuth brand identity, invariant
  // across our app themes.
  discordBlurple: '#5865F2',

  // Text tiers (semantic — cf. Goal #2 in LS-8525)
  fg1: lightText.fg1,
  fg2: lightText.fg2,
  fg3: lightText.fg3,
  fg4: lightText.fg4,
  fgOnAccent: lightText.fgOnAccent,

  // Glass surface tokens — for glassmorphism overlays & cards
  glassSurface: glassLight.surface,
  glassSurfaceLight: glassLight.surfaceLight,
  glassBorder: glassLight.border,
  glassBorderHover: glassLight.borderHover,
  glassTextSubdued: withAlpha(lightText.fg1, 0.65),
  glassTextMuted: withAlpha(lightText.fg1, 0.45),

  // Semi-transparent background — used for glassmorphism sticky headers
  // e.g. `backgroundColor: '$background075'` with `backdropFilter: 'blur(...)'`
  background075: glassLight.surface,

  // Heritage brand accents
  brandNavy: brand.navy,
  brandNavyLight: brand.navyLight,
  brandNavyDark: brand.navyDark,
  // See brandDark.cardGradientEnd — soft tint keeps surfaceCard -> navy
  // panel gradients readable instead of resolving to solid dark navy.
  cardGradientEnd: withAlpha(brand.navy, 0.14),
  brandSeamRed: brand.seamRed,
  brandSeamRedLight: brand.seamRedLight,
  brandSeamRedDark: brand.seamRedDark,
  brandGold: lightGold.gold,
  brandGoldLight: lightGold.goldLight,
  brandGoldDark: lightGold.goldDark,

  // Text
  color: lightText.fg1,
  colorHover: chromeLight.colorHover,
  colorPress: lightText.fg2,
  colorFocus: lightText.fg1,
  colorTransparent: withAlpha(lightText.fg1, 0.85),

  // Borders
  borderColor: lightSurface.outlineDefault,
  borderColorHover: chromeLight.borderColorHover,
  borderColorPress: chromeLight.borderColorPress,
  borderColorFocus: lightSurface.outlineStrong,

  // Shadows
  shadowColor: withAlpha(shadowBase.light, 0.12),
  shadowColorHover: withAlpha(shadowBase.light, 0.18),
  shadowColorPress: withAlpha(shadowBase.light, 0.08),
  shadowColorFocus: withAlpha(shadowBase.light, 0.22),

  // Primary (blue)
  ...scaleLight, // blue9 = brand link, green7 = turf
  blue12: lightText.fg1,
  red6: brand.seamRedLight, // seam red (heritage)
  red7: brand.seamRed,

  // Status-variant colors — StatusBadge semantic map
  statusInfoBg: semanticLight.infoSoft,
  statusInfoFg: semanticLight.infoFg,
  statusInfoBorder: semanticLight.infoBorder,
  statusSuccessBg: semanticLight.successSoft,
  statusSuccessFg: semanticLight.successFg,
  statusSuccessBorder: semanticLight.successBorder,
  statusWarningBg: semanticLight.warningSoft,
  statusWarningFg: semanticLight.warningFg,
  statusWarningBorder: semanticLight.warningBorder,
  statusDangerBg: semanticLight.dangerSoft,
  statusDangerFg: semanticLight.dangerFg,
  statusDangerBorder: semanticLight.dangerBorder,
  statusNeutralBg: semanticLight.neutralSoft,
  statusNeutralFg: semanticLight.neutralFg,
  statusNeutralBorder: semanticLight.neutralBorder,
  statusAccentBg: semanticLight.accentSoft,
  statusAccentFg: semanticLight.accentFg,
  statusAccentBorder: semanticLight.accentBorder,

  // Sport-specific accents (semantic helpers)
  sportBaseballPrimary: brand.navy, // deep navy
  sportBaseballSecondary: brand.seamRed, // seam red
  sportFootballPrimary: chromeLight.sportFootballPrimary, // turf green
  sportFootballSecondary: chromeLight.sportFootballSecondary, // amber

  // Position colors — baseball-themed
  positionPitcher: positionsLight.pitcher, // seam red
  positionCatcher: positionsLight.catcher, // steel gray
  positionInfield: positionsLight.infield, // warm brown — dirt
  positionOutfield: positionsLight.outfield, // field green
  positionUtility: positionsLight.utility, // aged gold

  focusRing: chromeLight.focusRing,
};

// Brand fonts (docs/design/brand.md) — Big Shoulders Display for
// display/headings, Literata for body/UI. `face` maps each registered
// weight to the platform font resource:
//   - Web: the CSS `font-family` name declared in `apps/web/public/fonts/fonts.css`.
//   - Native: the name each font is registered under via `expo-font`'s
//     `useFonts()` in `apps/app/src/app/_layout.tsx` (must match exactly).
const headingFont = createGenericFont(
  "'Big Shoulders Display', system-ui, sans-serif",
  {
    face: {
      600: { normal: 'BigShouldersDisplay-SemiBold' },
      700: { normal: 'BigShouldersDisplay-Bold' },
      800: { normal: 'BigShouldersDisplay-ExtraBold' },
    },
  },
);

const bodyFont = createGenericFont(
  "'Literata', Georgia, 'Times New Roman', serif",
  {
    face: {
      400: { normal: 'Literata-Regular', italic: 'Literata-Italic' },
      600: { normal: 'Literata-SemiBold' },
    },
  },
);

// Custom configuration extending the base config
// Extract the base animation definitions from @tamagui/config.
// config.animations may be:
//   1. A driver object: { animations: Record<string, ...>, useAnimations, ... }
//   2. A plain map: Record<string, AnimationDef>
// We handle both shapes to survive Tamagui version changes.
const rawAnimations = config.animations as
  | { animations?: Record<string, unknown> }
  | Record<string, unknown>
  | undefined;

const baseAnimationDefs = ((rawAnimations &&
  'animations' in rawAnimations &&
  typeof rawAnimations.animations === 'object' &&
  rawAnimations.animations) ||
  {}) as Record<string, Record<string, unknown>>;

const animations = createAnimations({
  ...baseAnimationDefs,
  // Enumerate critical animation presets explicitly so they are guaranteed
  // even if baseAnimationDefs extraction silently returns {} on a future
  // Tamagui upgrade. These override base defs with identical values.
  '100ms': {
    type: 'timing' as const,
    duration: 100,
  },
  '75ms': {
    type: 'timing' as const,
    duration: 75,
  },
  // Standings scroll-caption fade-out (LS-10717).
  '150ms': {
    type: 'timing' as const,
    duration: 150,
  },
  '200ms': {
    type: 'timing' as const,
    duration: 200,
  },
  bouncy: {
    type: 'spring' as const,
    damping: 9,
    mass: 0.9,
    stiffness: 150,
  },
  lazy: {
    type: 'spring' as const,
    damping: 18,
    stiffness: 50,
  },
  medium: {
    type: 'spring' as const,
    damping: 15,
    mass: 1,
    stiffness: 120,
  },
  slow: {
    type: 'spring' as const,
    damping: 15,
    stiffness: 40,
  },
  // quick — used by JoinLeagueByCodePage buttons
  quick: {
    type: 'spring' as const,
    damping: 20,
    mass: 1.2,
    stiffness: 250,
  },
  tooltip: {
    type: 'spring' as const,
    damping: 10,
    mass: 0.9,
    stiffness: 100,
  },
  superBouncy: {
    type: 'spring' as const,
    damping: 5,
    mass: 0.7,
    stiffness: 200,
  },
  slowest: {
    type: 'spring' as const,
    damping: 15,
    stiffness: 10,
  },
  quicker: {
    type: 'spring' as const,
    damping: 20,
    mass: 1,
    stiffness: 250,
  },
  quickest: {
    type: 'spring' as const,
    damping: 14,
    mass: 0.1,
    stiffness: 380,
  },
  // "fast" — used by PricingPage toggle/FAQ; not in @tamagui/config defaults
  fast: {
    type: 'timing' as const,
    duration: 150,
  },
});

// Layer the brand spacing/radii scale into Tamagui's internal `$`-token
// scale (LS-9014). Bare `$N` props (padding="$4", borderRadius="$3", etc.)
// resolve against `tokens.space`/`tokens.radius`, not `foundationTokens`
// above — merging (rather than replacing) preserves every key the brand
// scale doesn't define (fractional/negative/11-20/`true` for space; 0,
// 8-12/`true` for radius) via `@tamagui/config`'s defaults. Values already
// created as Tamagui `Variable`s (the untouched keys) are reused as-is by
// `createTokens`/`createVariables`, so only the overridden 1-10/1-7 keys
// get new CSS variable names.
const tokens = createTokens({
  ...config.tokens,
  space: {
    ...config.tokens.space,
    ...spacing,
  },
  radius: {
    ...config.tokens.radius,
    ...radii,
  },
});

// ── Media (breakpoint) config ────────────────────────────────────────────
// Derived from `@legacy-sports/design-tokens` `breakpoints` — the scale the
// design mocks are annotated against — rather than inherited from
// `@tamagui/config`, whose stock values are a different scale entirely
// (LS-9885). Before this, `$md` read as "the design system's md band" and
// silently meant "≤1020"; `$lg` was off by 300px and `$xxl` did not exist.
//
// Bracket conversion: a `breakpoints` value is its band's LOWER bound, while a
// Tamagui `$X` key is a `maxWidth` — it matches its own band and everything
// narrower (the mobile-first cascade). So `$X` ends one pixel below the NEXT
// band's lower bound, which makes `$X` and `$gtX` exact complements. `xxl` is
// the top band and so is a `minWidth` query with no upper bound; there is no
// `gtXxs` or `gtXxl` (Tamagui's first `gt*` key is `gtXs`).
//
// Note that Tamagui's `$`-prop typing is permissive — `$xxl={{ … }}` compiled
// even when no `xxl` media key existed, which is exactly how the old no-op
// trap (LS-9416) went unnoticed. Types are therefore NOT the guard here;
// `tamagui-config.spec.ts` asserts the runtime scale instead.
//
// ⚠️ KEY ORDER IS PRECEDENCE, NOT DECORATION (LS-10095). Tamagui derives a
// media key's importance from its POSITION in this object, never from the
// query widths:
//
//   getMediaKeyImportance = (key) => getConfig().settings.mediaPropOrder
//     ? defaultMediaImportance
//     : mediaKeysOrdered.indexOf(key) + 100;  // mediaKeysOrdered = Object.keys(media)
//   // node_modules/@tamagui/web/dist/cjs/hooks/useMedia.js
//
// Later key = higher index = wins. `settings.mediaPropOrder` is not set
// anywhere in this workspace, so that index path is the live one.
//
// The `maxWidth` bands are strictly NESTED (xxs ⊂ xs ⊂ sm ⊂ md ⊂ lg ⊂ xl), so
// at any phone width several of them match at once and only order decides the
// winner. They are therefore listed DESCENDING (xl → xxs) so the NARROWER band
// sits later and out-ranks the wider one — the mobile-first cascade every call
// site already assumes. This file originally listed them ascending (LS-9895),
// which inverted that: `$sm` out-ranked `$xs`, so the small-phone type and
// spacing step-down in `LeagueDetailShell` was inert at every width.
//
// The `gt*` keys stay ASCENDING, and that is not an inconsistency: they are
// `minWidth` queries, so the nesting runs the other way (gtXl ⊂ gtLg ⊂ … ⊂
// gtXs) and the WIDER band is the more specific one that should win. Both
// halves match stock `@tamagui/config`'s own shape exactly.
//
// So: adding a key means choosing its position deliberately. Appending a new
// `maxWidth` band to the end silently makes it out-rank every narrower band.
// `tamagui-config.spec.ts` pins the relative order so this cannot regress
// behind a comment.
const designTokenMedia = {
  // maxWidth bands — descending, so narrower out-ranks wider.
  xl: { maxWidth: breakpoints.xxl - 1 }, // ≤1279
  lg: { maxWidth: breakpoints.xl - 1 }, // ≤1119
  md: { maxWidth: breakpoints.lg - 1 }, // ≤979
  sm: { maxWidth: breakpoints.md - 1 }, // ≤859
  xs: { maxWidth: breakpoints.sm - 1 }, // ≤799
  xxs: { maxWidth: breakpoints.xs - 1 }, // ≤659
  // Top band — a minWidth query with no upper bound, so it sits outside the
  // maxWidth block and ahead of the `gt*` keys, where it has always been.
  xxl: { minWidth: breakpoints.xxl }, // ≥1280
  // minWidth bands — ascending, so wider out-ranks narrower.
  gtXs: { minWidth: breakpoints.sm }, // ≥800
  gtSm: { minWidth: breakpoints.md }, // ≥860
  gtMd: { minWidth: breakpoints.lg }, // ≥980
  gtLg: { minWidth: breakpoints.xl }, // ≥1120
  gtXl: { minWidth: breakpoints.xxl }, // ≥1280
} as const;

// The staged rollout of this scale (LS-9885) is COMPLETE. Aligning a media key
// changes the width at which every `$token` style prop using it fires, so the
// scale migrated one complementary pair at a time, each slice carrying its own
// call-site audit rather than a mechanical rename:
//
//   LS-9895 — xxs, lg, xl, xxl, gtLg, gtXl    4 sites
//   LS-9896 — md, gtMd + elite-draft convergence   53 sites
//   LS-9897 — xs, gtXs                        17 sites
//   LS-9898 — sm, gtSm                       202 sites (the bulk, landed last)
//
// `designTokenMedia` above is now spread unmodified: there are no stock
// holdouts left, and no `config.media` key is read any more. Three invariants
// govern the scale and all hold as assertions in `tamagui-config.spec.ts`:
//   1. `$X` and `$gtX` always move together. Moving `$sm` to 859 while `$gtSm`
//      stayed at 801 would have made 801–859 match BOTH keys.
//   2. The band scale stays monotonic — reading the bands narrow-to-wide,
//      each `maxWidth` is below the next:
//      xxs 659 < xs 799 < sm 859 < md 979 < lg 1119 < xl 1279 < xxl 1280+.
//      (That is the scale's order, NOT this object's key order — see
//      invariant 3.)
//   3. Key order is precedence (LS-10095): `maxWidth` keys are listed
//      descending so narrower wins, `gt*` keys ascending so wider wins. See
//      the block above `designTokenMedia` for why, and never append a new
//      `maxWidth` band to the end of the object.
//
// Do NOT reintroduce a `sm: config.media.sm`-style override to "fix" a
// surface that looks wrong at a new width — that re-opens the drift this
// ticket closed. Fix the call site against the tier table in
// `.agents/skills/ui/references/responsive-density.md` instead.
const media = {
  ...designTokenMedia,
  // Not a design-token band — a viewport-HEIGHT escape hatch (LS-9900).
  // `DateTimePicker`'s popover-to-Sheet adaptation was gated on `sm`
  // (viewport WIDTH), the wrong axis for "does this floating layer fit on
  // screen": a wide-but-short window (e.g. the web-e2e desktop projects'
  // 1280x720) overflows just as readily as a narrow phone. Realigning `$lg`
  // to 1119 in this file flips the Create League page from stacked to
  // two-column at exactly that 1280px viewport, moving the draft-date
  // trigger low enough that the anchored popover's Apply control opens
  // below the fold — width-gated Sheet adaptation never engages there.
  // 800 clears both real targets: the Mobile Chrome/Safari projects
  // (667px tall) and the desktop projects (720px tall) while staying under
  // typical laptop/desktop viewport heights.
  short: { maxHeight: 800 },
};

// Stock colour palettes no code ever activates as a theme (LS-10784).
// `TamaguiProvider` injects CSS for EVERY theme in the config as one inline
// `<style>` on every page, and each palette carries a full light/dark ×
// alt1/alt2/active × component sub-theme tree (176 themes, ~1.1 MB of CSS
// apiece). No `theme=`/`<Theme name=>` in apps/web, apps/app or
// lib/shared-components — nor any Tamagui component internally — names
// these palettes, so dropping their subtrees changes no rendered style.
// Note this only removes *themes*: `$orange9`-style colour tokens are
// unaffected. Before using one of these palettes as a theme, remove it here.
export const UNUSED_STOCK_THEME_PALETTES = ['orange', 'purple', 'pink'];

export const stockThemes = Object.fromEntries(
  Object.entries(config.themes).filter(
    ([name]) =>
      !name
        .split('_')
        .some((segment) => UNUSED_STOCK_THEME_PALETTES.includes(segment)),
  ),
) as typeof config.themes;

const customConfig = {
  ...config,
  tokens,
  animations,
  fonts: {
    ...config.fonts,
    heading: headingFont,
    body: bodyFont,
  },
  themes: {
    ...stockThemes,
    // Branded themes
    dark: brandDark,
    light: brandLight,
    legacy_dark: brandDark,
    legacy: brandLight,
  },
  media,
  settings: {
    ...config.settings,
    // Follow system preference by default; fall back to light
    defaultTheme: 'light',
    // `xxl` is new in LS-9885 and must be added here explicitly. Every key in
    // this map is treated as MATCHING before the first measurement (SSR, first
    // paint, jest). That default suits the `maxWidth` keys — the mobile-first
    // cascade wants them live — but `xxl` is a `minWidth` query, so defaulting
    // it active would apply `$xxl` styling at every width until measurement
    // corrected it. Tamagui omits the `gt*` keys here for the same reason;
    // `xxl` is listed as `false` rather than omitted only because it shares the
    // `$`-band namespace and reads as an oversight otherwise.
    mediaQueryDefaultActive: {
      ...config.settings.mediaQueryDefaultActive,
      xxl: false,
      // `short` (maxHeight) is a new key with no stock counterpart to
      // inherit a default from, so — like the other maxWidth-style bands
      // above — it defaults active rather than falling back to `false`.
      short: true,
    },
  },
};

// Shared Tamagui configuration for all applications in the workspace
// This ensures consistency in design tokens, themes, and components across
// web, mobile, and any other platforms using Tamagui

// Create and export the Tamagui configuration
export const tamaguiConfig: TamaguiInternalConfig = createTamagui(customConfig);

// Foundation tokens (spacing scale, radii, typography ramp, box-shadow
// recipes) re-exported for downstream code paths that need the raw value
// rather than a themed Tamagui style prop — e.g. web-only CSS, native
// shadow objects, or code outside a themed Tamagui tree. Mirrors the
// pattern `useThemeTokens()` already uses for colors/shadows in
// lib/shared-components. Colors are wired directly into `brandDark`/
// `brandLight` above (the idiomatic Tamagui mechanism for themed values);
// breakpoints are wired into Tamagui's `media` config above, derived from
// @legacy-sports/design-tokens' `breakpoints` (LS-9885) — so a `$md` style
// prop and `breakpoints.md` describe the same widths. (This comment
// previously claimed breakpoints were "inherited unchanged from
// `config.media`", which mirrored the design tokens. That was false in both
// halves: the config inherited @tamagui/config's own scale, which disagreed
// with the design tokens by up to 300px. The claim is what kept the drift
// invisible, so `tamagui-config.spec.ts` now asserts the derivation instead
// of a comment asserting it.)
//
// `spacing`/`radii` are ALSO layered into Tamagui's internal `tokens.space`/
// `tokens.radius` scale above (LS-9014), so bare `$N` props resolve to the
// same brand pixel values these raw exports carry. Font `size` is left
// un-layered: `typeScale`'s named steps (xs/sm/md/.../6xl) don't map
// 1:1 onto Tamagui's numeric `$1`-`$20` font-size scale the way the
// spacing/radii numeric keys do, so wiring it in would require an
// additional mapping decision outside this ticket's scope.
export const foundationTokens = {
  spacing,
  radii,
  typeScale,
  leading,
  shadowsDark,
  shadowsLight,
} as const;

// Homepage: Football Playboard Hero (LS-9035). Design source: docs/design/
// nxFiEGqu3yPCDKpoNDmQWA/legacy-sports-homepage/project/scratch/mockups/
// home.html (.playboard/.pb-*/.bug* selectors, ~lines 1095-1259).
//
// The playboard is a physical scoreboard object — a chalk-textured board
// with a mounted chrome scorebug — so its palette is deliberately
// theme-invariant, the same rationale as `textOnGold`/`discordBlurple`
// above: chalk-green and chrome bevel read the same regardless of the
// surrounding app theme, just like the sibling ticket-hero's cream paper
// stock (LS-9034). These live here (not `lib/shared-components/src/utils/
// colors.ts`, which is dark-only and being retired per LS-8526, and not
// scanned into the theme-compliance ratchet like `lib/shared-components/
// src` is — LS-8519) rather than as raw hex/rgba literals in component
// code, exactly the pattern `foundationTokens` above documents.
export const playboardTokens = {
  // Flat native fallback (no CSS gradients on native) and the web gradient's
  // own stops, kept as separate fields since native needs a single color.
  bgTop: '#1B2A24',
  bgBottom: '#101A16',
  boardBackgroundImage:
    'repeating-linear-gradient(122deg, rgba(255,255,255,.045) 0 1px, transparent 1px 12px), radial-gradient(120% 100% at 15% 0%, rgba(255,255,255,.05), transparent 60%), linear-gradient(160deg, #1B2A24 0%, #101A16 100%)',
  boardShadow: '0 14px 32px rgba(0,0,0,.45)',
  boardShadowHover: '0 20px 40px rgba(0,0,0,.5)',
  border: '#2C3D34',
  liveMint: '#8FD6A2',
  textSecondary: '#93A89A',
  textMeta: '#7D9284',
  textPrimary: '#EEF4EA',
  dashedInsetBorder: 'rgba(238,244,234,.16)',
  buttonBorder: '#5FA36C',
  buttonHover: '#377C46',
  buttonText: '#F2F7F1',
  bug: {
    chromeLight: '#DCE3D8',
    chromeDark: '#4C5849',
    badgeTop: '#2F6B3C',
    badgeBottom: '#143021',
    badgeEyeText: '#F2F6FA',
    innerBorder: '#10192A',
    plateTop: '#3C8450',
    plateBottom: '#1B4527',
    bottomLight: '#A3AE9D',
    bottomDark: '#5F6B5B',
    textOnChrome: '#F4F8FC',
    textOnBottomBar: '#111A12',
    leadGold: '#F3DD8B',
    possessionGold: '#F5D96A',
  },
} as const;

export default tamaguiConfig;
