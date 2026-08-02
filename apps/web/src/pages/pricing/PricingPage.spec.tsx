import React from 'react';
import { render, screen } from '@testing-library/react';

import PricingPage from './PricingPage';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

jest.mock('../../components/PageMeta', () => ({
  PageMeta: () => null,
}));

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));

type ChildrenProps = { children?: React.ReactNode; [key: string]: unknown };
type ButtonProps = ChildrenProps & { onPress?: () => void };

// Only forward data-* attributes (used as test selectors) to the underlying
// DOM node — Tamagui style props (fontWeight, alignItems, $sm, etc.) are not
// valid DOM attributes and would otherwise spam React "unknown prop" warnings.
function mockDomProps(rest: ChildrenProps): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(rest).filter(([key]) => key.startsWith('data-')),
  );
}

jest.mock('@legacy-sports/shared-components/ui', () => {
  const PassThrough = ({ children, ...rest }: ChildrenProps) => (
    <div {...mockDomProps(rest)}>{children}</div>
  );
  return {
    Button: ({ children, onPress, ...rest }: ButtonProps) => (
      <button type="button" onClick={onPress} {...mockDomProps(rest)}>
        {children}
      </button>
    ),
    H1: ({ children, ...rest }: ChildrenProps) => (
      <h1 {...mockDomProps(rest)}>{children}</h1>
    ),
    H2: ({ children, ...rest }: ChildrenProps) => (
      <h2 {...mockDomProps(rest)}>{children}</h2>
    ),
    H3: ({ children, ...rest }: ChildrenProps) => (
      <h3 {...mockDomProps(rest)}>{children}</h3>
    ),
    Paragraph: ({ children, ...rest }: ChildrenProps) => (
      <p {...mockDomProps(rest)}>{children}</p>
    ),
    XStack: PassThrough,
    YStack: PassThrough,
  };
});

jest.mock('../../components/PriceSkeleton', () => ({
  PriceSkeleton: () => <div data-testid="price-skeleton" />,
}));

jest.mock('tamagui', () => ({
  styled: <T,>(Component: T) => Component,
  ScrollView: ({ children }: ChildrenProps) => <div>{children}</div>,
  Separator: () => <hr />,
  Text: ({ children, onPress }: ButtonProps) => (
    <span onClick={onPress}>{children}</span>
  ),
}));

jest.mock('@tamagui/lucide-icons', () => ({
  Check: () => null,
  ChevronDown: () => null,
  ChevronUp: () => null,
  Star: () => null,
  X: () => null,
  Zap: () => null,
}));

const mockUseStripePrices = jest.fn();
jest.mock('../../hooks/useStripePrices', () => ({
  useStripePrices: (): unknown => mockUseStripePrices(),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

// LS-8813: useStripePrices returns the hardcoded fallback prices ($4.99/mo,
// $39.99/yr) together with a `loading` flag so callers can suppress the
// fallback while the live Stripe query is in flight.
describe('PricingPage — Premium plan price loading state (LS-8813)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the live monthly price once the query resolves', () => {
    mockUseStripePrices.mockReturnValue({
      monthlyPrice: 9.99,
      annualTotal: 99.99,
      annualSavingsPct: '17%',
      trialPeriodDays: 0,
      loading: false,
    });

    render(<PricingPage />);

    expect(screen.getByTestId('plan-price-annual')).toHaveTextContent('8.33');
    expect(screen.queryByText(/4\.99/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('price-skeleton')).not.toBeInTheDocument();
  });

  it('does not render the hardcoded fallback price while the prices query is in flight', () => {
    mockUseStripePrices.mockReturnValue({
      monthlyPrice: 4.99,
      annualTotal: 39.99,
      annualSavingsPct: '33%',
      trialPeriodDays: 0,
      loading: true,
    });

    render(<PricingPage />);

    expect(screen.queryByText(/4\.99/)).not.toBeInTheDocument();
    expect(screen.queryByText(/39\.99/)).not.toBeInTheDocument();
    expect(screen.getAllByTestId('price-skeleton').length).toBeGreaterThan(0);
  });

  it('still renders the fallback price when the prices query genuinely fails (not loading)', () => {
    mockUseStripePrices.mockReturnValue({
      monthlyPrice: 4.99,
      annualTotal: 39.99,
      annualSavingsPct: '33%',
      trialPeriodDays: 0,
      loading: false,
    });

    render(<PricingPage />);

    expect(screen.getByTestId('plan-price-annual')).toHaveTextContent('3.33');
    expect(screen.queryByTestId('price-skeleton')).not.toBeInTheDocument();
  });
});
