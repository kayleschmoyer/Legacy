import React from 'react';
import { PositionBadge } from './PositionBadge';
import { render } from '../test-utils';

describe('PositionBadge', () => {
  it('renders the position label', () => {
    const { getByText } = render(
      <PositionBadge position="QB" sport="football" />,
    );
    expect(getByText('QB')).toBeTruthy();
  });

  it('renders correctly with no sport/color given (falls back to a default color internally)', () => {
    const { getByText } = render(<PositionBadge position="ZZ" />);
    expect(getByText('ZZ')).toBeTruthy();
  });

  it.each([
    ['baseball', 'C'],
    ['baseball', '1B'],
    ['football', 'QB'],
    ['football', 'DST'],
  ] as const)(
    'resolves a %s/%s color via getPositionColor without throwing',
    (sport, position) => {
      const { getByText } = render(
        <PositionBadge position={position} sport={sport} />,
      );
      expect(getByText(position)).toBeTruthy();
    },
  );

  it('an explicit color override is accepted alongside sport (does not throw)', () => {
    const { getByText } = render(
      <PositionBadge position="QB" sport="football" color="#123456" />,
    );
    expect(getByText('QB')).toBeTruthy();
  });

  it('backgroundColor/textColor overrides are accepted without a sport or color', () => {
    const { getByText } = render(
      <PositionBadge
        position="C"
        backgroundColor="$amber3"
        textColor="$amber11"
      />,
    );
    expect(getByText('C')).toBeTruthy();
  });

  it.each(['alpha', 'solid'] as const)(
    'renders the label for the %s variant',
    (variant) => {
      const { getByText } = render(
        <PositionBadge position="QB" sport="football" variant={variant} />,
      );
      expect(getByText('QB')).toBeTruthy();
    },
  );

  it.each(['chip', 'circle'] as const)(
    'renders the label for the %s shape',
    (shape) => {
      const { getByText } = render(
        <PositionBadge
          position="BN"
          shape={shape}
          backgroundColor="$gray4"
          textColor="$gray11"
        />,
      );
      expect(getByText('BN')).toBeTruthy();
    },
  );

  it('accepts a numeric letterSpacing without throwing (strings are rejected at the type level — LS-8624)', () => {
    const { getByText } = render(
      <PositionBadge position="QB" sport="football" letterSpacing={0.8} />,
    );
    expect(getByText('QB')).toBeTruthy();
  });

  it('showBorder does not affect the rendered label', () => {
    const { getByText } = render(
      <PositionBadge position="QB" sport="football" showBorder />,
    );
    expect(getByText('QB')).toBeTruthy();
  });

  it('renders custom children instead of the default label Text', () => {
    const { getByTestId, queryByText } = render(
      <PositionBadge position="QB" sport="football">
        <span data-testid="custom-child">loading</span>
      </PositionBadge>,
    );
    expect(getByTestId('custom-child')).toBeTruthy();
    expect(queryByText('QB')).toBeNull();
  });

  it('renders the default label Text when children is not given', () => {
    const { getByText, queryByTestId } = render(
      <PositionBadge position="QB" sport="football" />,
    );
    expect(getByText('QB')).toBeTruthy();
    expect(queryByTestId('custom-child')).toBeNull();
  });
});
