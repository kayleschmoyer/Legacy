/**
 * LS-4631 — Sport-aware Create League page.
 *
 * Covers:
 *   1. Both sport tabs render with their accessible role/labels.
 *   2. Default selection follows the URL — `/baseball/league/create`
 *      selects Baseball, `/football/league/create` selects Football.
 *   3. The H1 reflects the active sport.
 *   4. Football mode swaps in football-specific era + pool options.
 *   5. Baseball mode keeps baseball-specific era + pool options.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any */
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories need runtime require */
/* eslint-disable @typescript-eslint/no-unsafe-return -- mock factories return untyped JSX */
/* eslint-disable react/jsx-no-useless-fragment -- single-child fragments are intentional in mocks */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// Default football_enabled = true so both sport tabs are visible in tests.
jest.mock('../../context/GrowthBookProvider', () => ({
  useFeatureIsOn: jest.fn(() => true),
  useFeatureValue: jest.fn(() => null),
  GrowthBookProvider: ({ children }: any) => <>{children}</>,
  growthbook: {},
}));

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));
jest.mock('../../components/PremiumGate', () => ({
  PremiumGate: ({ children }: any) => <>{children}</>,
}));
jest.mock('../../components/UpgradeModal', () => ({
  UpgradeModal: () => null,
}));

jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremiumStatus: () => ({ isPremium: false, isLoading: false }),
}));

jest.mock('../../utils/analytics', () => ({
  trackPremiumFeatureClick: jest.fn(),
}));

jest.mock('@legacy-sports/shared-components/ui', () => ({
  Button: ({ children, onPress, disabled, ...rest }: any) => (
    <button
      data-testid={rest['data-testid']}
      aria-selected={rest['aria-selected']}
      aria-label={rest['aria-label']}
      role={rest.role}
      onClick={onPress}
      disabled={disabled}
    >
      {children}
    </button>
  ),
  DateTimePicker: () => <input data-testid="datetime-picker" />,
}));

jest.mock('@tamagui/lucide-icons', () => ({
  AlertCircle: () => <span data-testid="icon-alert" />,
  Check: () => <span data-testid="icon-check" />,
  ChevronRight: () => <span data-testid="icon-chevron" />,
  Lock: () => <span data-testid="icon-lock" />,
}));

jest.mock('tamagui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLocal = require('react');
  const passthrough = ({ children, ...rest }: any) =>
    ReactLocal.createElement(
      'div',
      {
        'data-testid': rest['data-testid'],
        role: rest.role,
        'aria-live': rest['aria-live'],
      },
      children,
    );
  return {
    Card: passthrough,
    H1: ({ children }: any) => ReactLocal.createElement('h1', null, children),
    H2: ({ children }: any) => ReactLocal.createElement('h2', null, children),
    Input: ({ value, onChangeText, id, placeholder, disabled }: any) =>
      ReactLocal.createElement('input', {
        id,
        placeholder,
        disabled,
        value: value ?? '',
        onChange: (e: any) => onChangeText?.(e.target.value),
      }),
    Label: ({ children }: any) =>
      ReactLocal.createElement('label', null, children),
    ScrollView: passthrough,
    styled: () => passthrough,
    Text: ({ children }: any) =>
      ReactLocal.createElement('span', null, children),
    XStack: passthrough,
    YStack: passthrough,
  };
});

const mockCreateLeague = jest.fn();
jest.mock('../../api/db/graphql.generated', () => ({
  GetUserLeagues: 'GetUserLeagues',
  Sport: { Baseball: 'baseball', Football: 'football' },
  useCreateLeagueAndTeamsMutation: jest.fn(() => [
    mockCreateLeague,
    { loading: false },
  ]),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage(initialPath = '/baseball/league/create') {
  const Page = require('./LeagueCreatePage')
    .LeagueCreatePage as React.ComponentType;
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/baseball/league/create" element={<Page />} />
        <Route path="/football/league/create" element={<Page />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Expand all collapsible sections so era / pool controls are mounted. */
function expandAllSections() {
  fireEvent.click(screen.getByRole('button', { name: /Expand all/i }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LeagueCreatePage — sport-aware (LS-4631)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
  });

  it('renders both sport tabs at the baseball URL', () => {
    renderPage('/baseball/league/create');
    expect(screen.getByTestId('sport-tab-baseball')).toBeInTheDocument();
    expect(screen.getByTestId('sport-tab-football')).toBeInTheDocument();
  });

  it('selects Baseball at /baseball/league/create with a baseball heading', () => {
    renderPage('/baseball/league/create');
    expect(screen.getByTestId('sport-tab-baseball')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('sport-tab-football')).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(
      screen.getByRole('heading', { name: /Create Baseball League/i }),
    ).toBeInTheDocument();
  });

  it('selects Football at /football/league/create with a football heading', () => {
    renderPage('/football/league/create');
    expect(screen.getByTestId('sport-tab-football')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('sport-tab-baseball')).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(
      screen.getByRole('heading', { name: /Create Football League/i }),
    ).toBeInTheDocument();
  });

  it('shows football-specific eras at the football URL', () => {
    renderPage('/football/league/create');
    expandAllSections();
    // Football eras include "Pioneer" and "Super Bowl Era".
    expect(screen.getByText(/^Pioneer$/)).toBeInTheDocument();
    expect(screen.getByText(/Super Bowl Era/)).toBeInTheDocument();
    // Baseball-only eras must not appear in football mode.
    expect(screen.queryByText(/Dead Ball/)).not.toBeInTheDocument();
  });

  it('shows baseball-specific eras at the baseball URL', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    expect(screen.getByText(/Dead Ball/)).toBeInTheDocument();
    expect(screen.getByText(/Steroid Era/)).toBeInTheDocument();
    expect(screen.queryByText(/^Pioneer$/)).not.toBeInTheDocument();
  });

  it('shows football conference pool labels at the football URL', () => {
    renderPage('/football/league/create');
    expandAllSections();
    expect(screen.getByRole('button', { name: 'All NFL' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'NFC' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AFC' })).toBeInTheDocument();
    // Baseball-specific pool labels do not appear.
    expect(
      screen.queryByRole('button', { name: 'All MLB' }),
    ).not.toBeInTheDocument();
  });

  it('surfaces the football Beta banner only on the football URL', () => {
    renderPage('/football/league/create');
    expect(screen.getByTestId('football-beta-banner')).toBeInTheDocument();
  });

  it('does not surface the football Beta banner on the baseball URL', () => {
    renderPage('/baseball/league/create');
    expect(
      screen.queryByTestId('football-beta-banner'),
    ).not.toBeInTheDocument();
  });
});
