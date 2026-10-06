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

const mockUseAuth = jest.fn();
jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: (): unknown => mockUseAuth(),
}));

const mockUseIsPremiumStatus = jest.fn();
jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremiumStatus: (): unknown => mockUseIsPremiumStatus(),
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

const mockUseMyBillingInterval = jest.fn();
jest.mock('../../hooks/useMyBillingInterval', () => ({
  useMyBillingInterval: (...args: unknown[]): unknown =>
    mockUseMyBillingInterval(...args),
}));

beforeEach(() => {
  mockUseMyBillingInterval.mockReturnValue({
    billingInterval: null,
    isLoading: false,
  });
  mockUseAuth.mockReturnValue({ isAuthenticated: false });
  mockUseIsPremiumStatus.mockReturnValue({
    isPremium: false,
    isLoading: false,
  });
});

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

  // LS-7194: no price-affecting copy (savings %, billed-amount lines) may show
  // fallback-derived numbers while live prices are still loading, on either
  // billing cycle.
  it('hides savings and billed-amount copy while loading, on both billing cycles', async () => {
    const user = userEvent.setup();
    mockUseStripePrices.mockReturnValue({
      monthlyPrice: 4.99,
      annualTotal: 39.99,
      annualSavingsPct: '33%',
      trialPeriodDays: 0,
      loading: true,
    });

    render(<PricingPage />);

    const assertNoPriceCopy = () => {
      expect(screen.queryByText(/33%/)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Billed (annually|monthly)/),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/\/mo/)).not.toBeInTheDocument();
    };

    assertNoPriceCopy();

    await user.click(screen.getByText('Monthly'));
    assertNoPriceCopy();

    await user.click(screen.getByText('Annual'));
    assertNoPriceCopy();
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

  // LS-7191: $39.99 / 12 = $3.3325 — 12 × $3.33 ≠ $39.99, so the per-month
  // figure must be flagged as approximate.
  it('marks the annual per-month price as approximate when it does not divide evenly', () => {
    mockUseStripePrices.mockReturnValue({
      monthlyPrice: 4.99,
      annualTotal: 39.99,
      annualSavingsPct: '33%',
      trialPeriodDays: 0,
      loading: false,
    });

    render(<PricingPage />);

    expect(screen.getByTestId('plan-price-annual')).toHaveTextContent(
      '~$3.33/mo',
    );
  });

  it('shows an exact annual per-month price without the approximate marker', () => {
    mockUseStripePrices.mockReturnValue({
      monthlyPrice: 7.99,
      annualTotal: 83.88,
      annualSavingsPct: '13%',
      trialPeriodDays: 0,
      loading: false,
    });

    render(<PricingPage />);

    const price = screen.getByTestId('plan-price-annual');
    expect(price).toHaveTextContent('$6.99/mo');
    expect(price).not.toHaveTextContent('~');
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

// LS-7171: an already-annual Premium user must not be pushed toward annual
// savings they already get.
describe('PricingPage — billing toggle for Premium subscribers (LS-7171)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockUseStripePrices.mockReturnValue({
      monthlyPrice: 9.99,
      annualTotal: 99.99,
      annualSavingsPct: '17%',
      trialPeriodDays: 0,
      loading: false,
    });
  });

  function setPremium(
    billingInterval: 'monthly' | 'annual' | null,
    isLoading = false,
  ) {
    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: true,
      isLoading: false,
    });
    mockUseMyBillingInterval.mockReturnValue({ billingInterval, isLoading });
  }

  it('shows "Your plan: Annual" instead of the toggle and savings copy for an annual Premium user', () => {
    setPremium('annual');

    render(<PricingPage />);

    expect(screen.getByTestId('billing-current-plan')).toHaveTextContent(
      'Your plan: Annual',
    );
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByText(/Save 17%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/save 17%/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('plan-price-annual')).toBeInTheDocument();
    expect(screen.getByText(/Billed annually \(\$99\.99\/yr\)/)).toBeVisible();
  });

  it('shows "Your plan: Premium Annual" in the hero badge for an annual Premium user', () => {
    setPremium('annual');

    render(<PricingPage />);

    expect(screen.getByTestId('hero-plan-badge')).toHaveTextContent(
      'Your plan: Premium Annual',
    );
    expect(
      screen.queryByText('Simple, transparent pricing'),
    ).not.toBeInTheDocument();
  });

  it('shows "Your plan: Premium Monthly" in the hero badge for a monthly Premium user', () => {
    setPremium('monthly');

    render(<PricingPage />);

    expect(screen.getByTestId('hero-plan-badge')).toHaveTextContent(
      'Your plan: Premium Monthly',
    );
  });

  it('falls back to "Your plan: Premium" in the hero badge when the interval is unknown', () => {
    setPremium(null);

    render(<PricingPage />);

    expect(screen.getByTestId('hero-plan-badge')).toHaveTextContent(
      'Your plan: Premium',
    );
  });

  it('keeps the generic hero badge for a non-Premium user', () => {
    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: false,
      isLoading: false,
    });

    render(<PricingPage />);

    expect(screen.getByTestId('hero-plan-badge')).toHaveTextContent(
      'Simple, transparent pricing',
    );
  });

  it('keeps the toggle and savings badge for a monthly Premium user', () => {
    setPremium('monthly');

    render(<PricingPage />);

    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getByText('Save 17%')).toBeInTheDocument();
    expect(
      screen.queryByTestId('billing-current-plan'),
    ).not.toBeInTheDocument();
  });

  it('keeps the toggle for a Premium user whose interval is unknown', () => {
    setPremium(null);

    render(<PricingPage />);

    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getByText('Save 17%')).toBeInTheDocument();
  });

  it("does not flash the savings badge while a Premium user's interval is loading", () => {
    setPremium(null, true);

    render(<PricingPage />);

    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.queryByText('Save 17%')).not.toBeInTheDocument();
  });

  it('leaves the toggle and badge unchanged for non-Premium users and skips the interval lookup', () => {
    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: false,
      isLoading: false,
    });

    render(<PricingPage />);

    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getByText('Save 17%')).toBeInTheDocument();
    expect(mockUseMyBillingInterval).toHaveBeenCalledWith({ skip: true });
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

// LS-7184 / LS-7185: the Free plan card CTA depends on who is viewing the page.
describe('PricingPage — Free plan card CTA by viewer state (LS-7184, LS-7185)', () => {
  beforeEach(() => {
    mockUseStripePrices.mockReturnValue({
      monthlyPrice: 4.99,
      annualTotal: 39.99,
      annualSavingsPct: '33%',
      trialPeriodDays: 0,
      loading: false,
    });
  });

  it('shows "Get Started Free" (card and bottom CTA) to unauthenticated visitors', () => {
    render(<PricingPage />);

    expect(
      screen.getAllByRole('button', { name: /get started free/i }),
    ).toHaveLength(2);
    expect(screen.queryByText('Current plan')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('free-plan-included-badge'),
    ).not.toBeInTheDocument();
  });

  it('shows a disabled "Current plan" marker instead for authenticated free users', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });

    render(<PricingPage />);

    expect(
      screen.queryByRole('button', { name: /get started free/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('free-plan-current')).toHaveTextContent(
      'Current plan',
    );
    expect(
      screen.queryByTestId('free-plan-included-badge'),
    ).not.toBeInTheDocument();
  });

  it('replaces the Free card CTA with a disabled "Includes Free tier" badge for premium users (LS-7185)', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: true,
      isLoading: false,
    });

    render(<PricingPage />);

    const freeCard = screen.getByTestId('plan-card-free');
    expect(
      within(freeCard).queryByRole('button', { name: 'Get Started Free' }),
    ).not.toBeInTheDocument();
    const badge = within(freeCard).getByTestId('free-plan-included-badge');
    expect(badge).toHaveTextContent('Includes Free tier');
    expect(badge).toHaveAttribute('aria-disabled', 'true');
    expect(
      within(freeCard).queryByText('Current plan'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /get started free/i }),
    ).not.toBeInTheDocument();
  });

  it('labels the Premium card as the current plan for premium users only (LS-7199)', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: true,
      isLoading: false,
    });

    const { unmount } = render(<PricingPage />);

    const premiumCard = screen.getByTestId('plan-card-premium');
    expect(
      within(premiumCard).getByTestId('premium-plan-current'),
    ).toHaveTextContent('Current plan');
    // The Free card shows "Includes Free tier", so the label appears once.
    expect(screen.getAllByText('Current plan')).toHaveLength(1);
    unmount();

    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: false,
      isLoading: false,
    });
    render(<PricingPage />);

    expect(
      screen.queryByTestId('premium-plan-current'),
    ).not.toBeInTheDocument();
  });

  it('does not claim "Current plan" while the tier is still loading', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: false,
      isLoading: true,
    });

    render(<PricingPage />);

    expect(screen.queryByText('Current plan')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /get started free/i }),
    ).not.toBeInTheDocument();
  });
});

// LS-7193: a Premium subscriber must not be offered a second checkout.
describe('PricingPage — Premium card CTA by viewer state (LS-7193)', () => {
  beforeEach(() => {
    mockUseStripePrices.mockReturnValue({
      monthlyPrice: 4.99,
      annualTotal: 39.99,
      annualSavingsPct: '33%',
      trialPeriodDays: 0,
      loading: false,
    });
  });

  it('shows "Upgrade to Premium" (card and bottom CTA) to unauthenticated visitors', () => {
    render(<PricingPage />);

    expect(
      screen.getAllByRole('button', { name: 'Upgrade to Premium' }),
    ).toHaveLength(2);
    expect(screen.queryByText('Manage subscription')).not.toBeInTheDocument();
  });

  it('shows "Upgrade to Premium" to authenticated free users', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: false,
      isLoading: false,
    });

    render(<PricingPage />);

    expect(
      screen.getAllByRole('button', { name: 'Upgrade to Premium' }),
    ).toHaveLength(2);
    expect(screen.queryByText('Manage subscription')).not.toBeInTheDocument();
  });

  it('replaces "Upgrade to Premium" with "Manage subscription" for premium users', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: true,
      isLoading: false,
    });

    render(<PricingPage />);

    const premiumCard = screen.getByTestId('plan-card-premium');
    expect(
      within(premiumCard).getByRole('button', { name: 'Manage subscription' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Manage subscription')).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: /upgrade to premium/i }),
    ).not.toBeInTheDocument();
  });

  it("shows neither CTA while an authenticated user's tier is still loading", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    mockUseIsPremiumStatus.mockReturnValue({
      isPremium: false,
      isLoading: true,
    });

    render(<PricingPage />);

    expect(
      screen.queryByRole('button', { name: /upgrade to premium/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Manage subscription')).not.toBeInTheDocument();
  });
});

// LS-7168: "Save 30%" alone gives screen reader users no idea what it is
// relative to, so the Annual option's accessible name carries the context.
describe('PricingPage — annual option accessible name (LS-7168)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('names the savings relative to monthly billing', () => {
    mockUseStripePrices.mockReturnValue({
      monthlyPrice: 9.99,
      annualTotal: 99.99,
      annualSavingsPct: '17%',
      trialPeriodDays: 0,
      loading: false,
    });
    render(<PricingPage />);

    expect(
      screen.getByRole('radio', {
        name: 'Annual billing, save 17% compared with monthly',
      }),
    ).toBeInTheDocument();
  });

  it('omits the percentage from the name while prices are loading', () => {
    mockUseStripePrices.mockReturnValue({
      monthlyPrice: 9.99,
      annualTotal: 99.99,
      annualSavingsPct: '17%',
      trialPeriodDays: 0,
      loading: true,
    });
    render(<PricingPage />);

    expect(
      screen.getByRole('radio', { name: 'Annual billing' }),
    ).toBeInTheDocument();
  });
});
