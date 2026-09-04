import { useWindowDimensions } from 'react-native';

import { breakpoints } from '@legacy-sports/design-tokens';

/**
 * The three layout treatments the draft-board mock defines, in the order
 * the design system's `vp-group` switcher renders them (docs/design/
 * B8P9BQz8s6NZ9Q-FqWI_yA/legacy-sports-draft-board/project/scratch/mockups/
 * draft.html):
 *
 *   phone    — `$xxs`/`$xs` (0–659, 660–799). The mock frames this as its own
 *              `.vp-mobile` device, not a narrowing of the desktop frame, and
 *              the implementation matches: a dedicated `CompactLiveDraftBoard`
 *              with bottom-tab navigation.
 *   tablet   — `$sm`/`$md` (800–859, 860–979). The mock's shared `.vp-desktop`
 *              frame under `@container vp (max-width: 979px)`: rail stacks
 *              under main as a shelf, two-column player/depth grids, tightened
 *              padding, 44px touch targets.
 *   desktop  — `$lg`/`$xl`/`$xxl` (980–1119, 1120–1279, 1280+). The side-rail
 *              layout; the rail widens and the grids gain columns per band,
 *              but the structure is the same across all three.
 *
 * The mock's own note — "$xxs/$xs and $sm/$md share a layout, as do $xl/$xxl"
 * — is why three named tiers cover seven tokens.
 */
export type DraftViewportTier = 'phone' | 'tablet' | 'desktop';

/**
 * Tier boundaries, expressed as the design-token breakpoints they are derived
 * from rather than as bare pixel literals, so the scale has exactly one
 * source of truth (`@legacy-sports/design-tokens`). Each `breakpoints.*` value
 * is the *lower bound* of its band, so a tier ends one pixel below the next
 * band's lower bound.
 */
const TABLET_MIN_WIDTH = breakpoints.sm; // 800 — first width above the phone board
const DESKTOP_MIN_WIDTH = breakpoints.lg; // 980 — first width with a side rail

/**
 * Pure width → tier mapping. Split out from the hook so the boundaries can be
 * asserted directly in a spec without rendering or stubbing a window.
 */
export function resolveDraftViewportTier(width: number): DraftViewportTier {
  if (width >= DESKTOP_MIN_WIDTH) return 'desktop';
  if (width >= TABLET_MIN_WIDTH) return 'tablet';
  return 'phone';
}

/**
 * The draft board's single viewport-tier signal. Every layout decision in
 * `elite-draft/` that varies by width reads this (or the raw CSS breakpoints
 * in `styles.ts`, which are aligned to the same design-token values) — there
 * is deliberately no second boolean alongside it.
 *
 * Built on `useWindowDimensions` rather than Tamagui's `useMedia()` for two
 * reasons. First, `useMedia()` reads a `TamaguiProvider` context that not all
 * of this feature's consumers supply (e.g. `apps/web/src/components/
 * EliteDraftBoard.a11y.spec.tsx` renders `DraftPlayerBoard` bare), which is
 * why `DraftPlayerBoard` already hand-rolled a `window.matchMedia` listener
 * instead. Second, and more importantly, the workspace's Tamagui media config
 * is `@tamagui/config`'s default set — `$sm` is `maxWidth: 800`, `$md` is
 * `maxWidth: 1020`, and `$xxl` does not exist — which does NOT match the
 * design-token scale the mock is annotated against (`$md` starts at 860,
 * `$lg` at 980). Reconciling those two scales globally would move 264 style
 * props across `lib/` and `apps/`, so it is tracked separately; until then,
 * anything in this feature that needs a *design-system* band must read it
 * from here, not from a `$token` style prop.
 *
 * `useWindowDimensions` works unchanged on web (via react-native-web, which
 * tracks `window.innerWidth` and resize) and on native, needs no provider,
 * and is already the established cross-platform width source in
 * `lib/shared-components` (`PlayerComparison`, `PlayoffBracket`).
 */
export function useDraftViewportTier(): DraftViewportTier {
  const { width } = useWindowDimensions();
  return resolveDraftViewportTier(width);
}
