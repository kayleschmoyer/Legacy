import { breakpoints } from '@legacy-sports/design-tokens';

import { CSS } from './styles';

// LS-4852: the .d-root fixed-position wrapper sits below the nav so dropdown
// menus opened from the nav header (e.g. Help & Support → "Report a bug")
// stay tappable when they extend past the nav into the draft area. Lock the
// z-index relationship so a future edit doesn't silently regress.
describe('elite-draft .d-root z-index (LS-4852)', () => {
  const NAV_Z_INDEX = 200;

  it('renders .d-root with a z-index strictly less than the nav', () => {
    const match = CSS.match(/\.d-root\s*\{[^}]*z-index:\s*(-?\d+)/);
    if (!match) {
      throw new Error('.d-root z-index rule not found in CSS');
    }
    const zIndex = Number(match[1]);
    expect(zIndex).toBeLessThan(NAV_Z_INDEX);
  });
});

// LS-8106: .d-main is a flex column with a constrained height. The controls
// bar (search + position pills) has overflow:hidden, so without flex-shrink:0
// a tall player grid compresses it and clips its content — the user saw a
// sliver of a header under the view tabs. Lock flex-shrink:0 on .d-controls
// so a future edit doesn't silently reintroduce the clipping.
describe('elite-draft .d-controls does not collapse (LS-8106)', () => {
  it('keeps flex-shrink:0 on the controls bar', () => {
    const match = CSS.match(/\.d-controls\s*\{([^}]*)\}/);
    if (!match) {
      throw new Error('.d-controls rule not found in CSS');
    }
    expect(match[1]).toMatch(/flex-shrink:\s*0/);
  });
});

// LS-9860: the stylesheet's breakpoints are interpolated from the
// design-token scale, so they cannot silently drift from
// `useDraftViewportTier()`. Before this the tablet stacking rule sat at an
// ad-hoc `max-width: 900px`, leaving 901–979 on the desktop side-rail layout
// where the mock's `@container vp (max-width: 979px)` block specifies the
// stacked treatment.
describe('elite-draft responsive breakpoints (LS-9860)', () => {
  const mediaQueryWidths = [
    ...CSS.matchAll(/@media \(max-width: (\d+)px\)/g),
  ].map((m) => Number(m[1]));

  it('stacks .d-layout at the tablet boundary, not the old 900px', () => {
    const stackRule = CSS.match(
      /@media \(max-width: (\d+)px\) \{\s*\.d-layout \{\s*grid-template-columns: 1fr;/,
    );
    if (!stackRule) {
      throw new Error('.d-layout stacking media query not found in CSS');
    }
    expect(Number(stackRule[1])).toBe(breakpoints.lg - 1);
  });

  it('uses only design-token boundaries for its width queries', () => {
    const allowed = new Set([
      breakpoints.sm - 1,
      breakpoints.lg - 1,
      breakpoints.xl - 1,
    ]);
    expect(mediaQueryWidths.length).toBeGreaterThan(0);
    expect(mediaQueryWidths.filter((w) => !allowed.has(w))).toEqual([]);
  });
});

// LS-10003: the Draft Board timeline is mounted by a React fork on
// `useDraftViewportTier()`, not by a media query. If a later edit tries to
// gate `.d-tl-view` on a `@media` block instead, the two mechanisms can drift
// apart the way `$md` and the design-token scale did (LS-9860) — the board
// would then render both projections, or neither, in the gap between them.
describe('elite-draft timeline is not media-gated (LS-10003)', () => {
  it('defines .d-tl-view outside every media query', () => {
    const withoutMediaBlocks = CSS.replace(/@media[^{]*\{[\s\S]*?\n\}/g, '');
    expect(withoutMediaBlocks).toContain('.d-tl-view');
  });

  it('never hides .d-tl-view or .d-draft-grid-view by width', () => {
    for (const block of CSS.matchAll(/@media[^{]*\{([\s\S]*?)\n\}/g)) {
      expect(block[1]).not.toContain('.d-tl-view');
      expect(block[1]).not.toContain('.d-draft-grid-view');
    }
  });
});

// LS-10005: the player dock shows at every tier of the wide layout and its
// 1/2/3-up row split is a React decision on the design-token tier (`data-cols`).
// A width query touching `.d-dock` would be a second, drift-prone boundary.
describe('elite-draft player dock is not media-gated (LS-10005)', () => {
  it('defines .d-dock and its column rules outside every media query', () => {
    const withoutMediaBlocks = CSS.replace(/@media[^{]*\{[\s\S]*?\n\}/g, '');
    expect(withoutMediaBlocks).toContain('.d-dock {');
    expect(withoutMediaBlocks).toContain('.d-dock-rows[data-cols="1"]');
    expect(withoutMediaBlocks).toContain('.d-dock-rows[data-cols="3"]');
  });

  it('never restyles the dock by width', () => {
    for (const block of CSS.matchAll(/@media[^{]*\{([\s\S]*?)\n\}/g)) {
      expect(block[1]).not.toContain('.d-dock');
    }
  });
});

// LS-10811: the Tamagui web reset applies `all: unset` to <li>, making the
// spectator lobby's team names inline and run together. The list items must
// stay real list items.
describe('elite-draft spectator lobby order list (LS-10811)', () => {
  it('restores list-item display on the lobby order entries', () => {
    const match = CSS.match(/\.d-spec-lobby-order\s*>\s*li\s*\{([^}]*)\}/);
    if (!match) {
      throw new Error('.d-spec-lobby-order > li rule not found in CSS');
    }
    expect(match[1]).toMatch(/display:\s*list-item/);
  });
});
