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
 *   6. validateFormFull rejects a playerPool value that isn't valid for the
 *      current sport (LS-6103), and the mismatch blocks submission.
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
import {
  MemoryRouter,
  Route,
  Routes,
  useNavigationType,
} from 'react-router-dom';
import type { CreateLeagueFormData } from './LeagueCreatePage';
import {
  applyImportedSettings,
  isPoolTooSmall,
  validateFormFull,
  VALIDATION_ERROR_SECTION,
} from './LeagueCreatePage';
import type { LeagueSettingsExportEnvelope } from '../../utils/leagueSettingsExport';
import { parseLeagueSettingsExport } from '../../utils/leagueSettingsExport';
import { trackPremiumFeatureClick } from '../../utils/analytics';
import { MAX_LEAGUE_NAME_LENGTH } from '../../constants/league';

// jsdom does not implement scrollIntoView; the submit error banner auto-scroll
// (LS-6066) calls it on every submitError transition, so stub it globally
// rather than per-describe-block.
Element.prototype.scrollIntoView = jest.fn();

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockLoggerError = jest.fn();
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    warn: jest.fn(),
    // Wrapped in an arrow function (rather than passing mockLoggerError
    // directly) so this eagerly-evaluated factory doesn't read the const's
    // value before its declaration runs — jest hoists jest.mock() above
    // other top-level statements, and this file's own eager (non-lazy)
    // import of ./LeagueCreatePage triggers the factory immediately.
    error: (...args: unknown[]) => mockLoggerError(...args),
    info: jest.fn(),
  },
}));

// Default football_enabled = true so both sport tabs are enabled in tests.
// useFeatureValue (what LeagueCreatePage actually reads, LS-9130) mirrors the
// real hook's contract of falling back to the caller-supplied default when a
// flag isn't configured, except for football_enabled itself — driven by
// mockFootballEnabled so LS-9128's disabled-tab tests can toggle it.
let mockFootballEnabled = true;
jest.mock('../../context/GrowthBookProvider', () => ({
  useFeatureIsOn: jest.fn((flag: string) =>
    flag === 'football_enabled' ? mockFootballEnabled : true,
  ),
  useFeatureValue: jest.fn((key: string, defaultValue: unknown) =>
    key === 'football_enabled' ? mockFootballEnabled : defaultValue,
  ),
  GrowthBookProvider: ({ children }: any) => <>{children}</>,
  growthbook: {},
}));

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));
jest.mock('../../components/PremiumGate', () => ({
  PremiumGate: ({ children }: any) => <>{children}</>,
}));
jest.mock('../../components/UpgradeModal', () => ({
  UpgradeModal: ({
    open,
    onOpenChange,
    featureName,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    featureName: string;
  }) =>
    open ? (
      <div role="dialog" aria-label={featureName} data-testid="upgrade-modal">
        {featureName}
        <button type="button" onClick={() => onOpenChange(false)}>
          Close
        </button>
      </div>
    ) : null,
}));

// Real SalaryCapField/WaiverSystemField hard-disable their upgrade toggle for
// non-premium users (LS-6114), which makes the upgrade CTA unreachable via a
// simulated click in jsdom. Stub both to a bare button wired directly to
// onUpgrade so LS-6096's featureName-wiring bug (in LeagueCreatePage itself)
// can be exercised in isolation from that gating behavior.
//
// `mockWaiverFaabSelectable` opts a test into a FAAB-selectable variant
// instead, wired to `onChange('faab')` — needed to reproduce a
// waiverType='faab' + non-premium submit combination (LS-6091), which can
// only occur via a selection made while premium (before status later
// resolves to non-premium); defaults to false so existing tests are
// unaffected.
let mockWaiverFaabSelectable = false;
jest.mock('@legacy-sports/shared-components/leagues', () => {
  const actual = jest.requireActual('@legacy-sports/shared-components/leagues');
  return {
    ...actual,
    SalaryCapField: ({ onUpgrade }: any) => (
      <button type="button" onClick={onUpgrade}>
        Upgrade Salary Cap
      </button>
    ),
    WaiverSystemField: ({ onChange, onUpgrade }: any) =>
      mockWaiverFaabSelectable ? (
        <button type="button" onClick={() => onChange('faab')}>
          Select FAAB
        </button>
      ) : (
        <button type="button" onClick={onUpgrade}>
          Upgrade Waiver Settings
        </button>
      ),
  };
});

jest.mock('@legacy-sports/shared-components', () => ({
  Dialog: ({
    open,
    title,
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
    children,
  }: any) =>
    open ? (
      <div role="alertdialog" aria-label={title}>
        <span>{description}</span>
        {children}
        <button type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    ) : null,
  StatusBadge: ({ label }: { label: string }) => (
    <span data-testid="status-badge">{label}</span>
  ),
  Skeleton: ({ width, height }: { width?: number; height?: number }) => (
    <span
      data-testid="skeleton-block"
      data-width={width}
      data-height={height}
    />
  ),
}));

let mockIsPremium = false;
let mockIsPremiumLoading = false;
jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremiumStatus: () => ({
    isPremium: mockIsPremium,
    isLoading: mockIsPremiumLoading,
  }),
}));

jest.mock('../../utils/analytics', () => ({
  trackPremiumFeatureClick: jest.fn(),
}));

// Records navigate() calls for assertions (e.g. push-vs-replace options)
// while still forwarding to the real MemoryRouter navigate — a full stub
// silently no-ops navigation, which breaks every test that depends on a
// route change actually re-rendering the tree (LS-8368).
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
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
  // Real Button.tsx defaults `type` to 'button' (lib/shared-components/src/Button.tsx)
  // so clicks never implicitly submit an enclosing <form>. Mirror that default
  // here — without it, fireEvent.click on any button inside <form onSubmit={...}>
  // also fires a native form submit, which was silently corrupting
  // navigation-after-click assertions (LS-8368).
  Button: ({ children, onPress, disabled, type, ...rest }: any) => (
    <button
      type={type ?? 'button'}
      data-testid={rest['data-testid']}
      aria-selected={rest['aria-selected']}
      aria-disabled={rest['aria-disabled']}
      aria-label={rest['aria-label']}
      role={rest.role}
      onClick={onPress}
      disabled={disabled}
    >
      {children}
    </button>
  ),
  DateTimePicker: ({ value, onChange }: any) => (
    <input
      data-testid="datetime-picker"
      value={value ? value.toISOString() : ''}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
        onChange?.(new Date(e.target.value))
      }
    />
  ),
}));

jest.mock('@tamagui/lucide-icons', () => ({
  AlertCircle: () => <span data-testid="icon-alert" />,
  Check: () => <span data-testid="icon-check" />,
  ChevronRight: () => <span data-testid="icon-chevron" />,
  Copy: () => <span data-testid="icon-copy" />,
  Lock: () => <span data-testid="icon-lock" />,
  // Used by StepRosterSettings' slot +/- steppers (LS-6147).
  Minus: () => <span data-testid="icon-minus" />,
  Plus: () => <span data-testid="icon-plus" />,
  // Used by the "What happens next" sidebar card header (LS-9129).
  Zap: () => <span data-testid="icon-zap" />,
}));

jest.mock('tamagui', () => {
  const ReactLocal = require('react');
  const passthrough = ReactLocal.forwardRef(
    ({ children, ...rest }: any, ref: any) =>
      ReactLocal.createElement(
        'div',
        {
          ref,
          'data-testid': rest['data-testid'] ?? rest.testID,
          role: rest.role ?? rest.accessibilityRole,
          'aria-label': rest['aria-label'] ?? rest.accessibilityLabel,
          'aria-live': rest['aria-live'],
          'aria-expanded': rest['aria-expanded'],
          'aria-disabled': rest['aria-disabled'],
          'aria-controls': rest['aria-controls'],
          tabIndex: rest.tabIndex,
          onKeyDown: rest.onKeyDown,
          onClick: rest.onPress,
        },
        children,
      ),
  );
  return {
    createTokens: (tokens: unknown) => tokens,
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
  usePreviewEligiblePlayerCountQuery: jest.fn(() => ({
    data: undefined,
    loading: false,
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Exposes the router's current navigation action (PUSH/REPLACE/POP) via a
 * hidden testid, so tests can assert push-vs-replace behavior (LS-6110)
 * without mocking `useNavigate` — a blanket mock there would no-op real
 * navigation for every other test in this file that relies on the
 * MemoryRouter actually changing routes.
 */
function NavigationTypeProbe() {
  const navigationType = useNavigationType();
  return <span data-testid="nav-type">{navigationType}</span>;
}

function renderPage(initialPath = '/baseball/league/create') {
  const Page = require('./LeagueCreatePage')
    .LeagueCreatePage as React.ComponentType;
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <NavigationTypeProbe />
      <Routes>
        <Route path="/baseball/league/create" element={<Page />} />
        <Route path="/football/league/create" element={<Page />} />
        <Route path="/baseball" element={<div>Baseball Home</div>} />
        <Route path="/football" element={<div>Football Home</div>} />
        <Route
          path="/baseball/league/:id"
          element={<div>Baseball League Detail</div>}
        />
        <Route
          path="/football/league/:id"
          element={<div>Football League Detail</div>}
        />
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
    mockIsPremiumLoading = false;
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

  // LS-6130: the free-tier cap is global across sports (leagues of any sport
  // count toward the same limit), but the banner previously only said "up to
  // 3 leagues" with no indication it wasn't football-specific. A user with 3
  // baseball leagues who opens /football/league/create must see this same
  // clarified banner, not just be silently blocked at submit.
  it('shows the limit banner on the football create page when the cap was reached via other sports (LS-6130)', () => {
    mockLeagueCount = 3;
    renderPage('/football/league/create');
    const banner = screen.getByTestId('league-limit-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/across every sport/i);
  });

  it('banner copy clarifies the cap is shared across sports, not per-sport (LS-6130)', () => {
    mockLeagueCount = 3;
    renderPage('/baseball/league/create');
    const banner = screen.getByTestId('league-limit-banner');
    expect(banner).toHaveTextContent(
      /baseball and football leagues both count toward the same limit/i,
    );
  });
});

describe('LeagueCreatePage — Salary Cap upgrade modal title (LS-6096)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
  });

  it('opens the modal titled "Salary Cap" (not FAAB) from the Salary Cap trigger', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade Salary Cap' }));
    const modal = screen.getByTestId('upgrade-modal');
    expect(modal).toHaveTextContent('Salary Cap');
    expect(modal).not.toHaveTextContent('FAAB Waiver Settings');
  });

  it('still opens the modal titled "FAAB Waiver Settings" from the FAAB trigger', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    fireEvent.click(
      screen.getByRole('button', { name: 'Upgrade Waiver Settings' }),
    );
    expect(screen.getByTestId('upgrade-modal')).toHaveTextContent(
      'FAAB Waiver Settings',
    );
  });
});

describe('LeagueCreatePage — Auction draft premium gate (LS-6072)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
  });

  it('locks the Auction option and opens the upgrade modal instead of selecting it for a free user', () => {
    mockIsPremium = false;
    renderPage('/baseball/league/create');
    expandAllSections();

    const auctionButton = screen.getByRole('button', { name: 'Auction' });
    fireEvent.click(auctionButton);

    expect(screen.getByTestId('upgrade-modal')).toHaveTextContent(
      'Auction Draft',
    );
    // Selecting Auction must not have applied — the Auction-only budget
    // fields must not have been mounted.
    expect(
      screen.queryByText('Auction Budget per Team'),
    ).not.toBeInTheDocument();
  });

  it('selects Auction directly for a premium user (no upgrade modal)', () => {
    mockIsPremium = true;
    renderPage('/baseball/league/create');
    expandAllSections();

    fireEvent.click(screen.getByRole('button', { name: 'Auction' }));

    expect(screen.queryByTestId('upgrade-modal')).not.toBeInTheDocument();
    expect(screen.getByText('Auction Budget per Team')).toBeInTheDocument();
  });
});

describe('LeagueCreatePage — sport-aware (LS-4631)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
    mockIsPremiumLoading = false;
  });

  it('pushes (not replaces) history when switching sport, so Back returns to the prior sport create page (LS-6110)', () => {
    renderPage('/baseball/league/create');
    fireEvent.click(screen.getByTestId('sport-tab-football'));
    expect(
      screen.getByRole('heading', { name: /Create Football League/i }),
    ).toBeInTheDocument();
    // 'PUSH' (not 'REPLACE') confirms the sport switch added a new history
    // entry rather than overwriting the current one.
    expect(screen.getByTestId('nav-type')).toHaveTextContent('PUSH');
  });

  it('renders both sport tabs at the baseball URL', () => {
    renderPage('/baseball/league/create');
    expect(screen.getByTestId('sport-tab-baseball')).toBeInTheDocument();
    expect(screen.getByTestId('sport-tab-football')).toBeInTheDocument();
  });

  it('keeps the Football tab enabled when football_enabled is unresolved, not just when explicitly true (LS-9130)', () => {
    // Regression guard for the flag-default mismatch: LeagueCreatePage reads
    // `useFeatureValue('football_enabled', true)`, defaulting to enabled
    // while GrowthBook is still loading/unconfigured — mirroring the
    // `FootballGate` route guard's default. The old `useFeatureIsOn` call
    // had no default and resolved to `false` (locked) in that same window.
    const growthBookModule = jest.requireMock(
      '../../context/GrowthBookProvider',
    );
    growthBookModule.useFeatureValue.mockImplementationOnce(
      (_key: string, defaultValue: unknown) => defaultValue,
    );
    renderPage('/baseball/league/create');
    expect(screen.getByTestId('sport-tab-football')).toHaveAttribute(
      'aria-disabled',
      'false',
    );
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

  it('shows the per-slot roster config (not the Max Roster Size button group) at the football URL', () => {
    renderPage('/football/league/create');
    expandAllSections();

    expect(screen.getByTestId('roster-positions-config')).toBeInTheDocument();
    expect(
      screen.queryByTestId('max-roster-size-group'),
    ).not.toBeInTheDocument();
  });

  it('shows the Max Roster Size button group (not the per-slot roster config) at the baseball URL', () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    expect(screen.getByTestId('max-roster-size-group')).toBeInTheDocument();
    expect(
      screen.queryByTestId('roster-positions-config'),
    ).not.toBeInTheDocument();
  });
});

describe('LeagueCreatePage — per-slot roster config (LS-6147)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
    mockIsPremiumLoading = false;
  });

  it('defaults to the D/ST slot set and derives the roster total from the slot sum', () => {
    renderPage('/football/league/create');
    expandAllSections();

    // D/ST defaults: QB1 RB2 WR2 TE1 FLEX1 K1 DST1 BN6 = 15.
    expect(screen.getByTestId('roster-positions-config')).toHaveTextContent(
      'DST',
    );
    expect(
      screen.getByText(/15 \(9 starters \+ 6 bench\)/),
    ).toBeInTheDocument();
  });

  it('increments a slot and updates the derived roster total live', () => {
    renderPage('/football/league/create');
    expandAllSections();

    // slotOrder for D/ST: QB, RB, WR, TE, FLEX, K, DST, BN — WR is index 2.
    const plusIcons = screen.getAllByTestId('icon-plus');
    fireEvent.click(plusIcons[2].parentElement as HTMLElement);

    expect(
      screen.getByText(/16 \(10 starters \+ 6 bench\)/),
    ).toBeInTheDocument();
  });

  it('switches to IDP slots (and resets counts to IDP defaults) when Defensive Format changes', () => {
    renderPage('/football/league/create');
    expandAllSections();

    const config = screen.getByTestId('roster-positions-config');
    expect(config).toHaveTextContent('DST');
    expect(config).not.toHaveTextContent('DL');

    fireEvent.click(screen.getByTestId('defensive-format-idp'));

    // IDP defaults (LS-6148 removed the DP slot): QB1 RB2 WR2 TE1 FLEX1 K1
    // DL2 LB2 DB2 BN6 = 20.
    expect(config).not.toHaveTextContent('DST');
    expect(config).toHaveTextContent('DL');
    expect(
      screen.getByText(/20 \(14 starters \+ 6 bench\)/),
    ).toBeInTheDocument();
  });

  it('does not render the per-slot config for baseball', () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    expect(
      screen.queryByTestId('roster-positions-config'),
    ).not.toBeInTheDocument();
  });

  it('sends rosterSlots (excluding bench) alongside maxRosterSize on submit (LS-6145)', async () => {
    renderPage('/football/league/create');
    expandAllSections();
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test Football League' },
    });
    const submitBtn = screen.getByTestId('create-league-submit');
    fireEvent.submit(submitBtn.closest('form') as HTMLFormElement);
    await waitFor(() => expect(mockCreateLeague).toHaveBeenCalledTimes(1));

    const input = mockCreateLeague.mock.calls[0][0].variables.input;
    // D/ST defaults: QB1 RB2 WR2 TE1 FLEX1 K1 DST1 (BN excluded).
    expect(input.rosterSlots).toEqual(
      expect.arrayContaining([
        { positionType: 'QB', count: 1 },
        { positionType: 'RB', count: 2 },
        { positionType: 'WR', count: 2 },
        { positionType: 'TE', count: 1 },
        { positionType: 'FLEX', count: 1 },
        { positionType: 'K', count: 1 },
        { positionType: 'DST', count: 1 },
      ]),
    );
    expect(input.rosterSlots).toHaveLength(7);
    expect(
      input.rosterSlots.some(
        (slot: { positionType: string }) => slot.positionType === 'BN',
      ),
    ).toBe(false);
  });

  it('omits rosterSlots for baseball', async () => {
    renderPage('/baseball/league/create');
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test Baseball League' },
    });
    const submitBtn = screen.getByTestId('create-league-submit');
    fireEvent.submit(submitBtn.closest('form') as HTMLFormElement);
    await waitFor(() => expect(mockCreateLeague).toHaveBeenCalledTimes(1));

    const input = mockCreateLeague.mock.calls[0][0].variables.input;
    expect(input.rosterSlots).toBeUndefined();
  });
});

describe('LeagueCreatePage — selection reset notice (LS-4088)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    // Premium: these tests exercise the draftMode-reset notice mechanic, not
    // the Auction premium gate (LS-6072) — a free user can no longer select
    // Auction at all, so reaching the "reset from Auction" state requires a
    // premium viewer.
    mockIsPremium = true;
    mockIsPremiumLoading = false;
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

  it('calls out the hidden auction settings when switching from Auction to Automated draft (LS-6073)', () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    fireEvent.click(screen.getByRole('button', { name: /^Auction$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Automated Draft$/i }));

    expect(screen.getByTestId('selection-reset-notice')).toHaveTextContent(
      'Selection method reset to Random; auction settings hidden.',
    );
  });

  it('uses the generic reset copy when switching from Standard to Automated draft (LS-6073)', () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    fireEvent.click(screen.getByRole('button', { name: /^Standard$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Automated Draft$/i }));

    expect(screen.getByTestId('selection-reset-notice')).toHaveTextContent(
      'Switching to automated draft reset your selection method to Random.',
    );
  });
});

describe('LeagueCreatePage — division reset notice (LS-6058)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
  });

  it('shows the reset notice when team count flips odd and divisions were even', () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    fireEvent.click(screen.getByRole('button', { name: '9' }));

    expect(screen.getByTestId('division-reset-notice')).toHaveTextContent(
      'Divisions reset to 1 to match team parity.',
    );
  });

  it('dismisses the reset notice when the Dismiss button is clicked', () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    fireEvent.click(screen.getByRole('button', { name: '9' }));
    const notice = screen.getByTestId('division-reset-notice');
    fireEvent.click(within(notice).getByRole('button', { name: /^Dismiss$/i }));

    expect(
      screen.queryByTestId('division-reset-notice'),
    ).not.toBeInTheDocument();
  });

  it('clears the reset notice when the user manually picks a new division count', () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    fireEvent.click(screen.getByRole('button', { name: '9' }));
    expect(screen.getByTestId('division-reset-notice')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '3' }));

    expect(
      screen.queryByTestId('division-reset-notice'),
    ).not.toBeInTheDocument();
  });
});

describe('LeagueCreatePage — Cancel discard confirmation (LS-6108)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
    mockIsPremiumLoading = false;
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

describe('LeagueCreatePage — validate before premium gate on submit (LS-6091 / CLB-041)', () => {
  // `revealValidationErrors` (LS-6090) is the only call site in this component
  // that invokes `scrollIntoView`, and it only runs from the `errorCount > 0`
  // branch of handleSubmit — so observing it fire (and the FAAB gate/mutation
  // NOT firing) is an unambiguous signal that validation ran before the
  // premium gate, without depending on which section a given field maps to
  // (jsdom doesn't implement scrollIntoView, and rAF doesn't auto-flush, so
  // both are stubbed to run synchronously for the assertion).
  let scrollIntoViewMock: jest.Mock;
  let rafSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockWaiverFaabSelectable = false;
    scrollIntoViewMock = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    rafSpy = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });
  });

  afterEach(() => {
    rafSpy.mockRestore();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('runs validation instead of the FAAB upgrade gate when both a validation error and a FAAB selection are present', () => {
    // Select FAAB while premium so the selection is allowed, then simulate the
    // viewer's premium status resolving to false before submit — this is the
    // path that produced a stored waiverType of 'faab' on a non-premium submit.
    mockIsPremium = true;
    mockWaiverFaabSelectable = true;
    renderPage('/baseball/league/create');
    expandAllSections();
    fireEvent.click(screen.getByRole('button', { name: 'Select FAAB' }));

    mockIsPremium = false;
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'AB' },
    });

    const submitBtn = screen.getByTestId('create-league-submit');
    fireEvent.submit(submitBtn.closest('form') as HTMLFormElement);

    // revealValidationErrors ran (the errorCount branch), not the FAAB gate.
    expect(scrollIntoViewMock).toHaveBeenCalled();
    expect(trackPremiumFeatureClick).not.toHaveBeenCalledWith(
      'FAAB Waiver Settings',
    );
    expect(mockCreateLeague).not.toHaveBeenCalled();
  });
});

describe('LeagueCreatePage — Selection Method options in automated mode (LS-6078)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
  });

  // "Selection Method" FieldRow — scoped separately because "Random" also
  // appears as a Scheduling Strategy option elsewhere on the page.
  function selectionMethodRow() {
    return screen.getByText('Selection Method').closest('div')
      ?.parentElement as HTMLElement;
  }

  it('shows Standard and Auction options when draft mode is live (default)', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    const row = within(selectionMethodRow());
    expect(
      row.getByRole('button', { name: /^Standard$/i }),
    ).toBeInTheDocument();
    expect(row.getByRole('button', { name: /^Auction$/i })).toBeInTheDocument();
  });

  it('hides Standard and Auction options when switching to automated draft mode', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    fireEvent.click(screen.getByRole('button', { name: /^Automated Draft$/i }));

    const row = within(selectionMethodRow());
    expect(
      row.queryByRole('button', { name: /^Standard$/i }),
    ).not.toBeInTheDocument();
    expect(
      row.queryByRole('button', { name: /^Auction$/i }),
    ).not.toBeInTheDocument();
    expect(row.getByRole('button', { name: /^Random$/i })).toBeInTheDocument();
  });

  it('restores Standard and Auction options when switching back to live draft mode', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    fireEvent.click(screen.getByRole('button', { name: /^Automated Draft$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Live Draft$/i }));

    const row = within(selectionMethodRow());
    expect(
      row.getByRole('button', { name: /^Standard$/i }),
    ).toBeInTheDocument();
    expect(row.getByRole('button', { name: /^Auction$/i })).toBeInTheDocument();
  });
});

describe('LeagueCreatePage — unsaved-changes navigation guard (LS-6109)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
    mockIsPremiumLoading = false;
  });

  function dispatchBeforeUnload() {
    const event = new Event('beforeunload', {
      cancelable: true,
    });
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

  // LS-6064 — a mutation that resolves without a GraphQL error but with a
  // null/missing league.id (server bug, partial failure) must not silently
  // no-op: it should surface a submit error and skip navigation.
  it('shows a submit error and does not navigate when the mutation resolves with no league id', async () => {
    mockCreateLeague.mockResolvedValue({
      data: { createLeagueAndTeams: { league: null } },
    });
    renderPage('/baseball/league/create');
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });

    const submitBtn = screen.getByTestId('create-league-submit');
    fireEvent.submit(submitBtn.closest('form') as HTMLFormElement);
    await waitFor(() => expect(mockCreateLeague).toHaveBeenCalledTimes(1));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to save league. Your settings are still filled in — try again or come back later.',
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('LeagueCreatePage — in-flight submit guard + idempotency key (LS-6063)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
  });

  it('fires the mutation only once when submit is triggered twice before the first attempt resolves', async () => {
    let resolveMutation: (value: unknown) => void = () => {
      throw new Error('resolveMutation called before mutation in-flight');
    };
    mockCreateLeague.mockReturnValue(
      new Promise((resolve) => {
        resolveMutation = resolve;
      }),
    );
    renderPage('/baseball/league/create');
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });

    const form = screen.getByTestId('create-league-submit').closest('form');
    // Second submit fires while the first mutation is still in flight — the
    // synchronous ref guard (not the async `loading` flag) must block it.
    fireEvent.submit(form as HTMLFormElement);
    fireEvent.submit(form as HTMLFormElement);

    expect(mockCreateLeague).toHaveBeenCalledTimes(1);

    resolveMutation({
      data: { createLeagueAndTeams: { league: { id: 42 } } },
    });
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'Test League is ready.',
    );
  });

  it('allows a new submission after the previous attempt resolves', async () => {
    mockCreateLeague.mockResolvedValue({
      data: { createLeagueAndTeams: { league: null } },
    });
    renderPage('/baseball/league/create');
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });

    const form = screen
      .getByTestId('create-league-submit')
      .closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => expect(mockCreateLeague).toHaveBeenCalledTimes(1));

    fireEvent.submit(form);
    await waitFor(() => expect(mockCreateLeague).toHaveBeenCalledTimes(2));
  });

  it('sends a stable idempotencyKey with the mutation and reuses it across resubmissions', async () => {
    mockCreateLeague.mockResolvedValue({
      data: { createLeagueAndTeams: { league: null } },
    });
    renderPage('/baseball/league/create');
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });

    const form = screen
      .getByTestId('create-league-submit')
      .closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => expect(mockCreateLeague).toHaveBeenCalledTimes(1));

    const firstKey =
      mockCreateLeague.mock.calls[0][0].variables.input.idempotencyKey;
    expect(typeof firstKey).toBe('string');
    expect(firstKey.length).toBeGreaterThan(0);

    fireEvent.submit(form);
    await waitFor(() => expect(mockCreateLeague).toHaveBeenCalledTimes(2));

    const secondKey =
      mockCreateLeague.mock.calls[1][0].variables.input.idempotencyKey;
    expect(secondKey).toBe(firstKey);
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

  it('auto-snaps a stale odd division count when returning to an even team count (LS-6060)', () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    // 9 teams only allows odd division counts — pick a valid non-1 odd value.
    fireEvent.click(screen.getByRole('button', { name: '9' }));
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(screen.getByRole('button', { name: /^Divisional$/i })).toBeEnabled();

    // Switching back to an even team count without touching divisions
    // manually must not strand the odd division count — it should
    // auto-snap to a valid even option (Divisional stays enabled).
    fireEvent.click(screen.getByRole('button', { name: '12' }));

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

describe('LeagueCreatePage — odd team count bye-week hint (LS-6061)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
  });

  it('shows a bye-week warning when the team count is odd and 1 division is forced', () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    fireEvent.click(screen.getByRole('button', { name: '9' }));

    expect(
      screen.getByText(/one team will have a bye each week all season/i),
    ).toBeInTheDocument();
  });

  it('shows a bye-week warning when the team count is odd and divisional (odd division count) is selected', () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    fireEvent.click(screen.getByRole('button', { name: '9' }));
    fireEvent.click(screen.getByRole('button', { name: '3' }));

    expect(
      screen.getByText(/one team will have a bye each week all season/i),
    ).toBeInTheDocument();
  });

  it('does not show the bye-week warning for an even team count', () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    fireEvent.click(screen.getByRole('button', { name: '12' }));

    expect(
      screen.queryByText(/one team will have a bye each week all season/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /Even numbers produce cleanest divisions\. 12 is standard\./i,
      ),
    ).toBeInTheDocument();
  });
});

describe('LeagueCreatePage — draft date sidebar fallback (LS-6077)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
  });

  it('shows friendly fallback text in the "What happens next" sidebar when no draft date is set', () => {
    renderPage('/baseball/league/create');
    expect(
      screen.getByText('Draft opens whenever you schedule it.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/i)).not.toBeInTheDocument();
  });
});

describe('isPoolTooSmall (LS-6089)', () => {
  it('warns when the eligible pool is smaller than teams x roster size', () => {
    expect(isPoolTooSmall(100, 12, 26)).toBe(true);
  });

  it('does not warn when the eligible pool exactly meets the requirement', () => {
    expect(isPoolTooSmall(312, 12, 26)).toBe(false);
  });

  it('does not warn when the eligible pool exceeds the requirement', () => {
    expect(isPoolTooSmall(2000, 12, 26)).toBe(false);
  });

  it('warns for a narrow wartime-era pool (1942-1944 scenario)', () => {
    expect(isPoolTooSmall(150, 12, 26)).toBe(true);
  });
});

describe('validateFormFull — gamesPerMatchup (LS-6102)', () => {
  const baseFormData: CreateLeagueFormData = {
    sport: 'baseball',
    leagueName: 'Test League',
    numberOfTeams: 8,
    numberOfDivisions: 2,
    schedulingStrategy: 'divisional',
    playerPool: 'all',
    draftMode: 'live',
    selectionMethod: 'standard',
    draftOrder: 'snake',
    maxRosterSize: 26,
    waiverType: 'standard',
    faabBudgetDefault: 100,
    isPublic: false,
    gamesPerMatchup: 5,
    baseballEraFilter: 'all',
    baseballHofOnly: false,
    salaryCapEnabled: false,
    auctionBudget: 200,
    auctionMinBid: 1,
    pickTimeLimitSeconds: 120,
    scoringFormat: 'ppr',
    defensiveFormat: 'dst',
  };

  it('accepts a valid gamesPerMatchup value', () => {
    const errs = validateFormFull({ ...baseFormData, gamesPerMatchup: 5 });
    expect(errs.gamesPerMatchup).toBeUndefined();
  });

  it('rejects a negative gamesPerMatchup value', () => {
    const errs = validateFormFull({ ...baseFormData, gamesPerMatchup: -5 });
    expect(errs.gamesPerMatchup).toBeDefined();
  });

  it('rejects a zero gamesPerMatchup value', () => {
    const errs = validateFormFull({ ...baseFormData, gamesPerMatchup: 0 });
    expect(errs.gamesPerMatchup).toBeDefined();
  });

  it('rejects a NaN gamesPerMatchup value instead of silently passing', () => {
    const errs = validateFormFull({ ...baseFormData, gamesPerMatchup: NaN });
    expect(errs.gamesPerMatchup).toBeDefined();
  });
});

describe('validateFormFull — league name length (LS-6055)', () => {
  const baseFormData: CreateLeagueFormData = {
    sport: 'baseball',
    leagueName: 'Test League',
    numberOfTeams: 8,
    numberOfDivisions: 2,
    schedulingStrategy: 'divisional',
    playerPool: 'all',
    draftMode: 'live',
    selectionMethod: 'standard',
    draftOrder: 'snake',
    maxRosterSize: 26,
    waiverType: 'standard',
    faabBudgetDefault: 100,
    isPublic: false,
    gamesPerMatchup: 5,
    baseballEraFilter: 'all',
    baseballHofOnly: false,
    salaryCapEnabled: false,
    auctionBudget: 200,
    auctionMinBid: 1,
    pickTimeLimitSeconds: 120,
    scoringFormat: 'ppr',
    defensiveFormat: 'dst',
  };

  // The rendered Input hard-caps at maxLength={MAX_LEAGUE_NAME_LENGTH}, so a
  // name longer than the limit can no longer be produced through the UI —
  // covering the "too long" branch here, against the pure validator, rather
  // than through an E2E fill() that the native maxlength attribute now
  // truncates before submission ever sees an over-limit value.
  it('rejects a league name over the max length', () => {
    const errs = validateFormFull({
      ...baseFormData,
      leagueName: 'A'.repeat(MAX_LEAGUE_NAME_LENGTH + 1),
    });
    expect(errs.leagueName).toBe(
      `League name must be less than ${MAX_LEAGUE_NAME_LENGTH} characters`,
    );
  });

  it('accepts a league name exactly at the max length', () => {
    const errs = validateFormFull({
      ...baseFormData,
      leagueName: 'A'.repeat(MAX_LEAGUE_NAME_LENGTH),
    });
    expect(errs.leagueName).toBeUndefined();
  });
});

describe('validateFormFull — auction budget/min bid (LS-6092, upper bound LS-6074/CLB-027)', () => {
  const baseFormData: CreateLeagueFormData = {
    sport: 'baseball',
    leagueName: 'Test League',
    numberOfTeams: 8,
    numberOfDivisions: 2,
    schedulingStrategy: 'divisional',
    playerPool: 'all',
    draftMode: 'live',
    selectionMethod: 'auction',
    draftOrder: 'snake',
    maxRosterSize: 26,
    waiverType: 'standard',
    faabBudgetDefault: 100,
    isPublic: false,
    gamesPerMatchup: 5,
    baseballEraFilter: 'all',
    baseballHofOnly: false,
    salaryCapEnabled: false,
    auctionBudget: 200,
    auctionMinBid: 1,
    pickTimeLimitSeconds: 120,
    scoringFormat: 'ppr',
    defensiveFormat: 'dst',
  };

  it('accepts a valid, correctly-ordered auction budget/min bid', () => {
    const errs = validateFormFull(baseFormData);
    expect(errs.auctionBudget).toBeUndefined();
    expect(errs.auctionMinBid).toBeUndefined();
  });

  it('rejects an auctionBudget below 1 when selectionMethod is auction', () => {
    const errs = validateFormFull({ ...baseFormData, auctionBudget: 0 });
    expect(errs.auctionBudget).toBeDefined();
  });

  it('rejects a negative auctionBudget when selectionMethod is auction', () => {
    const errs = validateFormFull({ ...baseFormData, auctionBudget: -50 });
    expect(errs.auctionBudget).toBeDefined();
  });

  it('rejects an auctionBudget value exceeding the sane upper bound', () => {
    const errs = validateFormFull({
      ...baseFormData,
      auctionBudget: 99999999999,
    });
    expect(errs.auctionBudget).toBeDefined();
  });

  it('rejects an auctionMinBid below 1 when selectionMethod is auction', () => {
    const errs = validateFormFull({ ...baseFormData, auctionMinBid: 0 });
    expect(errs.auctionMinBid).toBeDefined();
  });

  it('rejects an auctionMinBid value exceeding the sane upper bound', () => {
    const errs = validateFormFull({
      ...baseFormData,
      auctionMinBid: 99999999999,
    });
    expect(errs.auctionMinBid).toBeDefined();
  });

  it('rejects auctionMinBid greater than auctionBudget even when both individually pass range checks', () => {
    const errs = validateFormFull({
      ...baseFormData,
      auctionBudget: 50,
      auctionMinBid: 100,
    });
    expect(errs.auctionMinBid).toBeDefined();
  });

  it('does not validate auction fields when selectionMethod is not auction', () => {
    const errs = validateFormFull({
      ...baseFormData,
      selectionMethod: 'standard',
      auctionBudget: 99999999999,
      auctionMinBid: 99999999999,
    });
    expect(errs.auctionBudget).toBeUndefined();
    expect(errs.auctionMinBid).toBeUndefined();
  });
});

describe('validateFormFull — custom era year bounds (LS-6082, LS-6093)', () => {
  const baseFormData: CreateLeagueFormData = {
    sport: 'baseball',
    leagueName: 'Test League',
    numberOfTeams: 8,
    numberOfDivisions: 2,
    schedulingStrategy: 'divisional',
    playerPool: 'all',
    draftMode: 'live',
    selectionMethod: 'standard',
    draftOrder: 'snake',
    maxRosterSize: 26,
    waiverType: 'standard',
    faabBudgetDefault: 100,
    isPublic: false,
    gamesPerMatchup: 5,
    baseballEraFilter: 'custom',
    baseballHofOnly: false,
    salaryCapEnabled: false,
    auctionBudget: 200,
    auctionMinBid: 1,
    pickTimeLimitSeconds: 120,
    scoringFormat: 'ppr',
    defensiveFormat: 'dst',
  };

  it('accepts a custom era range within MLB history (e.g. 1920-1960)', () => {
    const errs = validateFormFull({
      ...baseFormData,
      customEraStartYear: 1920,
      customEraEndYear: 1960,
    });
    expect(errs.customEra).toBeUndefined();
  });

  it('accepts the current year as the end year', () => {
    const currentYear = new Date().getFullYear();
    const errs = validateFormFull({
      ...baseFormData,
      customEraStartYear: currentYear,
      customEraEndYear: currentYear,
    });
    expect(errs.customEra).toBeUndefined();
  });

  it('rejects a non-4-digit custom era start year', () => {
    const errs = validateFormFull({
      ...baseFormData,
      customEraStartYear: 40,
      customEraEndYear: 1960,
    });
    expect(errs.customEra).toBeDefined();
  });

  it('rejects a non-4-digit custom era end year', () => {
    const errs = validateFormFull({
      ...baseFormData,
      customEraStartYear: 1940,
      customEraEndYear: 99999,
    });
    expect(errs.customEra).toBeDefined();
  });

  it('rejects a start year before MLB existed (1800) instead of silently passing', () => {
    const errs = validateFormFull({
      ...baseFormData,
      customEraStartYear: 1800,
      customEraEndYear: 1900,
    });
    expect(errs.customEra).toBeDefined();
  });

  it('rejects an end year in the far future (3000) instead of silently passing', () => {
    const errs = validateFormFull({
      ...baseFormData,
      customEraStartYear: 1950,
      customEraEndYear: 3000,
    });
    expect(errs.customEra).toBeDefined();
  });

  it('rejects a start year one before MLB’s first professional season (1870)', () => {
    const errs = validateFormFull({
      ...baseFormData,
      customEraStartYear: 1870,
      customEraEndYear: 1900,
    });
    expect(errs.customEra).toBeDefined();
  });

  it('rejects customEraStartYear/customEraEndYear set when eraFilter is not custom', () => {
    const errs = validateFormFull({
      ...baseFormData,
      baseballEraFilter: 'all',
      customEraStartYear: 1940,
      customEraEndYear: 1960,
    });
    expect(errs.customEra).toBeDefined();
  });

  it('does not flag customEra when eraFilter is not custom and years are unset', () => {
    const errs = validateFormFull({
      ...baseFormData,
      baseballEraFilter: 'all',
      customEraStartYear: undefined,
      customEraEndYear: undefined,
    });
    expect(errs.customEra).toBeUndefined();
  });

  it('rejects an end year one past the current year', () => {
    const currentYear = new Date().getFullYear();
    const errs = validateFormFull({
      ...baseFormData,
      customEraStartYear: 1950,
      customEraEndYear: currentYear + 1,
    });
    expect(errs.customEra).toBeDefined();
  });
});

describe('VALIDATION_ERROR_SECTION coverage (LS-6090)', () => {
  const baseFormData: CreateLeagueFormData = {
    sport: 'baseball',
    leagueName: 'Test League',
    numberOfTeams: 8,
    numberOfDivisions: 2,
    schedulingStrategy: 'divisional',
    playerPool: 'all',
    draftMode: 'live',
    selectionMethod: 'standard',
    draftOrder: 'snake',
    maxRosterSize: 26,
    waiverType: 'standard',
    faabBudgetDefault: 100,
    isPublic: false,
    gamesPerMatchup: 5,
    baseballEraFilter: 'all',
    baseballHofOnly: false,
    salaryCapEnabled: false,
    auctionBudget: 200,
    auctionMinBid: 1,
    pickTimeLimitSeconds: 120,
    scoringFormat: 'ppr',
    defensiveFormat: 'dst',
  };

  // Every field validateFormFull() can flag pushed invalid at once, so the
  // resulting error object exercises every key the sticky bar / auto-expand
  // logic (LS-6090) needs a section mapping for.
  const fullyInvalidFormData: CreateLeagueFormData = {
    ...baseFormData,
    leagueName: '',
    numberOfTeams: 20,
    numberOfDivisions: 25,
    maxRosterSize: 999,
    gamesPerMatchup: NaN,
    playerPool: 'nfc',
    selectionMethod: 'auction',
    auctionBudget: 0,
    auctionMinBid: 0,
    waiverType: 'faab',
    faabBudgetDefault: 0,
    baseballEraFilter: 'custom',
    customEraStartYear: undefined,
    customEraEndYear: undefined,
    draftDate: new Date('2000-01-01'),
    salaryCapEnabled: true,
    salaryCap: undefined,
    salaryFloor: -1,
    luxuryTaxThreshold: -1,
    minSalary: 0,
    salaryEscalationPct: 150,
    salaryDecayPct: 150,
    rosterContinuity: 'keeper',
    keeperCount: undefined,
    maxConsecutiveKeeps: 0,
  };

  it('produces at least one error for every key VALIDATION_ERROR_SECTION maps', () => {
    const errs = validateFormFull(fullyInvalidFormData);
    // Sanity check the fixture actually exercises every mapped key — if this
    // fails, the fixture (not the mapping) needs updating.
    expect(Object.keys(errs).sort()).toEqual(
      Object.keys(VALIDATION_ERROR_SECTION).sort(),
    );
  });

  it('maps every validateFormFull() error key to a known CollapsibleSection id', () => {
    const errs = validateFormFull(fullyInvalidFormData);
    const knownSectionIds = new Set([
      'basic',
      'roster-schedule',
      'era-history',
      'draft',
      'waiver-budget',
      'football-scoring',
    ]);
    for (const field of Object.keys(errs)) {
      expect(VALIDATION_ERROR_SECTION[field]).toBeDefined();
      expect(knownSectionIds.has(VALIDATION_ERROR_SECTION[field])).toBe(true);
    }
  });
});

describe('LeagueCreatePage — sticky bar surfaces all validation errors (LS-6090)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
  });

  it('lists the validation error message instead of a truncated "· message" summary', () => {
    renderPage('/baseball/league/create');
    // The default league name is empty, so exactly one error (leagueName) is active.
    expect(screen.getByText('1 item need attention:')).toBeInTheDocument();
    expect(
      screen.getByText('• League name must be 3–50 characters.'),
    ).toBeInTheDocument();
  });

  it('shows the all-clear message once the only invalid field is fixed', () => {
    renderPage('/baseball/league/create');
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });
    expect(screen.getByText('All settings look good.')).toBeInTheDocument();
    expect(screen.queryByText(/item.*need attention/)).not.toBeInTheDocument();
  });

  it('does not submit the mutation while a validation error is active', () => {
    renderPage('/baseball/league/create');
    const submitBtn = screen.getByTestId('create-league-submit');
    fireEvent.submit(submitBtn.closest('form') as HTMLFormElement);
    expect(mockCreateLeague).not.toHaveBeenCalled();
  });

  // E2E (baseball-ui.spec.ts, league-creation.spec.ts) locates the
  // validation surface via `getByRole('alert')` — the sticky bar must carry
  // that role whenever errors are active, not just the mutation-failure
  // banner, or those specs lose their signal (LS-6090).
  it('exposes the error summary via role="alert" while invalid', () => {
    renderPage('/baseball/league/create');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'League name must be 3–50 characters.',
    );
  });

  it('does not expose role="alert" once the form is valid', () => {
    renderPage('/baseball/league/create');
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// `getSubmitErrorMessage` moved to lib/shared-components with its unit tests
// when it was extracted for mobile reuse (LS-8814) — see
// lib/shared-components/src/features/leagues/submitError.spec.ts.

describe('LeagueCreatePage — stale draft date at submit time (LS-6076)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('blocks submission when a draft date that was valid at pick time has since passed', async () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });

    // Pick a draft date 60 seconds in the future — valid at pick time.
    const pickedDate = new Date('2026-01-01T12:01:00.000Z');
    fireEvent.change(screen.getByTestId('datetime-picker'), {
      target: { value: pickedDate.toISOString() },
    });

    // Idle the form past the picked date without touching any field, so the
    // memoized validationErrors never recomputes — this reproduces LS-6076.
    jest.setSystemTime(new Date('2026-01-01T12:01:30.000Z'));

    const submitBtn = screen.getByTestId('create-league-submit');
    fireEvent.submit(submitBtn.closest('form') as HTMLFormElement);

    await waitFor(() =>
      expect(
        screen.getByText(/Draft date must be in the future/i),
      ).toBeInTheDocument(),
    );
    expect(mockCreateLeague).not.toHaveBeenCalled();
  });

  it('allows submission when the draft date is still in the future at submit time', async () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });

    const pickedDate = new Date('2026-01-02T12:00:00.000Z');
    fireEvent.change(screen.getByTestId('datetime-picker'), {
      target: { value: pickedDate.toISOString() },
    });

    const submitBtn = screen.getByTestId('create-league-submit');
    fireEvent.submit(submitBtn.closest('form') as HTMLFormElement);

    await waitFor(() => expect(mockCreateLeague).toHaveBeenCalledTimes(1));
    expect(mockCreateLeague).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          input: expect.objectContaining({
            startDate: pickedDate.toISOString(),
          }),
        }),
      }),
    );
  });
});

describe('LeagueCreatePage — Games Per Matchup typing bounds (LS-6101)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
    mockIsPremiumLoading = false;
  });

  it('clamps to the sport max while typing a value above the bound (baseball, max 162)', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    const input = screen.getByDisplayValue('5');
    fireEvent.change(input, { target: { value: '999' } });
    expect(input).toHaveValue('162');
  });

  it('clamps to the sport max while typing a value above the bound (football, max 17)', () => {
    renderPage('/football/league/create');
    expandAllSections();
    const input = screen.getByDisplayValue('5');
    fireEvent.change(input, { target: { value: '99' } });
    expect(input).toHaveValue('17');
  });

  it('clamps to the sport min while typing a value below the bound', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    const input = screen.getByDisplayValue('5');
    fireEvent.change(input, { target: { value: '-5' } });
    expect(input).toHaveValue('1');
  });

  it('accepts an in-range value unchanged while typing', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    const input = screen.getByDisplayValue('5');
    fireEvent.change(input, { target: { value: '42' } });
    expect(input).toHaveValue('42');
  });
});

describe('LeagueCreatePage — Auction Budget / Min Bid typing bounds (LS-6074 / CLB-027)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    // Auction is premium-gated (LS-6072) — the budget/min-bid fields only
    // mount once selectionMethod actually switches to 'auction'.
    mockIsPremium = true;
  });

  it('clamps auction budget to the sane max while typing an overflow value', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    fireEvent.click(screen.getByRole('button', { name: /^Auction$/i }));

    const input = screen.getByDisplayValue('200');
    fireEvent.change(input, { target: { value: '99999999999' } });
    expect(input).toHaveValue('10000');
  });

  it('clamps auction budget to the min while typing a value below the bound', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    fireEvent.click(screen.getByRole('button', { name: /^Auction$/i }));

    const input = screen.getByDisplayValue('200');
    fireEvent.change(input, { target: { value: '-5' } });
    expect(input).toHaveValue('1');
  });

  it('clamps minimum bid to the sane max while typing an overflow value', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    fireEvent.click(screen.getByRole('button', { name: /^Auction$/i }));

    const input = screen.getByDisplayValue('1');
    fireEvent.change(input, { target: { value: '99999999999' } });
    expect(input).toHaveValue('10000');
  });

  it('accepts an in-range auction budget value unchanged while typing', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    fireEvent.click(screen.getByRole('button', { name: /^Auction$/i }));

    const input = screen.getByDisplayValue('200');
    fireEvent.change(input, { target: { value: '500' } });
    expect(input).toHaveValue('500');
  });
});

describe('LeagueCreatePage — Max Roster Size recommended marker (LS-6104)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
    mockIsPremiumLoading = false;
  });

  // Scoped to the roster-size group's container, not `screen` — "16" is also
  // a valid football team-count option (TEAM_COUNT_OPTIONS), so an unscoped
  // getByRole('button', { name: '16' }) would match two buttons.
  function rosterGroup() {
    return within(screen.getByTestId('max-roster-size-group'));
  }

  it('shows a Recommended marker on "26" at the baseball URL', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    const rosterButton = rosterGroup().getByRole('button', { name: '26' });
    expect(within(rosterButton).getByTestId('status-badge')).toHaveTextContent(
      'Recommended',
    );
  });

  // Football no longer has a Max Roster Size button group to mark — it
  // configures roster size per-slot instead (LS-6147). See the
  // "per-slot roster config (LS-6147)" describe block for football coverage.
  it('does not render the Max Roster Size group (and so no Recommended marker) at the football URL', () => {
    renderPage('/football/league/create');
    expandAllSections();
    expect(
      screen.queryByTestId('max-roster-size-group'),
    ).not.toBeInTheDocument();
  });

  it('does not mark non-recommended roster sizes', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    const otherButton = rosterGroup().getByRole('button', { name: '20' });
    expect(
      within(otherButton).queryByTestId('status-badge'),
    ).not.toBeInTheDocument();
  });

  it('keeps the marker on "26" whether or not it is the current selection', () => {
    renderPage('/baseball/league/create');
    expandAllSections();

    // "26" is the default selection — marker present.
    expect(
      within(rosterGroup().getByRole('button', { name: '26' })).getByTestId(
        'status-badge',
      ),
    ).toBeInTheDocument();

    // Select a different roster size — marker stays on "26", does not move.
    fireEvent.click(rosterGroup().getByRole('button', { name: '20' }));
    expect(
      within(rosterGroup().getByRole('button', { name: '26' })).getByTestId(
        'status-badge',
      ),
    ).toBeInTheDocument();
    expect(
      within(rosterGroup().getByRole('button', { name: '20' })).queryByTestId(
        'status-badge',
      ),
    ).not.toBeInTheDocument();

    // Re-select "26" — marker still shows exactly once, no clash/duplication.
    fireEvent.click(rosterGroup().getByRole('button', { name: '26' }));
    expect(
      within(rosterGroup().getByRole('button', { name: '26' })).getAllByTestId(
        'status-badge',
      ),
    ).toHaveLength(1);
  });

  it('does not change the accessible name of the "26" button', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    // Exact-name lookup must resolve to exactly one button within the roster
    // group (Testing Library throws if getByRole matches more than one),
    // proving the badge text is not concatenated into the accessible name.
    expect(
      rosterGroup().getByRole('button', { name: '26' }),
    ).toBeInTheDocument();
  });

  it('replaces the Max Roster Size group with the per-slot config when switching to football', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    expect(
      within(rosterGroup().getByRole('button', { name: '26' })).getByTestId(
        'status-badge',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sport-tab-football'));
    expandAllSections();

    // The button group (and its "26" marker) is gone; football shows the
    // per-slot config instead (LS-6147).
    expect(
      screen.queryByTestId('max-roster-size-group'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('roster-positions-config')).toBeInTheDocument();
  });
});

describe('LeagueCreatePage — playerPool/sport validation (LS-6103)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
  });

  /** Baseline valid baseball form data — every field satisfies validateFormFull. */
  function baseballFormData(overrides: Record<string, any> = {}) {
    return {
      sport: 'baseball',
      leagueName: 'Test League',
      numberOfTeams: 12,
      numberOfDivisions: 2,
      schedulingStrategy: 'divisional',
      playerPool: 'all',
      draftMode: 'live',
      selectionMethod: 'standard',
      draftOrder: 'snake',
      maxRosterSize: 26,
      draftDate: undefined,
      waiverType: 'standard',
      faabBudgetDefault: 100,
      isPublic: false,
      gamesPerMatchup: 5,
      baseballEraFilter: 'all',
      baseballHofOnly: false,
      customEraStartYear: undefined,
      customEraEndYear: undefined,
      salaryCapEnabled: false,
      salaryCap: undefined,
      auctionBudget: 200,
      auctionMinBid: 1,
      pickTimeLimitSeconds: 120,
      scoringFormat: 'ppr',
      defensiveFormat: 'dst',
      ...overrides,
    };
  }

  function footballFormData(overrides: Record<string, any> = {}) {
    return baseballFormData({
      sport: 'football',
      numberOfTeams: 10,
      maxRosterSize: 16,
      playerPool: 'all',
      ...overrides,
    });
  }

  it('flags a baseball pool value submitted while sport is football', () => {
    const errs = validateFormFull(footballFormData({ playerPool: 'nl' }));
    expect(errs.playerPool).toBe(
      'Player pool "nl" is not valid for football leagues.',
    );
  });

  it('flags a football pool value submitted while sport is baseball', () => {
    const errs = validateFormFull(baseballFormData({ playerPool: 'nfc' }));
    expect(errs.playerPool).toBe(
      'Player pool "nfc" is not valid for baseball leagues.',
    );
  });

  it('accepts every valid baseball pool value', () => {
    for (const pool of ['all', 'nl', 'al']) {
      const errs = validateFormFull(baseballFormData({ playerPool: pool }));
      expect(errs.playerPool).toBeUndefined();
    }
  });

  it('accepts every valid football pool value', () => {
    for (const pool of ['all', 'nfc', 'afc']) {
      const errs = validateFormFull(footballFormData({ playerPool: pool }));
      expect(errs.playerPool).toBeUndefined();
    }
  });

  it('does not call the mutation when validation fails (generic errorCount gate)', () => {
    // The playerPool/sport check flows through the same validationErrors ->
    // errorCount -> handleSubmit gate as every other field (lines 1183-1186,
    // unchanged by this fix). An empty league name exercises that same gate
    // deterministically, since a genuine playerPool/sport race is a one-render
    // window that RTL's act()-synchronous effect flushing cannot reproduce.
    renderPage('/baseball/league/create');
    const submitBtn = screen.getByTestId('create-league-submit');
    fireEvent.submit(submitBtn.closest('form') as HTMLFormElement);
    expect(mockCreateLeague).not.toHaveBeenCalled();
  });
});

describe('LeagueCreatePage — post-create confirmation (LS-6067)', () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(
    navigator,
    'clipboard',
  );

  const setClipboard = (value: unknown) =>
    Object.defineProperty(navigator, 'clipboard', {
      value,
      configurable: true,
      writable: true,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    mockLeagueCount = 0;
    mockIsPremium = false;
  });

  afterEach(() => {
    Object.defineProperty(
      navigator,
      'clipboard',
      originalClipboard ?? {
        value: undefined,
        configurable: true,
        writable: true,
      },
    );
  });

  function submitWithLeagueName(name = 'Test League') {
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: name },
    });
    const submitBtn = screen.getByTestId('create-league-submit');
    fireEvent.submit(submitBtn.closest('form') as HTMLFormElement);
  }

  it('shows a confirmation dialog with the invite code instead of navigating immediately', async () => {
    mockCreateLeague.mockResolvedValue({
      data: {
        createLeagueAndTeams: {
          league: { id: 42, inviteCode: 'ABC123' },
        },
      },
    });
    renderPage('/baseball/league/create');
    submitWithLeagueName();

    expect(
      await screen.findByRole('alertdialog', { name: 'League created!' }),
    ).toBeInTheDocument();
    expect(screen.getByText('ABC123')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith('/baseball/league/42');
    expect(
      screen.queryByText('Baseball League Detail'),
    ).not.toBeInTheDocument();
  });

  it('navigates to the league page when Continue to League is clicked', async () => {
    mockCreateLeague.mockResolvedValue({
      data: {
        createLeagueAndTeams: {
          league: { id: 42, inviteCode: 'ABC123' },
        },
      },
    });
    renderPage('/baseball/league/create');
    submitWithLeagueName();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Continue to League' }),
    );

    expect(screen.getByText('Baseball League Detail')).toBeInTheDocument();
  });

  it('copies the invite code to the clipboard without dismissing the dialog', async () => {
    mockCreateLeague.mockResolvedValue({
      data: {
        createLeagueAndTeams: {
          league: { id: 42, inviteCode: 'ABC123' },
        },
      },
    });
    const writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    renderPage('/baseball/league/create');
    submitWithLeagueName();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Copy Invite Code' }),
    );

    expect(writeText).toHaveBeenCalledWith('ABC123');
    expect(
      await screen.findByRole('button', { name: 'Copied!' }),
    ).toBeInTheDocument();
    // Copying doesn't dismiss the dialog — the user can still continue.
    expect(
      screen.getByRole('alertdialog', { name: 'League created!' }),
    ).toBeInTheDocument();
  });

  it('omits the invite code block when the mutation response has none', async () => {
    mockCreateLeague.mockResolvedValue({
      data: {
        createLeagueAndTeams: { league: { id: 42, inviteCode: null } },
      },
    });
    renderPage('/baseball/league/create');
    submitWithLeagueName();

    expect(
      await screen.findByRole('alertdialog', { name: 'League created!' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Copy Invite Code' }),
    ).not.toBeInTheDocument();
  });
});

describe('LeagueCreatePage — submit error code + correlation token (LS-6065)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLeagueCount = 0;
    mockIsPremium = false;
  });

  function submitForm() {
    renderPage('/baseball/league/create');
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });
    const submitBtn = screen.getByTestId('create-league-submit');
    fireEvent.submit(submitBtn.closest('form') as HTMLFormElement);
  }

  it('renders the GraphQL extensions.code alongside the message on a GraphQL error', async () => {
    const { CombinedGraphQLErrors } = require('@apollo/client');
    const graphQLError = new CombinedGraphQLErrors({ data: null }, [
      {
        message: 'League name is already in use.',
        extensions: { code: 'BAD_USER_INPUT' },
      },
    ]);
    mockCreateLeague.mockRejectedValue(graphQLError);

    submitForm();

    await waitFor(() =>
      expect(
        screen.getByText('League name is already in use.'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/Error code: BAD_USER_INPUT/)).toBeInTheDocument();
    expect(screen.getByText(/Ref: [0-9a-f]{8}/)).toBeInTheDocument();
  });

  it('still renders a generated correlation token when the error has no extensions.code', async () => {
    // A plain thrown Error (not CombinedGraphQLErrors, not ServerError) has no
    // GraphQL extensions.code and no HTTP statusCode to fall back on.
    mockCreateLeague.mockRejectedValue(new Error('Failed to fetch'));

    submitForm();

    await waitFor(() =>
      expect(screen.getByText(/Ref: [0-9a-f]{8}/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Error code:/)).not.toBeInTheDocument();
  });

  it('renders the HTTP status code as the error code on a ServerError with no GraphQL extensions', async () => {
    const { ServerError } = require('@apollo/client');
    const serverError = new ServerError('Server error', {
      response: { status: 502 } as Response,
      bodyText: '',
    });
    mockCreateLeague.mockRejectedValue(serverError);

    submitForm();

    await waitFor(() =>
      expect(screen.getByText(/Error code: 502/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Ref: [0-9a-f]{8}/)).toBeInTheDocument();
  });

  it('passes the code and correlation token to LOGGER.error as structured metadata', async () => {
    const { CombinedGraphQLErrors } = require('@apollo/client');
    const graphQLError = new CombinedGraphQLErrors({ data: null }, [
      { message: 'Boom', extensions: { code: 'BAD_USER_INPUT' } },
    ]);
    mockCreateLeague.mockRejectedValue(graphQLError);

    submitForm();

    await waitFor(() => expect(mockLoggerError).toHaveBeenCalled());
    const metaArg = mockLoggerError.mock.calls[0][2];
    expect(metaArg).toEqual({
      code: 'BAD_USER_INPUT',
      correlationId: expect.stringMatching(/^[0-9a-f]{8}$/),
    });
  });
});

describe('LeagueCreatePage — URL prefill allowlist (LS-6112)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
  });

  async function submitAndGetInput() {
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });
    const submitBtn = screen.getByTestId('create-league-submit');
    fireEvent.submit(submitBtn.closest('form') as HTMLFormElement);
    await waitFor(() => expect(mockCreateLeague).toHaveBeenCalledTimes(1));
    return mockCreateLeague.mock.calls[0][0].variables.input;
  }

  it('AC1: prefills numberOfTeams from a valid ?teams= value', async () => {
    renderPage('/baseball/league/create?teams=8');
    const input = await submitAndGetInput();
    expect(input.numberOfTeams).toBe(8);
  });

  it('AC1: rejects ?teams=15 (not in TEAM_COUNT_OPTIONS) and falls back to the sport default', async () => {
    renderPage('/baseball/league/create?teams=15');
    const input = await submitAndGetInput();
    expect(input.numberOfTeams).toBe(12); // baseball's SPORTS.defaultTeams
  });

  it('AC2: ignores a non-numeric ?teams= value and falls back to the sport default', async () => {
    renderPage('/baseball/league/create?teams=abc');
    const input = await submitAndGetInput();
    expect(input.numberOfTeams).toBe(12); // baseball's SPORTS.defaultTeams
  });

  it('AC3: prefills baseballEraFilter from a valid ?eraFilter= value', async () => {
    renderPage('/baseball/league/create?eraFilter=modern');
    const input = await submitAndGetInput();
    expect(input.eraFilter).toBe('modern');
  });

  it('AC4: ignores an ?eraFilter= value not valid for the sport and falls back to "all"', async () => {
    renderPage('/baseball/league/create?eraFilter=pioneer');
    const input = await submitAndGetInput();
    expect(input.eraFilter).toBe('all');
  });

  it('AC5: prefills scoringFormat from a valid ?scoringFormat= value on the football route', async () => {
    renderPage('/football/league/create?scoringFormat=half_ppr');
    const input = await submitAndGetInput();
    expect(input.scoringFormat).toBe('half_ppr');
  });

  it('AC5: ?scoringFormat= has no effect on the baseball route', async () => {
    renderPage('/baseball/league/create?scoringFormat=half_ppr');
    const input = await submitAndGetInput();
    expect(input.scoringFormat).toBeUndefined();
  });

  it('AC6: ignores an invalid ?scoringFormat= value (including "custom") and falls back to "ppr"', async () => {
    renderPage('/football/league/create?scoringFormat=custom');
    const input = await submitAndGetInput();
    expect(input.scoringFormat).toBe('ppr');
  });

  it('AC7: existing ?name= prefill behavior is unchanged alongside the new params', async () => {
    renderPage('/baseball/league/create?name=Deep+Link+League&teams=8');
    const submitBtn = screen.getByTestId('create-league-submit');
    fireEvent.submit(submitBtn.closest('form') as HTMLFormElement);
    await waitFor(() => expect(mockCreateLeague).toHaveBeenCalledTimes(1));
    const input = mockCreateLeague.mock.calls[0][0].variables.input;
    expect(input.leagueName).toBe('Deep Link League');
    expect(input.numberOfTeams).toBe(8);
  });
});

describe('LeagueCreatePage — era upgrade modal analytics dedup (LS-6097)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
  });

  function trackPremiumFeatureClickMock(): jest.Mock {
    return jest.requireMock('../../utils/analytics').trackPremiumFeatureClick;
  }

  it('fires trackPremiumFeatureClick exactly once across repeated triggers while the modal is open, then again after close/reopen', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    const unlockButton = screen.getByRole('button', { name: /Unlock/i });

    fireEvent.click(unlockButton);
    expect(
      screen.getByRole('dialog', { name: 'Historical Era Selection' }),
    ).toBeInTheDocument();
    expect(trackPremiumFeatureClickMock()).toHaveBeenCalledTimes(1);

    // Repeated triggers while the modal is already open must not re-fire.
    fireEvent.click(unlockButton);
    fireEvent.click(unlockButton);
    expect(trackPremiumFeatureClickMock()).toHaveBeenCalledTimes(1);

    // Closing and re-triggering is a new user intent — fires again.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(
      screen.queryByRole('dialog', { name: 'Historical Era Selection' }),
    ).not.toBeInTheDocument();

    fireEvent.click(unlockButton);
    expect(trackPremiumFeatureClickMock()).toHaveBeenCalledTimes(2);
  });
});

describe('LeagueCreatePage — ?name= sanitization (LS-6107 / CLB-051)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
  });

  it('AC1: strips a <script> tag-shaped ?name= param instead of prefilling it verbatim', () => {
    renderPage(
      '/baseball/league/create?name=%3Cscript%3Ealert(1)%3C%2Fscript%3E',
    );
    const input = screen.getByPlaceholderText('Enter your league name');
    expect(input.value).not.toContain('<script>');
    expect(input.value).not.toContain('</script>');
  });

  it('AC2: strips a Unicode RTL override character (U+202E) from the ?name= param', () => {
    renderPage(
      `/baseball/league/create?name=${encodeURIComponent('evil\u202Ename')}`,
    );
    const input = screen.getByPlaceholderText('Enter your league name');
    expect(input.value).not.toContain('\u202E');
    expect(input.value).toBe('evilname');
  });

  it('AC3: strips control/RTL-override characters typed or pasted into the field', () => {
    renderPage('/baseball/league/create');
    const input = screen.getByPlaceholderText('Enter your league name');
    fireEvent.change(input, {
      target: { value: 'Evil\u202ELeague' },
    });
    expect(input.value).not.toMatch(/[\u202E]/);
    expect(input.value).toBe('EvilLeague');
  });

  it('AC4: preserves trim + max-length truncation after sanitization', () => {
    const longName = `  ${'a'.repeat(60)}  `;
    renderPage(`/baseball/league/create?name=${encodeURIComponent(longName)}`);
    const input = screen.getByPlaceholderText('Enter your league name');
    expect(input.value).toHaveLength(50);
    expect(input.value).toBe('a'.repeat(50));
  });

  it('AC5: prefills normally for a plain alphanumeric ?name= param (no regression)', () => {
    renderPage('/baseball/league/create?name=My%20Great%20League');
    const input = screen.getByPlaceholderText('Enter your league name');
    expect(input.value).toBe('My Great League');
  });
});

describe('LeagueCreatePage — premiumLoading cold-load era display (LS-6088)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
    mockIsPremiumLoading = false;
  });

  it('shows the non-premium upsell banner once entitlements resolve as non-premium', () => {
    mockIsPremium = false;
    mockIsPremiumLoading = false;
    renderPage('/baseball/league/create');
    expandAllSections();
    expect(screen.getByText('Historical eras are premium')).toBeInTheDocument();
  });

  it('does not show the upsell banner while premiumLoading is true, even though isPremium is still false', () => {
    mockIsPremium = false;
    mockIsPremiumLoading = true;
    renderPage('/baseball/league/create');
    expandAllSections();
    expect(
      screen.queryByText('Historical eras are premium'),
    ).not.toBeInTheDocument();
  });

  it('renders a loading skeleton for the era grid instead of locked tiles while premiumLoading is true', () => {
    mockIsPremium = true;
    mockIsPremiumLoading = true;
    renderPage('/baseball/league/create');
    expandAllSections();
    expect(screen.getByTestId('era-entitlements-loading')).toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton-block').length).toBeGreaterThan(0);
  });

  it('renders the real era grid (no skeleton) once premiumLoading resolves', () => {
    mockIsPremium = true;
    mockIsPremiumLoading = false;
    renderPage('/baseball/league/create');
    expandAllSections();
    expect(
      screen.queryByTestId('era-entitlements-loading'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('skeleton-block')).not.toBeInTheDocument();
  });
});

describe('LeagueCreatePage — submit error banner auto-scroll (LS-6066)', () => {
  let scrollIntoViewMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
    scrollIntoViewMock = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
  });

  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  function submitWithLeagueName() {
    renderPage('/baseball/league/create');
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League' },
    });
    const submitBtn = screen.getByTestId('create-league-submit');
    fireEvent.submit(submitBtn.closest('form') as HTMLFormElement);
  }

  it('scrolls the banner into view when a submit error first appears', async () => {
    mockCreateLeague.mockRejectedValue(new Error('Failed to fetch'));

    submitWithLeagueName();

    await screen.findByTestId('submit-error-banner');
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: 'smooth',
    });
  });

  it('does not re-trigger the scroll on a re-render while the banner is already showing', async () => {
    mockCreateLeague.mockRejectedValue(new Error('Failed to fetch'));

    submitWithLeagueName();
    await screen.findByTestId('submit-error-banner');
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

    // A re-render triggered by unrelated state (typing) must not re-fire the
    // scroll while submitError stays the same truthy value.
    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Test League 2' },
    });
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });

  it('does not trigger a scroll when the banner is dismissed', async () => {
    mockCreateLeague.mockRejectedValue(new Error('Failed to fetch'));

    submitWithLeagueName();
    await screen.findByTestId('submit-error-banner');
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }));

    expect(screen.queryByTestId('submit-error-banner')).not.toBeInTheDocument();
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
  });
});

describe('validateFormFull — salaryCap validation (LS-6115)', () => {
  const baseForm: CreateLeagueFormData = {
    sport: 'baseball',
    leagueName: 'Test League',
    numberOfTeams: 12,
    numberOfDivisions: 2,
    schedulingStrategy: 'divisional',
    playerPool: 'all',
    draftMode: 'live',
    selectionMethod: 'standard',
    draftOrder: 'snake',
    maxRosterSize: 26,
    waiverType: 'standard',
    faabBudgetDefault: 100,
    isPublic: false,
    gamesPerMatchup: 5,
    baseballEraFilter: 'all',
    baseballHofOnly: false,
    salaryCapEnabled: true,
    salaryCap: undefined,
    auctionBudget: 200,
    auctionMinBid: 1,
    pickTimeLimitSeconds: 120,
    scoringFormat: 'ppr',
    defensiveFormat: 'dst',
  };

  it('requires a salaryCap when the cap is enabled', () => {
    const errs = validateFormFull({ ...baseForm, salaryCap: undefined });
    expect(errs.salaryCap).toBe('Salary cap amount is required.');
  });

  it('rejects salaryCap: 0 (LS-6115 — previously passed validation)', () => {
    const errs = validateFormFull({ ...baseForm, salaryCap: 0 });
    expect(errs.salaryCap).toMatch(/between/);
  });

  it('rejects a negative salaryCap', () => {
    const errs = validateFormFull({ ...baseForm, salaryCap: -100 });
    expect(errs.salaryCap).toMatch(/between/);
  });

  it('rejects an absurdly large salaryCap', () => {
    const errs = validateFormFull({ ...baseForm, salaryCap: 9_999_999_999 });
    expect(errs.salaryCap).toMatch(/between/);
  });

  it('accepts a valid salaryCap', () => {
    const errs = validateFormFull({ ...baseForm, salaryCap: 260 });
    expect(errs.salaryCap).toBeUndefined();
  });

  it('does not validate salaryCap when the cap is disabled', () => {
    const errs = validateFormFull({
      ...baseForm,
      salaryCapEnabled: false,
      salaryCap: 0,
    });
    expect(errs.salaryCap).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Export/import league settings (LS-9146)
// ---------------------------------------------------------------------------

describe('parseLeagueSettingsExport', () => {
  it('rejects malformed JSON', () => {
    const result = parseLeagueSettingsExport('{not valid json');
    expect(result.ok).toBe(false);
  });

  it('rejects JSON missing a recognized sport', () => {
    const result = parseLeagueSettingsExport(JSON.stringify({ settings: {} }));
    expect(result.ok).toBe(false);
  });

  it('rejects JSON missing settings', () => {
    const result = parseLeagueSettingsExport(
      JSON.stringify({ sport: 'baseball' }),
    );
    expect(result.ok).toBe(false);
  });

  it('accepts a well-formed export envelope', () => {
    const result = parseLeagueSettingsExport(
      JSON.stringify({
        version: 1,
        exportedAt: '2026-01-01T00:00:00.000Z',
        sourceLeagueName: 'The Sluggers',
        sport: 'baseball',
        settings: { waiverType: 'faab', faabBudgetDefault: 150 },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.sport).toBe('baseball');
      expect(result.envelope.settings).toEqual({
        waiverType: 'faab',
        faabBudgetDefault: 150,
      });
    }
  });
});

describe('applyImportedSettings', () => {
  const baseFormData: CreateLeagueFormData = {
    sport: 'baseball',
    leagueName: 'Test League',
    numberOfTeams: 8,
    numberOfDivisions: 2,
    schedulingStrategy: 'divisional',
    playerPool: 'all',
    draftMode: 'live',
    selectionMethod: 'standard',
    draftOrder: 'snake',
    maxRosterSize: 26,
    waiverType: 'standard',
    faabBudgetDefault: 100,
    isPublic: false,
    gamesPerMatchup: 5,
    baseballEraFilter: 'all',
    baseballHofOnly: false,
    salaryCapEnabled: false,
    auctionBudget: 200,
    auctionMinBid: 1,
    pickTimeLimitSeconds: 120,
    scoringFormat: 'ppr',
    defensiveFormat: 'dst',
  };

  function envelope(
    overrides: Partial<LeagueSettingsExportEnvelope>,
  ): LeagueSettingsExportEnvelope {
    return {
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      sourceLeagueName: 'Source League',
      sport: 'baseball',
      settings: {},
      ...overrides,
    };
  }

  it('applies valid settings onto the form', () => {
    const { next, appliedCount, skippedFields } = applyImportedSettings(
      baseFormData,
      envelope({
        settings: {
          waiverType: 'faab',
          faabBudgetDefault: 250,
          isPublic: true,
        },
      }),
    );
    expect(next.waiverType).toBe('faab');
    expect(next.faabBudgetDefault).toBe(250);
    expect(next.isPublic).toBe(true);
    expect(appliedCount).toBe(3);
    expect(skippedFields).toEqual([]);
  });

  it('skips out-of-range values and reports them, leaving the form unchanged', () => {
    const { next, appliedCount, skippedFields } = applyImportedSettings(
      baseFormData,
      envelope({
        settings: {
          faabBudgetDefault: -50,
          keeperCount: 0,
        },
      }),
    );
    expect(next.faabBudgetDefault).toBe(baseFormData.faabBudgetDefault);
    expect(appliedCount).toBe(0);
    expect(skippedFields).toEqual(
      expect.arrayContaining(['faabBudgetDefault', 'keeperCount']),
    );
  });

  it('skips an unrecognized enum-like value (e.g. a stale waiverType)', () => {
    const { next, skippedFields } = applyImportedSettings(
      baseFormData,
      envelope({ settings: { waiverType: 'auction-blind' } }),
    );
    expect(next.waiverType).toBe(baseFormData.waiverType);
    expect(skippedFields).toContain('waiverType');
  });

  it('skips sport-specific fields when importing across sports (football -> baseball)', () => {
    const { next, skippedFields, appliedCount } = applyImportedSettings(
      baseFormData,
      envelope({
        sport: 'football',
        settings: {
          defensiveFormat: 'idp',
          waiverType: 'faab',
        },
      }),
    );
    // defensiveFormat only applies when importing into the same sport.
    expect(next.defensiveFormat).toBe(baseFormData.defensiveFormat);
    expect(skippedFields).not.toContain('defensiveFormat');
    // Sport-agnostic fields still apply.
    expect(next.waiverType).toBe('faab');
    expect(appliedCount).toBe(1);
  });

  it('applies a football-only field when importing into a football league', () => {
    const footballForm: CreateLeagueFormData = {
      ...baseFormData,
      sport: 'football',
    };
    const { next, appliedCount } = applyImportedSettings(
      footballForm,
      envelope({ sport: 'football', settings: { defensiveFormat: 'idp' } }),
    );
    expect(next.defensiveFormat).toBe('idp');
    expect(appliedCount).toBe(1);
  });
});

describe('LeagueCreatePage — Fast Lane (LS-9128)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
    mockIsPremiumLoading = false;
    mockFootballEnabled = true;
  });

  it('is off by default, leaving every section independently expandable', () => {
    renderPage('/baseball/league/create');
    expect(screen.getByTestId('fast-lane-toggle')).toBeInTheDocument();
    expect(
      screen.getByTestId('section-toggle-roster-schedule'),
    ).toHaveAttribute('aria-disabled', 'false');
  });

  it('collapses and locks every section but Basic Settings when turned on', () => {
    renderPage('/baseball/league/create');
    expandAllSections();
    expect(screen.getByTestId('section-toggle-era-history')).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    fireEvent.click(
      within(screen.getByTestId('fast-lane-toggle')).getByRole('button', {
        name: '⚡ On',
      }),
    );

    // Locked, not removed — the section header is still in the document.
    const eraToggle = screen.getByTestId('section-toggle-era-history');
    expect(eraToggle).toBeInTheDocument();
    expect(eraToggle).toHaveAttribute('aria-expanded', 'false');
    expect(eraToggle).toHaveAttribute('aria-disabled', 'true');

    // Locked sections ignore clicks — content stays collapsed.
    fireEvent.click(eraToggle);
    expect(eraToggle).toHaveAttribute('aria-expanded', 'false');

    // Basic Settings stays interactive.
    expect(screen.getByTestId('section-toggle-basic')).toHaveAttribute(
      'aria-disabled',
      'false',
    );
  });

  it('still submits successfully using the defaults while Fast Lane is on', async () => {
    renderPage('/baseball/league/create');
    fireEvent.click(
      within(screen.getByTestId('fast-lane-toggle')).getByRole('button', {
        name: '⚡ On',
      }),
    );

    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Fast Lane League' },
    });
    fireEvent.click(screen.getByTestId('create-league-submit'));

    await waitFor(() => expect(mockCreateLeague).toHaveBeenCalled());
  });

  it('turns itself off to reveal a validation error hiding in a locked section', async () => {
    mockIsPremium = true;
    renderPage('/baseball/league/create');
    expandAllSections();
    fireEvent.click(screen.getByText('Custom Era'));
    fireEvent.click(
      within(screen.getByTestId('fast-lane-toggle')).getByRole('button', {
        name: '⚡ On',
      }),
    );

    fireEvent.change(screen.getByPlaceholderText('Enter your league name'), {
      target: { value: 'Fast Lane League' },
    });
    fireEvent.click(screen.getByTestId('create-league-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('section-toggle-era-history')).toHaveAttribute(
        'aria-disabled',
        'false',
      );
    });
    expect(mockCreateLeague).not.toHaveBeenCalled();
  });
});

describe('LeagueCreatePage — sport tab access (LS-9128)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateLeague.mockResolvedValue({ data: undefined });
    mockLeagueCount = 0;
    mockIsPremium = false;
    mockIsPremiumLoading = false;
  });

  afterEach(() => {
    mockFootballEnabled = true;
  });

  it('disables (rather than hiding) the Football tab when football_enabled is off', () => {
    mockFootballEnabled = false;
    renderPage('/baseball/league/create');

    const footballTab = screen.getByTestId('sport-tab-football');
    // Still visible/present, per LS-9128 — a disabled panel is not a hidden one.
    expect(footballTab).toBeInTheDocument();
    expect(footballTab).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();

    fireEvent.click(footballTab);
    expect(
      screen.getByRole('heading', { name: /Create Baseball League/i }),
    ).toBeInTheDocument();
  });

  it('keeps the Football tab fully enabled when football_enabled is on', () => {
    mockFootballEnabled = true;
    renderPage('/baseball/league/create');

    const footballTab = screen.getByTestId('sport-tab-football');
    expect(footballTab).toHaveAttribute('aria-disabled', 'false');
    expect(screen.queryByText('Coming Soon')).not.toBeInTheDocument();

    fireEvent.click(footballTab);
    expect(
      screen.getByRole('heading', { name: /Create Football League/i }),
    ).toBeInTheDocument();
  });
});
