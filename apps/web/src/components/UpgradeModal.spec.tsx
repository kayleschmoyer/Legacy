import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import {
  PREMIUM_FEATURES,
  premiumFeatureBenefitLabel,
} from '@legacy-sports/shared-components/premium-features';

import { UpgradeModal } from './UpgradeModal';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('./BaseModal', () => ({
  BaseModal: ({
    open,
    children,
  }: {
    open: boolean;
    children?: React.ReactNode;
  }) => (open ? <div>{children}</div> : null),
}));

const mockUseStripePrices = jest.fn();
jest.mock('../hooks/useStripePrices', () => ({
  useStripePrices: (): unknown => mockUseStripePrices(),
}));

jest.mock('./PriceSkeleton', () => ({
  PriceSkeleton: () => <div data-testid="price-skeleton" />,
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
    createTokens: (tokens: unknown) => tokens,
    YStack: PassThrough,
    XStack: PassThrough,
    Text: ({ children }: Children) => <span>{children}</span>,
    Button,
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  AlertCircle: () => null,
  Check: () => null,
  Star: () => null,
}));

// ── Tests ────────────────────────────────────────────────────────────────────

// LS-8813: useStripePrices returns the hardcoded fallback prices ($4.99/mo,
// $39.99/yr) together with a `loading` flag so callers can suppress the
// fallback while the live Stripe query is in flight.
describe('UpgradeModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseStripePrices.mockReturnValue({
      monthlyPriceDisplay: '$9.99',
      annualPriceDisplay: '$99.99',
      annualSavingsPct: '17%',
      pricesFailed: false,
      loading: false,
    });
  });

  it('renders the live price once the query resolves', () => {
    mockUseStripePrices.mockReturnValue({
      monthlyPriceDisplay: '$9.99',
      annualPriceDisplay: '$99.99',
      annualSavingsPct: '17%',
      pricesFailed: false,
      loading: false,
    });

    render(
      <UpgradeModal
        open
        onOpenChange={jest.fn()}
        featureName="Player Comparison"
      />,
    );

    expect(screen.getByText('$9.99')).toBeInTheDocument();
    expect(screen.queryByTestId('price-skeleton')).not.toBeInTheDocument();
  });

  it('does not render the hardcoded fallback price while the prices query is in flight', () => {
    mockUseStripePrices.mockReturnValue({
      monthlyPriceDisplay: '$4.99',
      annualPriceDisplay: '$39.99',
      annualSavingsPct: '33%',
      pricesFailed: false,
      loading: true,
    });

    render(
      <UpgradeModal
        open
        onOpenChange={jest.fn()}
        featureName="Player Comparison"
      />,
    );

    expect(screen.queryByText(/4\.99/)).not.toBeInTheDocument();
    expect(screen.queryByText(/39\.99/)).not.toBeInTheDocument();
    expect(screen.getAllByTestId('price-skeleton').length).toBeGreaterThan(0);
  });

  it('still renders the fallback price and the warning when the prices query genuinely fails', () => {
    mockUseStripePrices.mockReturnValue({
      monthlyPriceDisplay: '$4.99',
      annualPriceDisplay: '$39.99',
      annualSavingsPct: '33%',
      pricesFailed: true,
      loading: false,
    });

    render(
      <UpgradeModal
        open
        onOpenChange={jest.fn()}
        featureName="Player Comparison"
      />,
    );

    expect(screen.getByText('$4.99')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Pricing information could not be loaded. Displayed prices may be outdated.',
      ),
    ).toBeInTheDocument();
  });

  // LS-10462 — the modal's list must match /pricing and the league premium
  // lock, which both advertise advanced stats.
  it('lists every premium benefit from the canonical list, including advanced stats', () => {
    render(
      <UpgradeModal open onOpenChange={jest.fn()} featureName="Mock Drafts" />,
    );

    for (const feature of PREMIUM_FEATURES.filter((f) => f.free !== true)) {
      expect(
        screen.getByText(premiumFeatureBenefitLabel(feature)),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByText('Advanced stats + projections'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Advanced projections')).toBeNull();
  });

  it('links to the full plan comparison on /pricing and closes', () => {
    const onOpenChange = jest.fn();
    render(
      <UpgradeModal
        open
        onOpenChange={onOpenChange}
        featureName="Mock Drafts"
      />,
    );

    fireEvent.click(screen.getByText('See full plan comparison'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockNavigate).toHaveBeenCalledWith('/pricing');
  });

  // CLF-012 — the free-tier league-cap modal needs an escape hatch besides
  // upgrading: a link to where the user can delete an existing league.
  describe('secondaryAction (CLF-012)', () => {
    it('does not render a secondary action by default', () => {
      render(
        <UpgradeModal
          open
          onOpenChange={jest.fn()}
          featureName="Player Comparison"
        />,
      );

      expect(screen.queryByText(/delete an existing league/i)).toBeNull();
    });

    it('renders the secondary action and navigates + closes on press', () => {
      const onOpenChange = jest.fn();
      render(
        <UpgradeModal
          open
          onOpenChange={onOpenChange}
          featureName="Unlimited League Creation"
          secondaryAction={{
            label: 'Or delete an existing league to make room',
            to: '/football',
          }}
        />,
      );

      fireEvent.click(
        screen.getByText('Or delete an existing league to make room'),
      );

      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(mockNavigate).toHaveBeenCalledWith('/football');
    });
  });
});
