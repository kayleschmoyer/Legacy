/**
 * Shared layout dimension constants for the Legacy Sports web app.
 *
 * Using a single source of truth prevents sticky-header z-index layering
 * conflicts and ensures that secondary sticky elements (e.g. roster header)
 * stack correctly below the top navigation bar.
 */

/**
 * Height of the sticky top navigation bar in pixels.
 *
 * Composed of:
 *   - AccentBar gradient strip (3 px)
 *   - NavContent paddingVertical ($4 × 2 = 32 px)
 *   - Logo image height (38 px)
 *   - Border bottom (1 px)
 *   - 1 px safety buffer
 *   = 75 px
 *
 * Consumers that render their own `position: sticky` elements should use
 * this value as the `top` offset so they stack directly below the nav bar
 * instead of overlapping it.
 */
export const NAV_HEIGHT_PX = 75;

/**
 * Z-index for the main sticky navigation bar.
 * All other sticky elements in page content should use a lower value.
 */
export const NAV_Z_INDEX = 200;

/**
 * Z-index for secondary sticky elements inside page content
 * (e.g. the roster management header).  Must be lower than NAV_Z_INDEX.
 */
export const CONTENT_STICKY_Z_INDEX = 100;
