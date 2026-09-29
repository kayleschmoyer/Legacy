import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ENTITLEMENT_LABELS, ENTITLEMENTS } from '@legacy-sports/utils';

import PricingPage, { COMPARISON_ROWS } from './PricingPage';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a
      href={to}
      {...Object.fromEntries(
        Object.entries(rest).filter(([key]) => key.startsWith('data-')),
      )}
    >
      {children}
    </a>
  ),
}));

jest.mock('../../components/PageMeta', () => ({
  PageMeta: () => null,
}));

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));

type ChildrenProps = { children?: React.ReactNode; [key: string]: unknown };
type ButtonProps = ChildrenProps & { onPress?: () => void };

// Only forward data-* attributes (used as test selectors) and the a11y/keyboard
// props (role, aria-*, tabIndex, onKeyDown) to the underlying DOM node —
// Tamagui style props (fontWeight, alignItems, $sm, etc.) are not valid DOM
// attributes and would otherwise spam React "unknown prop" warnings.
const FORWARDED_PROPS = new Set(['role', 'tabIndex', 'onKeyDown', 'scope']);
function mockDomProps(rest: ChildrenProps): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(rest).filter(
      ([key]) =>
        key.startsWith('data-') ||
        key.startsWith('aria-') ||
        FORWARDED_PROPS.has(key),
    ),
  );
}

jest.mock('@legacy-sports/shared-components/ui', () => {
  // Stacks also honor `tag` so the comparison-table markup (real
  // table/thead/tbody/tr/th/td) can be asserted (LS-7180).
  const PassThrough = ({ children, tag, ...rest }: ChildrenProps) => {
    const Element = (typeof tag === 'string' ? tag : 'div') as 'div';
    return <Element {...mockDomProps(rest)}>{children}</Element>;
  };
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
    Paragraph: ({ children, tag, ...rest }: ChildrenProps) => {
      const Tag = (typeof tag === 'string' ? tag : 'p') as 'p';
      return <Tag {...mockDomProps(rest)}>{children}</Tag>;
    },
    XStack: PassThrough,
    YStack: PassThrough,
  };
});

jest.mock('../../components/PriceSkeleton', () => ({
  PriceSkeleton: () => <div data-testid="price-skeleton" />,
}));

jest.mock('tamagui', () => ({
  createTokens: (tokens: unknown) => tokens,
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

// LS-7182 — pricing copy must not silently drift from the entitlement catalog.
describe('COMPARISON_ROWS ↔ entitlements catalog', () => {
  const EXPECTED_ROW_ENTITLEMENTS: Array<[string, string]> = [
    ['Leagues', ENTITLEMENTS.unlimited_leagues],
    ['Stats', ENTITLEMENTS.football_projections],
    ['Waiver system', ENTITLEMENTS.faab_waiver_type],
    ['Playoff formats', ENTITLEMENTS.advanced_playoff_formats],
    ['Historical eras', ENTITLEMENTS.historical_era_filters],
    ['Mock drafts / week', ENTITLEMENTS.unlimited_mock_drafts],
    ['Player comparison', ENTITLEMENTS.player_comparison],
    ['Draft recommendations', ENTITLEMENTS.draft_recommendations],
    ['AI-powered recaps', ENTITLEMENTS.ai_matchup_recap],
    ['Salary cap leagues', ENTITLEMENTS.salary_cap_leagues],
  ];

  it('pins every comparison row to its expected entitlement (no rows added/removed unnoticed)', () => {
    expect(
      COMPARISON_ROWS.map((row) => [row.feature, row.entitlement]),
    ).toEqual(EXPECTED_ROW_ENTITLEMENTS);
  });

  it.each(EXPECTED_ROW_ENTITLEMENTS)(
    '%s references a live catalog entitlement with a label',
    (_feature, key) => {
      expect(Object.values(ENTITLEMENTS)).toContain(key);
      expect(ENTITLEMENT_LABELS).toHaveProperty(key);
    },
  );

  it('boolean rows are premium-only (free=false, premium=true)', () => {
    COMPARISON_ROWS.filter(
      (row) =>
        typeof row.free === 'boolean' || typeof row.premium === 'boolean',
    ).forEach((row) => {
      expect({
        feature: row.feature,
        free: row.free,
        premium: row.premium,
      }).toEqual({
        feature: row.feature,
        free: false,
        premium: true,
      });
    });
  });
});

// LS-7186: the Help Center link must be a real anchor so middle-click,
// open-in-new-tab and crawlers work.
describe('PricingPage — Help Center link (LS-7186)', () => {
  it('renders "Visit our Help Center" as an anchor pointing at /help', () => {
    mockUseStripePrices.mockReturnValue({
      monthlyPrice: 4.99,
      annualTotal: 39.99,
      annualSavingsPct: '33%',
      trialPeriodDays: 0,
      loading: false,
    });

    render(<PricingPage />);

    const link = screen.getByTestId('pricing-help-center-link');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/help');
    expect(link).toHaveTextContent('Visit our Help Center');
  });
});

// LS-7201: testimonials must use blockquote + cite semantics for a11y/SEO.
describe('PricingPage — testimonial semantics (LS-7201)', () => {
  it('renders each testimonial as a blockquote with the author in a cite', () => {
    mockUseStripePrices.mockReturnValue({
      monthlyPrice: 4.99,
      annualTotal: 39.99,
      annualSavingsPct: '33%',
      trialPeriodDays: 0,
      loading: false,
    });

    const { container } = render(<PricingPage />);

    const quotes = container.querySelectorAll('blockquote');
    expect(quotes.length).toBeGreaterThan(0);
    quotes.forEach((quote) => {
      const cite = quote.querySelector('cite');
      expect(cite).not.toBeNull();
      expect(cite?.textContent?.trim()).not.toBe('');
      expect(quote.querySelector('p')?.textContent).toMatch(/^“.+”$/);
    });
  });
});

// LS-7187: on narrow viewports the gold "game" must not wrap onto a line by
// itself, so it is joined to the preceding word with a non-breaking space.
describe('PricingPage — hero heading wrapping (LS-7187)', () => {
  it('joins "your" and the gold "game" with a non-breaking space', () => {
    mockUseStripePrices.mockReturnValue({
      monthlyPrice: 4.99,
      annualTotal: 39.99,
      annualSavingsPct: '33%',
      trialPeriodDays: 0,
      loading: false,
    });

    render(<PricingPage />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('The plan that fits your\u00a0game');
  });
});

// LS-7167: the Monthly/Annual toggle must be keyboard operable.
describe('PricingPage — billing toggle keyboard accessibility (LS-7167)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseStripePrices.mockReturnValue({
      monthlyPrice: 9.99,
      annualTotal: 99.99,
      annualSavingsPct: '17%',
      trialPeriodDays: 0,
      loading: false,
    });
  });

  it('exposes a radiogroup with Annual checked by default and a roving tabindex', () => {
    render(<PricingPage />);

    expect(
      screen.getByRole('radiogroup', { name: 'Billing period' }),
    ).toBeInTheDocument();
    const monthly = screen.getByRole('radio', { name: /Monthly/ });
    const annual = screen.getByRole('radio', { name: /Annual/ });
    expect(annual).toHaveAttribute('aria-checked', 'true');
    expect(monthly).toHaveAttribute('aria-checked', 'false');
    expect(annual).toHaveAttribute('tabindex', '0');
    expect(monthly).toHaveAttribute('tabindex', '-1');
  });

  it('selects the focused option with Enter and Space', async () => {
    const user = userEvent.setup();
    render(<PricingPage />);
    const monthly = screen.getByRole('radio', { name: /Monthly/ });
    const annual = screen.getByRole('radio', { name: /Annual/ });

    monthly.focus();
    await user.keyboard('{Enter}');
    expect(monthly).toHaveAttribute('aria-checked', 'true');
    expect(annual).toHaveAttribute('aria-checked', 'false');

    annual.focus();
    await user.keyboard(' ');
    expect(annual).toHaveAttribute('aria-checked', 'true');
    expect(monthly).toHaveAttribute('aria-checked', 'false');
  });

  it('moves selection and focus between options with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<PricingPage />);
    const monthly = screen.getByRole('radio', { name: /Monthly/ });
    const annual = screen.getByRole('radio', { name: /Annual/ });

    annual.focus();
    await user.keyboard('{ArrowLeft}');
    expect(monthly).toHaveAttribute('aria-checked', 'true');
    expect(monthly).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(annual).toHaveAttribute('aria-checked', 'true');
    expect(annual).toHaveFocus();
  });
});

// LS-7180: the comparison table must expose table semantics so screen readers
// can navigate it by row and column.
describe('PricingPage — feature comparison table semantics (LS-7180)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseStripePrices.mockReturnValue({
      monthlyPrice: 4.99,
      annualTotal: 39.99,
      annualSavingsPct: '33%',
      trialPeriodDays: 0,
      loading: false,
    });
  });

  it('exposes a named table with rowgroups, rows, column headers and cells', () => {
    render(<PricingPage />);

    const table = screen.getByRole('table', {
      name: /feature comparison/i,
    });
    expect(table.tagName).toBe('TABLE');

    expect(within(table).getAllByRole('rowgroup')).toHaveLength(2);

    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent)).toEqual([
      'Feature',
      'Free',
      'Premium',
    ]);
    headers.forEach((h) => expect(h).toHaveAttribute('scope', 'col'));

    const rows = within(table).getAllByRole('row');
    // One header row plus one row per comparison feature.
    expect(rows.length).toBeGreaterThan(1);
    rows.slice(1).forEach((row) => {
      expect(within(row).getAllByRole('cell')).toHaveLength(3);
    });
  });
});
