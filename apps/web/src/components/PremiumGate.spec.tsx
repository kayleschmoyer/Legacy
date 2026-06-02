import React from 'react';
import { render, screen } from '@testing-library/react';

import { PremiumGate } from './PremiumGate';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

jest.mock('../utils/analytics', () => ({
  trackPremiumFeatureBlocked: jest.fn(),
  trackPremiumFeatureClick: jest.fn(),
}));

const mockUseStripePrices = jest.fn();
jest.mock('../hooks/useStripePrices', () => ({
  useStripePrices: (): unknown => mockUseStripePrices(),
}));

// Mock the UpgradeModal — it has its own useStripePrices call and router
// dependency; isolating it keeps this test focused on PremiumGate itself.
jest.mock('./UpgradeModal', () => ({
  UpgradeModal: () => null,
}));

type Children = { children?: React.ReactNode; [key: string]: unknown };
type ButtonProps = Children & { onPress?: () => void };

jest.mock('tamagui', () => {
  const PassThrough = ({ children }: Children) => <div>{children}</div>;
  const Button = ({ children, onPress }: ButtonProps) => (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  );
  return {
    YStack: PassThrough,
    Text: ({ children }: Children) => <span>{children}</span>,
    Button,
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  Lock: () => null,
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PremiumGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: live prices distinct from the old hardcoded "$3.33" value so
    // we can prove the displayed value is dynamic.
    mockUseStripePrices.mockReturnValue({ annualMonthlyEquivalent: '$6.67' });
  });

  it('renders the monthly-equivalent price from useStripePrices for free users', () => {
    render(
      <PremiumGate isPremium={false} featureName="Player Comparison">
        <div>locked content</div>
      </PremiumGate>,
    );

    expect(screen.getByText('From $6.67/mo')).toBeInTheDocument();
    // The old hardcoded value must not appear when live prices differ.
    expect(screen.queryByText('From $3.33/mo')).not.toBeInTheDocument();
  });

  it('renders the hook fallback value when live prices are unavailable', () => {
    // useStripePrices returns fallback display values (3999¢ / 12 = $3.33)
    // when Stripe prices cannot be fetched.
    mockUseStripePrices.mockReturnValue({ annualMonthlyEquivalent: '$3.33' });

    render(
      <PremiumGate isPremium={false} featureName="Player Comparison">
        <div>locked content</div>
      </PremiumGate>,
    );

    expect(screen.getByText('From $3.33/mo')).toBeInTheDocument();
  });

  it('does not render the price string for premium users', () => {
    render(
      <PremiumGate isPremium featureName="Player Comparison">
        <div>locked content</div>
      </PremiumGate>,
    );

    expect(screen.queryByText(/\/mo$/)).not.toBeInTheDocument();
  });
});
