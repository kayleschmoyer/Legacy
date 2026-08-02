import React from 'react';
import { render, screen } from '@testing-library/react';

import { PremiumGate } from './PremiumGate';
import { __resetPremiumGateTrackingForTests } from './PremiumGate';
import { trackPremiumFeatureBlocked } from '../utils/analytics';

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

jest.mock('./PriceSkeleton', () => ({
  PriceSkeleton: () => <div data-testid="price-skeleton" />,
}));

// Mock the UpgradeModal — it has its own useStripePrices call and router
// dependency; isolating it keeps this test focused on PremiumGate itself.
jest.mock('./UpgradeModal', () => ({
  UpgradeModal: () => null,
}));

type Children = { children?: React.ReactNode; [key: string]: unknown };
type ButtonProps = Children & { onPress?: () => void };

jest.mock('tamagui', () => {
  const PassThrough = ({ children, ...rest }: Children) => (
    <div {...rest}>{children}</div>
  );
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
    __resetPremiumGateTrackingForTests();
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

  it('renders the hook fallback value when live prices are unavailable (loading has settled)', () => {
    // useStripePrices returns fallback display values (3999¢ / 12 = $3.33)
    // when Stripe prices cannot be fetched.
    mockUseStripePrices.mockReturnValue({
      annualMonthlyEquivalent: '$3.33',
      loading: false,
    });

    render(
      <PremiumGate isPremium={false} featureName="Player Comparison">
        <div>locked content</div>
      </PremiumGate>,
    );

    expect(screen.getByText('From $3.33/mo')).toBeInTheDocument();
  });

  // LS-8813: while the Stripe prices query is still in flight, useStripePrices
  // returns the fallback $3.33 figure alongside loading: true. Previously
  // PremiumGate ignored the flag and rendered the fallback immediately.
  it('does not render the fallback price while the prices query is in flight', () => {
    mockUseStripePrices.mockReturnValue({
      annualMonthlyEquivalent: '$3.33',
      loading: true,
    });

    render(
      <PremiumGate isPremium={false} featureName="Player Comparison">
        <div>locked content</div>
      </PremiumGate>,
    );

    expect(screen.queryByText(/\$3\.33/)).not.toBeInTheDocument();
    expect(screen.getByTestId('price-skeleton')).toBeInTheDocument();
  });

  it('does not render the price string for premium users', () => {
    render(
      <PremiumGate isPremium featureName="Player Comparison">
        <div>locked content</div>
      </PremiumGate>,
    );

    expect(screen.queryByText(/\/mo$/)).not.toBeInTheDocument();
  });

  it('fires trackPremiumFeatureBlocked on mount for non-premium users (default backward compat)', () => {
    render(
      <PremiumGate isPremium={false} featureName="Player Comparison">
        <div>content</div>
      </PremiumGate>,
    );

    expect(trackPremiumFeatureBlocked).toHaveBeenCalledTimes(1);
    expect(trackPremiumFeatureBlocked).toHaveBeenCalledWith(
      'Player Comparison',
    );
  });

  it('does not fire trackPremiumFeatureBlocked while isUserLoaded is false', () => {
    render(
      <PremiumGate
        isPremium={false}
        isUserLoaded={false}
        featureName="Player Comparison"
      >
        <div>content</div>
      </PremiumGate>,
    );

    expect(trackPremiumFeatureBlocked).not.toHaveBeenCalled();
  });

  it('fires trackPremiumFeatureBlocked once identity settles and user is non-premium', () => {
    const { rerender } = render(
      <PremiumGate
        isPremium={false}
        isUserLoaded={false}
        featureName="Player Comparison"
      >
        <div>content</div>
      </PremiumGate>,
    );

    expect(trackPremiumFeatureBlocked).not.toHaveBeenCalled();

    rerender(
      <PremiumGate
        isPremium={false}
        isUserLoaded={true}
        featureName="Player Comparison"
      >
        <div>content</div>
      </PremiumGate>,
    );

    expect(trackPremiumFeatureBlocked).toHaveBeenCalledTimes(1);
    expect(trackPremiumFeatureBlocked).toHaveBeenCalledWith(
      'Player Comparison',
    );
  });

  it('does not fire trackPremiumFeatureBlocked when isPremium resolves true after loading', () => {
    const { rerender } = render(
      <PremiumGate
        isPremium={false}
        isUserLoaded={false}
        featureName="Player Comparison"
      >
        <div>content</div>
      </PremiumGate>,
    );

    rerender(
      <PremiumGate
        isPremium={true}
        isUserLoaded={true}
        featureName="Player Comparison"
      >
        <div>content</div>
      </PremiumGate>,
    );

    expect(trackPremiumFeatureBlocked).not.toHaveBeenCalled();
  });

  it('does not re-fire trackPremiumFeatureBlocked when the gate remounts for a feature already tracked this session (LS-5874)', () => {
    const { unmount } = render(
      <PremiumGate isPremium={false} featureName="AI Matchup Recap">
        <div>content</div>
      </PremiumGate>,
    );
    expect(trackPremiumFeatureBlocked).toHaveBeenCalledTimes(1);
    unmount();

    // Simulates a remount of the same gate for the same feature within the
    // same page-view session (e.g. tab switch, week navigation).
    render(
      <PremiumGate isPremium={false} featureName="AI Matchup Recap">
        <div>content</div>
      </PremiumGate>,
    );

    expect(trackPremiumFeatureBlocked).toHaveBeenCalledTimes(1);
  });

  it('tracks distinct feature names independently within the same session', () => {
    render(
      <PremiumGate isPremium={false} featureName="Feature A">
        <div>content</div>
      </PremiumGate>,
    );
    render(
      <PremiumGate isPremium={false} featureName="Feature B">
        <div>content</div>
      </PremiumGate>,
    );

    expect(trackPremiumFeatureBlocked).toHaveBeenCalledTimes(2);
    expect(trackPremiumFeatureBlocked).toHaveBeenNthCalledWith(1, 'Feature A');
    expect(trackPremiumFeatureBlocked).toHaveBeenNthCalledWith(2, 'Feature B');
  });

  it('hides the blurred content from assistive tech for free users when opted in (LS-5873)', () => {
    render(
      <PremiumGate
        isPremium={false}
        featureName="AI Matchup Recap"
        hideBlurredContentFromAssistiveTech
      >
        <div>locked content</div>
      </PremiumGate>,
    );

    const gatedContent = screen.getByText('locked content');
    expect(gatedContent.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('does not hide content from assistive tech for premium users even when opted in', () => {
    render(
      <PremiumGate
        isPremium
        featureName="AI Matchup Recap"
        hideBlurredContentFromAssistiveTech
      >
        <div>unlocked content</div>
      </PremiumGate>,
    );

    const gatedContent = screen.getByText('unlocked content');
    expect(gatedContent.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('leaves blurred content perceivable by assistive tech by default (e.g. non-interactive public previews)', () => {
    render(
      <PremiumGate isPremium={false} featureName="Player Comparison">
        <div>preview content</div>
      </PremiumGate>,
    );

    const gatedContent = screen.getByText('preview content');
    expect(gatedContent.closest('[aria-hidden="true"]')).toBeNull();
  });
});
