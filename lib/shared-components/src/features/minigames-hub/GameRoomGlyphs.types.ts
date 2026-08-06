/**
 * Shared prop contract for the platform-split `GameRoomGlyph` (LS-8800).
 *
 * The Game Room layout needs five thin single-stroke marks. Lucide ships all
 * of them, but `@tamagui/lucide-icons` is not a dependency of this library and
 * the repo's established pattern for icon artwork is a platform split — raw
 * `<svg>` on web, `react-native-svg` on native (see `SportGlyph.tsx` /
 * `SportGlyph.native.tsx`). These marks follow the Lucide geometry so they sit
 * next to the rest of the icon set without redrawing anything.
 */
export type GameRoomGlyphName =
  /** Season Draft — clipboard with rules */
  | 'clipboard'
  /** Who Am I? — bar chart */
  | 'barChart'
  /** 20 Questions — help circle */
  | 'helpCircle'
  /** Row affordance */
  | 'chevronRight'
  /** Resume banner */
  | 'play'
  /** MinigamesHub game-card CTA */
  | 'arrowRight';

export interface GameRoomGlyphProps {
  name: GameRoomGlyphName;
  /** Rendered square size in px. Defaults to 22. */
  size?: number;
  /**
   * Stroke (or fill, for `play`) colour. Raw string by design — callers
   * resolve it per theme via `useThemeTokens()` rather than hardcoding hex,
   * because neither `<svg>` nor `react-native-svg` understands `$tokens`.
   */
  color: string;
  /** Stroke width. Defaults to 1.8. */
  strokeWidth?: number;
}
