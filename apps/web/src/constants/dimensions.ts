/**
 * Shared layout dimension constants for the Legacy Sports web app.
 *
 * Using a single source of truth prevents sticky-header z-index layering
 * conflicts and ensures that secondary sticky elements (e.g. roster header)
 * stack correctly below the top navigation bar.
 */

/**
 * Height of the sticky top navigation bar in its default (non-compact) state,
 * in pixels. Used as the `top` offset for fixed/sticky elements that must
 * clear the nav bar (e.g. the score ticker strip).
 *
 * Composed of:
 *   - NavContent paddingVertical ($3 × 2 = 26 px)
 *   - Logo image height — non-compact only (38 px; compact shrinks to 30 px)
 *   - Border bottom (1 px)
 *   = 65 px
 *
 * The compact variant (logo 30 px, triggered at scrollY > 80) reduces the
 * rendered height to 57 px, but fixed/sticky consumers keep this offset so
 * they never overlap the nav on initial page load.
 */
export const NAV_HEIGHT_PX = 65;

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

/**
 * Minimum width (px) applied to every desktop nav button — both NavLinkButton
 * in app.tsx and DropdownButton components (MyLeaguesDropdown, PlayersDropdown).
 *
 * Sized to the widest label (\"My Leagues\" + trophy icon + chevron) so all
 * buttons share a consistent width and do not shift when the active font-weight
 * changes.
 */
export const NAV_BUTTON_MIN_WIDTH = 120;

/**
 * Height of the live scores ticker strip in pixels.
 * Rendered just below the sticky nav bar when today's MLB games are available.
 * Not rendered at all (returns null) when no games exist — no element or spacer
 * is present in the DOM on those days.
 *
 * Secondary sticky elements inside page content (e.g. roster header, free-agent
 * toolbar) must use SECONDARY_STICKY_TOP as their `top` offset so they stack
 * directly below the ticker rather than sliding behind it.
 */
export const TICKER_HEIGHT_PX = 40;

/**
 * `top` offset for secondary sticky elements inside page content.
 *
 * When the score ticker is visible these elements must clear both the nav bar
 * AND the ticker strip. On days with no games the ticker is not rendered at all,
 * so these elements will have a small extra gap below the nav — an acceptable
 * trade-off over adding context-dependent dynamic detection.
 */
export const SECONDARY_STICKY_TOP = NAV_HEIGHT_PX + TICKER_HEIGHT_PX;

/**
 * Z-index for nav dropdown menus (e.g. PlayersDropdown, MyLeaguesDropdown).
 * Sits just below NAV_Z_INDEX so dropdowns render above page content
 * (CONTENT_STICKY_Z_INDEX) but do not overlap the nav bar itself.
 */
export const NAV_DROPDOWN_Z_INDEX = NAV_Z_INDEX - 1;

/**
 * Z-index for the live scores ticker strip.
 * Must be below NAV_Z_INDEX so the nav bar always renders on top,
 * but above CONTENT_STICKY_Z_INDEX so the ticker overlays page content.
 */
export const TICKER_Z_INDEX = 150;
