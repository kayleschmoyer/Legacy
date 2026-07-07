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
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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

jest.mock('@legacy-sports/shared-components', () => ({
  Dialog: ({
    open,
    title,
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
  }: any) =>
    open ? (
      <div role="alertdialog" aria-label={title}>
        <span>{description}</span>
        <button onClick={onConfirm}>{confirmLabel}</button>
        <button onClick={onCancel}>{cancelLabel}</button>
      </div>
    ) : null,
}));

let mockIsPremium = false;
jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremiumStatus: () => ({ isPremium: mockIsPremium, isLoading: false }),
}));

jest.mock('../../utils/analytics', () => ({
  trackPremiumFeatureClick: jest.fn(),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    // Spy on navigate() calls while still delegating to the real navigate,
    // so route-driven effects (sport switch, Cancel navigation) keep working
    // for tests that don't care about the call args.
    useNavigate: () => {
      const realNavigate = actual.useNavigate();
      return (...args: Parameters<typeof realNavigate>) => {
        mockNavigate(...args);
        return realNavigate(...args);
      };
    },
  };
});

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
let mockLeagueCount = 0;
jest.mock('@legacy-sports/graphql', () => ({
  GetUserLeagues: 'GetUserLeagues',
  Sport: { Baseball: 'baseball', Football: 'football' },
  useCreateLeagueAndTeamsMutation: jest.fn(() => [
    mockCreateLeague,
    { loading: false },
  ]),
  useGetUserLeaguesQuery: jest.fn(() => ({
    data: {
      userLeagues: Array.from({ length: mockLeagueCount }, (_, i) => ({
        id: i + 1,
        name: `League ${i + 1}`,
      })),
    },
  })),
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
        <Route path="/baseball" element={<div>Baseball Home</div>} />
        <Route path="/football" element={<div>Football Home</div>} />
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

describe('LeagueCreatePage — free league limit (LS-5012)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
  });

  it('does not show the limit banner when a free user has fewer than 3 leagues', () => {
    mockLeagueCount = 2;
    renderPage('/baseball/league/create');
    expect(screen.queryByTestId('league-limit-banner')).not.toBeInTheDocument();
  });

  it('shows the limit banner when a free user has exactly 3 leagues', () => {
    mockLeagueCount = 3;
    renderPage('/baseball/league/create');
    expect(screen.getByTestId('league-limit-banner')).toBeInTheDocument();
  });

  it('shows the limit banner when a free user has more than 3 leagues', () => {
    mockLeagueCount = 5;
    renderPage('/baseball/league/create');
    expect(screen.getByTestId('league-limit-banner')).toBeInTheDocument();
  });

  it('does not show the limit banner for premium users at 3 leagues', () => {
    mockLeagueCount = 3;
    mockIsPremium = true;
    renderPage('/baseball/league/create');
    expect(screen.queryByTestId('league-limit-banner')).not.toBeInTheDocument();
  });
});

describe('LeagueCreatePage — sport-aware (LS-4631)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
  });

  it('pushes (not replaces) history when switching sport, so Back returns to the prior sport create page (LS-6110)', () => {
    renderPage('/baseball/league/create');
    fireEvent.click(screen.getByTestId('sport-tab-football'));
    const call = mockNavigate.mock.calls.find(
      ([to]) => to === '/football/league/create',
    );
    expect(call).toBeDefined();
    expect(call?.[1]?.replace).not.toBe(true);
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

  it('resets leagueName when switching sport via the URL (LS-6111)', () => {
    renderPage('/baseball/league/create');

    const nameInput = screen.getByPlaceholderText('Enter your league name');
    fireEvent.change(nameInput, { target: { value: 'My MLB Dynasty' } });
    expect(nameInput).toHaveValue('My MLB Dynasty');

    fireEvent.click(screen.getByTestId('sport-tab-football'));

    expect(screen.getByPlaceholderText('Enter your league name')).toHaveValue(
      '',
    );
  });
});

describe('LeagueCreatePage — selection reset notice (LS-4088)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
  });

  it('shows the reset notice when switching from Auction to Automated draft', () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    // Select Auction before switching draft mode
    fireEvent.click(screen.getByRole('button', { name: /^Auction$/i }));

    // Switch to Automated Draft
    fireEvent.click(screen.getByRole('button', { name: /^Automated Draft$/i }));

    expect(screen.getByTestId('selection-reset-notice')).toBeInTheDocument();
  });

  it('does not show the reset notice when the selection method is already Random', () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    // Switch to Automated (resets to Random, notice appears)
    fireEvent.click(screen.getByRole('button', { name: /^Automated Draft$/i }));
    const notice = screen.getByTestId('selection-reset-notice');
    fireEvent.click(within(notice).getByRole('button', { name: /^Dismiss$/i }));

    // Switch back to Live, then to Automated again — already Random, no notice
    fireEvent.click(screen.getByRole('button', { name: /^Live Draft$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Automated Draft$/i }));

    expect(
      screen.queryByTestId('selection-reset-notice'),
    ).not.toBeInTheDocument();
  });

  it('dismisses the reset notice when the Dismiss button is clicked', () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    fireEvent.click(screen.getByRole('button', { name: /^Auction$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Automated Draft$/i }));

    const notice = screen.getByTestId('selection-reset-notice');
    expect(notice).toBeInTheDocument();

    fireEvent.click(within(notice).getByRole('button', { name: /^Dismiss$/i }));
    expect(
      screen.queryByTestId('selection-reset-notice'),
    ).not.toBeInTheDocument();
  });

  it('auto-dismisses the reset notice when switching back to Live Draft', () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    fireEvent.click(screen.getByRole('button', { name: /^Auction$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Automated Draft$/i }));
    expect(screen.getByTestId('selection-reset-notice')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Live Draft$/i }));
    expect(
      screen.queryByTestId('selection-reset-notice'),
    ).not.toBeInTheDocument();
  });
});

describe('LeagueCreatePage — Cancel discard confirmation (LS-6108)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
  });

  it('navigates immediately when Cancel is clicked with no unsaved changes', () => {
    renderPage('/baseball/league/create');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Baseball Home')).toBeInTheDocument();
  });

  it('shows a discard-confirmation dialog when Cancel is clicked with unsaved changes', () => {
    renderPage('/baseball/league/create');
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(
      screen.getByRole('alertdialog', { name: 'Discard this league?' }),
    ).toBeInTheDocument();
    // Still on the create page — no navigation happened yet.
    expect(
      screen.getByPlaceholderText('Enter your league name'),
    ).toBeInTheDocument();
  });

  it('navigates away when the discard confirmation is confirmed', () => {
    renderPage('/baseball/league/create');
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.getByText('Baseball Home')).toBeInTheDocument();
  });

  it('stays on the page and preserves form state when discard is dismissed', () => {
    renderPage('/baseball/league/create');
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Keep Editing' }));

    expect(
      screen.queryByRole('alertdialog', { name: 'Discard this league?' }),
    ).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter your league name')).toHaveValue(
      'Test League',
    );
  });
});

describe('LeagueCreatePage — Pick Timer (LS-7966)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
  });

  it('shows "Time Per Pick" field when draft mode is live (default)', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    expect(screen.getByText('Time Per Pick')).toBeInTheDocument();
  });

  it('hides "Time Per Pick" field when switching to automated draft mode', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    expect(screen.getByText('Time Per Pick')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Automated Draft$/i }));
    expect(screen.queryByText('Time Per Pick')).not.toBeInTheDocument();
  });

  it('restores "Time Per Pick" field when switching back to live draft mode', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    fireEvent.click(screen.getByRole('button', { name: /^Automated Draft$/i }));
    expect(screen.queryByText('Time Per Pick')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Live Draft$/i }));
    expect(screen.getByText('Time Per Pick')).toBeInTheDocument();
  });

  it('defaults pick timer to 2 min (120 s) for live drafts', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    // The ButtonGroup renders one option button per PICK_TIME_OPTIONS entry.
    // "2 min" corresponds to 120 s (the DB default).
    expect(screen.getByRole('button', { name: '2 min' })).toBeInTheDocument();
  });

  it('includes the pick timer label in the draft settings collapsed summary', () => {
    renderPage('/baseball/league/create');
    // The summary span is rendered even when the section is collapsed.
    expect(screen.getByText(/2 min\/pick/)).toBeInTheDocument();
  });

  it('passes pickTimeLimitSeconds to mutation for live draft', async () => {
    renderPage('/baseball/league/create');
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });
    const submitBtn = screen.getByTestId('create-league-submit');
    fireEvent.submit(submitBtn.closest('form') as HTMLFormElement);
    await waitFor(() => expect(mockCreateLeague).toHaveBeenCalledTimes(1));
    expect(mockCreateLeague).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          input: expect.objectContaining({
            pickTimeLimitSeconds: 120,
          }),
        }),
      }),
    );
  });

  it('omits pickTimeLimitSeconds from mutation for automated draft', async () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    fireEvent.click(screen.getByRole('button', { name: /^Automated Draft$/i }));
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });
    const submitBtn = screen.getByTestId('create-league-submit');
    fireEvent.submit(submitBtn.closest('form') as HTMLFormElement);
    await waitFor(() => expect(mockCreateLeague).toHaveBeenCalledTimes(1));
    expect(mockCreateLeague).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          input: expect.objectContaining({
            pickTimeLimitSeconds: undefined,
          }),
        }),
      }),
    );
  });
});

describe('LeagueCreatePage — unsaved-changes navigation guard (LS-6109)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
  });

  function dispatchBeforeUnload() {
    const event = new Event('beforeunload', {
      cancelable: true,
    }) as BeforeUnloadEvent;
    window.dispatchEvent(event);
    return event;
  }

  function clickOutsideNavLink() {
    const nav = document.createElement('a');
    nav.href = '/dashboard';
    document.body.appendChild(nav);
    fireEvent.click(nav);
    document.body.removeChild(nav);
  }

  it('does not warn on beforeunload before any field has been edited', () => {
    renderPage('/baseball/league/create');
    const event = dispatchBeforeUnload();
    expect(event.defaultPrevented).toBe(false);
  });

  it('warns on beforeunload once a field has been edited', () => {
    renderPage('/baseball/league/create');
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });
    const event = dispatchBeforeUnload();
    expect(event.defaultPrevented).toBe(true);
  });

  it('prompts before an outside nav-link click when there are unsaved changes', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage('/baseball/league/create');
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });

    clickOutsideNavLink();

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('unsaved league settings'),
    );
    confirmSpy.mockRestore();
  });

  it('does not prompt for outside nav-link clicks when there are no unsaved changes', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage('/baseball/league/create');

    clickOutsideNavLink();

    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('does not prompt for clicks inside the create-league page itself', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage('/baseball/league/create');
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Expand all/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('clears the unsaved-changes guard after a successful submit', async () => {
    mockCreateLeague.mockResolvedValue({
      data: { createLeagueAndTeams: { league: { id: 42 } } },
    });
    renderPage('/baseball/league/create');
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true);

    const submitBtn = screen.getByTestId('create-league-submit');
    fireEvent.submit(submitBtn.closest('form') as HTMLFormElement);
    await waitFor(() => expect(mockCreateLeague).toHaveBeenCalledTimes(1));

    await waitFor(() =>
      expect(dispatchBeforeUnload().defaultPrevented).toBe(false),
    );
  });
});

describe('LeagueCreatePage — Divisional vs 1 division (LS-6105)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
  });

  it('disables Divisional once an odd team count forces 1 division', () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    expect(screen.getByRole('button', { name: /^Divisional$/i })).toBeEnabled();

    // 9 teams only allows odd division counts — division count auto-resets to 1.
    fireEvent.click(screen.getByRole('button', { name: '9' }));

    expect(
      screen.getByRole('button', { name: /^Divisional$/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(/would be identical to Round Robin/i),
    ).toBeInTheDocument();
  });

  it('re-enables Divisional after switching back to an even team count', () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    fireEvent.click(screen.getByRole('button', { name: '9' }));
    expect(
      screen.getByRole('button', { name: /^Divisional$/i }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '12' }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));

    expect(screen.getByRole('button', { name: /^Divisional$/i })).toBeEnabled();
  });

  it('falls back to round-robin in the mutation when 1 division forced Divisional off', async () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    fireEvent.click(screen.getByRole('button', { name: '9' }));
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });
    const submitBtn = screen.getByTestId('create-league-submit');
    fireEvent.submit(submitBtn.closest('form') as HTMLFormElement);
    await waitFor(() => expect(mockCreateLeague).toHaveBeenCalledTimes(1));
    expect(mockCreateLeague).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          input: expect.objectContaining({
            numberOfDivisions: 1,
            schedulingStrategy: 'round-robin',
          }),
        }),
      }),
    );
  });
});
