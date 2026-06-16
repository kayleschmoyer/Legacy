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
