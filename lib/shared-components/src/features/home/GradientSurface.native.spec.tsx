/**
 * Covers the CSS-angle → SVG-endpoint conversion the native GradientSurface
 * uses, so the mobile gradients keep pointing the same way as the web ones.
 */
import { gradientEndpoints } from './GradientSurface.native';

// react-native-svg's real implementation pulls in RN's native Touchable mixin,
// which the shared jest mock of 'react-native' doesn't provide. Intrinsic-style
// string tags are valid React element types, so the module can be stubbed
// without a runtime `require` of React inside the factory.
jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'svg',
  Defs: 'defs',
  LinearGradient: 'linearGradient',
  Rect: 'rect',
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
