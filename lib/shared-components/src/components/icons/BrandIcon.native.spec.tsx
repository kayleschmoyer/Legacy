/**
 * BrandIcon.native.tsx exports (LS-8858) — BrandIconBadge, BRAND_ICON_ACCENT,
 * and ALL_BRAND_ICON_NAMES were missing from the native barrel, so importing
 * them via the shared lib/shared-components/src/components/icons/index.ts
 * barrel on Android/iOS silently resolved to undefined and crashed at the
 * call site (same failure class as LS-8755/LS-8768/LS-7946/LS-7953).
 */
import React from 'react';
import {
  ALL_BRAND_ICON_NAMES,
  BRAND_ICON_ACCENT,
  BrandIcon,
  BrandIconBadge,
  type BrandIconName,
} from './BrandIcon.native';
import { render } from '../../test-utils';

describe('BrandIconBadge (native)', () => {
  it('renders the wrapped BrandIcon without crashing', () => {
    const { container } = render(<BrandIconBadge name="baseball" />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders a circular badge by default and a square badge on request', () => {
    const { container: circle } = render(
      <BrandIconBadge name="football" size={40} />,
    );
    const { container: square } = render(
      <BrandIconBadge name="football" size={40} rounded="square" />,
    );

    expect((circle.firstChild as HTMLElement).style.borderRadius).toBe('20px');
    expect((square.firstChild as HTMLElement).style.borderRadius).toBe('14px');
  });
});

describe('BRAND_ICON_ACCENT', () => {
  it('is a non-empty color string', () => {
    expect(typeof BRAND_ICON_ACCENT).toBe('string');
    expect(BRAND_ICON_ACCENT.length).toBeGreaterThan(0);
  });
});

describe('ALL_BRAND_ICON_NAMES (native)', () => {
  it('is a non-empty list with no duplicates', () => {
    expect(ALL_BRAND_ICON_NAMES.length).toBeGreaterThan(0);
    expect(new Set(ALL_BRAND_ICON_NAMES).size).toBe(
      ALL_BRAND_ICON_NAMES.length,
    );
  });

  it.each(ALL_BRAND_ICON_NAMES)(
    'renderGlyph renders non-null output for %s',
    (name: BrandIconName) => {
      const { container } = render(<BrandIcon name={name} />);
      // A glyph that falls through renderGlyph's `default: return null` leaves
      // the <Svg> root childless — no elements for renderGlyph's JSX to add.
      expect(
        (container.firstChild as HTMLElement).children.length,
      ).toBeGreaterThan(0);
    },
  );
});
