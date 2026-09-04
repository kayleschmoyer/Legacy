import { breakpoints } from '@legacy-sports/design-tokens';

import { resolveDraftViewportTier } from './useDraftViewport';

/**
 * LS-9860. Before this, the draft board gated on a single `$sm` boolean and
 * everything above it fell through to the desktop layout, so the mock's
 * tablet tier had no representation at all. These assert the two boundaries
 * that defect turned on — most importantly that 979 is still tablet, since
 * `901–979` was the band actually rendering the desktop side-rail layout
 * where the mock's `@container vp (max-width: 979px)` block specifies the
 * stacked treatment.
 */
describe('resolveDraftViewportTier', () => {
  it.each([
    [0, 'phone'],
    [375, 'phone'], // mock's `mobile` frame — must not regress
    [659, 'phone'], // top of $xxs
    [660, 'phone'], // $xs still shares the phone layout
    [799, 'phone'], // last phone width
    [800, 'tablet'], // $sm — first width on the shared desktop frame
    [859, 'tablet'],
    [860, 'tablet'], // mock's `tablet` frame
    [900, 'tablet'], // the old raw `max-width: 900px` boundary
    [950, 'tablet'], // regressed band: rendered desktop before LS-9860
    [979, 'tablet'], // last tablet width
    [980, 'desktop'], // $lg — mock's `land` frame
    [1119, 'desktop'],
    [1120, 'desktop'], // $xl
    [1279, 'desktop'],
    [1280, 'desktop'], // $xxl — mock's `desktop` frame, must not regress
    [1440, 'desktop'], // mock's `wide` frame, must not regress
  ])('maps %ipx to the %s tier', (width, tier) => {
    expect(resolveDraftViewportTier(width)).toBe(tier);
  });

  it('derives its boundaries from the design-token scale, not pixel literals', () => {
    expect(resolveDraftViewportTier(breakpoints.sm - 1)).toBe('phone');
    expect(resolveDraftViewportTier(breakpoints.sm)).toBe('tablet');
    expect(resolveDraftViewportTier(breakpoints.lg - 1)).toBe('tablet');
    expect(resolveDraftViewportTier(breakpoints.lg)).toBe('desktop');
  });
});
