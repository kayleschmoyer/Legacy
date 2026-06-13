import React from 'react';
import { PremiumGate } from './PremiumGate';
import { fireEvent, render, screen } from '../test-utils';

jest.mock('tamagui', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const makeDiv =
    (tag = 'div') =>
    ({
      children,
      ...rest
    }: {
      children?: React.ReactNode;
      [k: string]: unknown;
    }) =>
      React.createElement(tag, rest, children);
  const makeButton = ({
    children,
    onPress,
    ...rest
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    [k: string]: unknown;
  }) => React.createElement('button', { ...rest, onClick: onPress }, children);
  return {
    Card: makeDiv('div'),
    YStack: makeDiv('div'),
    XStack: makeDiv('div'),
    Text: makeDiv('span'),
    Button: makeButton,
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  Lock: () => null,
}));

jest.mock('../utils/colors', () => ({
  BRAND_NAVY_LIGHT: '#1A2A4A',
  withAlpha: (color: string, _alpha: number) => color,
}));

describe('PremiumGate (shared)', () => {
  it('renders children when premium', () => {
    render(
      <PremiumGate isPremium featureName="Draft Recommendations">
        <span>premium content</span>
      </PremiumGate>,
    );
    expect(screen.getByText('premium content')).toBeTruthy();
  });

  it('hides children for non-premium users', () => {
    render(
      <PremiumGate isPremium={false} featureName="Draft Recommendations">
        <span>premium content</span>
      </PremiumGate>,
    );
    expect(screen.queryByText('premium content')).toBeNull();
  });

  it('shows the feature name and locked message for non-premium users', () => {
    render(
      <PremiumGate isPremium={false} featureName="Draft Recommendations">
        <span>premium content</span>
      </PremiumGate>,
    );
    expect(screen.getByText('Draft Recommendations')).toBeTruthy();
    expect(screen.getByText('Available with Premium leagues.')).toBeTruthy();
  });

  it('shows description when provided', () => {
    render(
      <PremiumGate
        isPremium={false}
        featureName="Draft Recommendations"
        featureDescription="AI-powered recommendations"
      >
        <span>content</span>
      </PremiumGate>,
    );
    expect(screen.getByText('AI-powered recommendations')).toBeTruthy();
  });

  it('shows Upgrade button when onUpgrade is provided', () => {
    render(
      <PremiumGate
        isPremium={false}
        featureName="Draft Recommendations"
        onUpgrade={jest.fn()}
      >
        <span>content</span>
      </PremiumGate>,
    );
    expect(screen.getByText('Upgrade')).toBeTruthy();
  });

  it('does not show Upgrade button when onUpgrade is omitted', () => {
    render(
      <PremiumGate isPremium={false} featureName="Draft Recommendations">
        <span>content</span>
      </PremiumGate>,
    );
    expect(screen.queryByText('Upgrade')).toBeNull();
  });

  it('calls onUpgrade when Upgrade button is pressed', () => {
    const onUpgrade = jest.fn();
    render(
      <PremiumGate
        isPremium={false}
        featureName="Draft Recommendations"
        onUpgrade={onUpgrade}
      >
        <span>content</span>
      </PremiumGate>,
    );
    fireEvent.click(screen.getByText('Upgrade'));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });
});
