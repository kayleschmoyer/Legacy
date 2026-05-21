/**
 * LS-4587 — Sport switcher tests for the Create League page.
 *
 * Covers:
 *   1. Both sport tabs render with their accessible role/labels.
 *   2. Baseball starts selected (aria-selected="true").
 *   3. Clicking Football does NOT change selection — Baseball stays selected.
 *   4. Clicking Football reveals the "coming soon" status notice.
 *   5. Dismissing the notice hides it again.
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

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
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
  useCreateLeagueAndTeamsMutation: jest.fn(() => [
    mockCreateLeague,
    { loading: false },
  ]),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  const Page = require('./LeagueCreatePage')
    .LeagueCreatePage as React.ComponentType;
  return render(
    <MemoryRouter initialEntries={['/baseball/league/create']}>
      <Routes>
        <Route path="/baseball/league/create" element={<Page />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LeagueCreatePage — sport switcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
  });

  it('renders both sport tabs', () => {
    renderPage();
    expect(screen.getByTestId('sport-tab-baseball')).toBeInTheDocument();
    expect(screen.getByTestId('sport-tab-football')).toBeInTheDocument();
  });

  it('selects Baseball by default', () => {
    renderPage();
    expect(screen.getByTestId('sport-tab-baseball')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('sport-tab-football')).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('does not surface the coming-soon notice on first render', () => {
    renderPage();
    expect(
      screen.queryByText(/Football leagues are coming soon/i),
    ).not.toBeInTheDocument();
  });

  it('shows the coming-soon notice when Football is clicked', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('sport-tab-football'));
    expect(
      screen.getByText(/Football leagues are coming soon/i),
    ).toBeInTheDocument();
    // Baseball stays selected — Football is presentation-only for this PR.
    expect(screen.getByTestId('sport-tab-baseball')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('dismisses the coming-soon notice via the Dismiss button', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('sport-tab-football'));
    expect(
      screen.getByText(/Football leagues are coming soon/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Dismiss/i));
    expect(
      screen.queryByText(/Football leagues are coming soon/i),
    ).not.toBeInTheDocument();
  });
});
