/**
 * Covers the geometry the native GradientSurface paints with: the CSS-angle →
 * SVG-endpoint conversion (so mobile gradients keep pointing the same way as
 * the web ones) and the corner-radius resolution + rounded-rect path that
 * replaced the mis-measuring `width="100%"` `<Rect>` in LS-8808.
 */
import {
  type CornerRadii,
  gradientEndpoints,
  resolveCornerRadii,
  roundedRectPath,
} from './GradientSurface.native';

// react-native-svg's real implementation pulls in RN's native Touchable mixin,
// which the shared jest mock of 'react-native' doesn't provide. Intrinsic-style
// string tags are valid React element types, so the module can be stubbed
// without a runtime `require` of React inside the factory.
jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'svg',
  Defs: 'defs',
  LinearGradient: 'linearGradient',
  Path: 'path',
  Stop: 'stop',
}));

/**
 * Endpoints are floating-point; compare to 6 decimal places. `|| 0` collapses
 * the `-0` that trigonometry produces for axis-aligned angles, which `toBe`
 * treats as distinct from `0`.
 */
function round(value: number): number {
  return Number(value.toFixed(6)) || 0;
}

describe('gradientEndpoints', () => {
  it('maps 135° (to bottom-right) corner to corner', () => {
    const { x1, y1, x2, y2 } = gradientEndpoints(135);
    expect(round(x1)).toBe(0);
    expect(round(y1)).toBe(0);
    expect(round(x2)).toBe(1);
    expect(round(y2)).toBe(1);
  });

  it('maps 90° to a left-to-right horizontal sweep', () => {
    const { x1, y1, x2, y2 } = gradientEndpoints(90);
    expect(round(x1)).toBe(0);
    expect(round(y1)).toBe(0.5);
    expect(round(x2)).toBe(1);
    expect(round(y2)).toBe(0.5);
  });

  it('maps 180° to a top-to-bottom vertical sweep', () => {
    const { x1, y1, x2, y2 } = gradientEndpoints(180);
    expect(round(x1)).toBe(0.5);
    expect(round(y1)).toBe(0);
    expect(round(x2)).toBe(0.5);
    expect(round(y2)).toBe(1);
  });

  it('maps 0° to a bottom-to-top sweep, matching CSS "to top"', () => {
    const { x1, y1, x2, y2 } = gradientEndpoints(0);
    expect(round(x1)).toBe(0.5);
    expect(round(y1)).toBe(1);
    expect(round(x2)).toBe(0.5);
    expect(round(y2)).toBe(0);
  });
});

describe('resolveCornerRadii (LS-8808)', () => {
  it('applies borderRadius to every corner that has no explicit value', () => {
    expect(resolveCornerRadii({ borderRadius: 8 }, 200, 40)).toEqual({
      topLeft: 8,
      topRight: 8,
      bottomRight: 8,
      bottomLeft: 8,
    });
  });

  it('lets per-corner values override borderRadius', () => {
    // The live-ticker header: rounded top corners flush with the card, square
    // bottom corners meeting the scoreboard row.
    expect(
      resolveCornerRadii(
        { borderTopLeftRadius: 15, borderTopRightRadius: 15 },
        320,
        33,
      ),
    ).toEqual({ topLeft: 15, topRight: 15, bottomRight: 0, bottomLeft: 0 });
  });

  it('clamps a pill radius to half the shorter side', () => {
    // The progress bar passes borderRadius 9999 on a 4px-tall surface.
    expect(resolveCornerRadii({ borderRadius: 9999 }, 120, 4)).toEqual({
      topLeft: 2,
      topRight: 2,
      bottomRight: 2,
      bottomLeft: 2,
    });
  });

  it('floors negative radii at zero and tolerates a zero-sized surface', () => {
    expect(resolveCornerRadii({ borderRadius: -10 }, 100, 20)).toEqual({
      topLeft: 0,
      topRight: 0,
      bottomRight: 0,
      bottomLeft: 0,
    });
    expect(resolveCornerRadii({ borderRadius: 8 }, 0, 0)).toEqual({
      topLeft: 0,
      topRight: 0,
      bottomRight: 0,
      bottomLeft: 0,
    });
  });
});

describe('roundedRectPath (LS-8808)', () => {
  const square: CornerRadii = {
    topLeft: 0,
    topRight: 0,
    bottomRight: 0,
    bottomLeft: 0,
  };

  it('emits a plain rectangle when every radius is zero', () => {
    expect(roundedRectPath(100, 20, square)).toBe('M 0 0 H 100 V 20 H 0 V 0 Z');
  });

  it('arcs only the corners that have a radius', () => {
    const path = roundedRectPath(320, 33, {
      ...square,
      topLeft: 15,
      topRight: 15,
    });
    expect(path).toBe(
      'M 15 0 H 305 A 15 15 0 0 1 320 15 V 33 H 0 V 15 A 15 15 0 0 1 15 0 Z',
    );
  });

  it('spans the full measured width so the header cannot end ragged', () => {
    // Regression guard for defect 1: the path is built from pixel dimensions,
    // so its right edge is always exactly the surface width.
    const path = roundedRectPath(287.5, 33, square);
    expect(path).toContain('H 287.5');
  });

  it('rounds sub-pixel layout floats to three decimals', () => {
    expect(roundedRectPath(100.00049, 20.5, square)).toBe(
      'M 0 0 H 100 V 20.5 H 0 V 0 Z',
    );
  });
});
