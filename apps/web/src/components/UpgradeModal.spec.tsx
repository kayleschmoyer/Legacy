import React from 'react';
import { render, screen } from '@testing-library/react';

import { UpgradeModal } from './UpgradeModal';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
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
});
