/**
 * LS-5178 — MockDraft page reflects the free-tier weekly limit in the UI.
 *
 * Covers the four states driven by getMyMockDraftUsage:
 *   1. Loading            → neutral skeleton (no form, no limit card).
 *   2. Free, below cap     → setup form + "N of M free mock drafts used" helper.
 *   3. Free, at/over cap   → disabled limit-reached card (no Start button).
 *   4. Unlimited (premium) → setup form, no usage helper.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MockDraftPage } from './MockDraftPage';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual: typeof import('react-router-dom') =
    jest.requireActual('react-router-dom');
  const mocked: typeof import('react-router-dom') = {
    ...actual,
    useNavigate: () => mockNavigate,
  };
  return mocked;
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Minimal prop shape for the stubbed UI primitives below. `unknown`-typed
// extras keep the mocks lint-clean without file-level eslint suppressions.
type MockProps = {
  children?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  [key: string]: unknown;
};

const asStr = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : undefined;

jest.mock('../../context/GrowthBookProvider', () => ({
  useFeatureIsOn: jest.fn(() => false),
}));

// Control All Teams entitlement (LS-9253) — controlled per-test, defaults to
// not entitled so the gated-option tests exercise the locked path. Mocked
// (rather than letting the real useEntitlements/useAuth chain run) since
// these page tests don't wrap in an AuthProvider.
const mockUseHasEntitlement = jest.fn(() => false);
jest.mock('../../hooks/useIsPremium', () => ({
  useHasEntitlement: () => mockUseHasEntitlement(),
}));

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));
jest.mock('../../components/UpgradeModal', () => ({
  UpgradeModal: () => null,
}));

jest.mock('../../constants/colors', () => ({
  BLACK: '#000',
  BRAND_GOLD: '#C5A55A',
  BRAND_NAVY_LIGHT: '#1B3A5C',
  BRAND_SEAM_RED: '#C41E3A',
  EMERALD: '#10B981',
  GRADIENT_BOARD_BG: 'linear-gradient(#000,#000)',
  OVERLAY_WHITE_10: 'rgba(255,255,255,0.1)',
  SURFACE_CARD: '#111B2F',
  withAlpha: (c: string) => c,
}));

jest.mock('@tamagui/lucide-icons', () => ({
  Lock: () => <span data-testid="icon-lock" />,
}));

// The interactive settings form lives in shared-components (LS-7711); these
// page tests cover MockDraftPage's state selection (skeleton vs limit-reached
// vs form) and the usage-label wiring, so we stub the shared form to surface
// the usageLabel it receives plus a Start button.
// Settings passed to `onStart` when the mock "Start Mock Draft" button is
// clicked — each test can override `mockStartSettings` to exercise a
// specific sport (LS-9040).
let mockStartSettings: Record<string, unknown> = {
  numTeams: 8,
  rosterSize: 15,
  userPickPosition: 1,
  draftOrder: 'snake',
  playerPool: 'all',
  sport: 'baseball',
};

jest.mock('@legacy-sports/shared-components/draft', () => ({
  MockDraftSetup: ({
    usageLabel,
    onStart,
    onJoinInstead,
  }: {
    usageLabel?: string;
    onStart?: (settings: unknown) => void;
    onJoinInstead?: () => void;
    [key: string]: unknown;
  }) => (
    <div data-testid="mock-draft-setup">
      {usageLabel ? <p>{usageLabel}</p> : null}
      <button onClick={() => onStart?.(mockStartSettings)}>
        Start Mock Draft
      </button>
      {onJoinInstead ? (
        <button onClick={onJoinInstead}>Join instead</button>
      ) : null}
    </div>
  ),
  MockDraftInviteCard: ({
    inviteCode,
    onContinue,
  }: {
    inviteCode: string;
    onContinue: () => void;
  }) => (
    <div data-testid="mock-draft-invite-card">
      <p>{inviteCode}</p>
      <button onClick={onContinue}>Continue to Draft Room</button>
    </div>
  ),
  ResumeMockDraftBanner: ({
    drafts,
    onResume,
  }: {
    drafts: { draftId: number; sport: string }[];
    onResume: (draft: { draftId: number; sport: string }) => void;
  }) => (
    <div data-testid="resume-mock-draft-banner">
      {drafts.map((d) => (
        <button key={d.draftId} onClick={() => onResume(d)}>
          Resume {d.draftId}
        </button>
      ))}
    </div>
  ),
}));

jest.mock('@legacy-sports/shared-components/ui', () => ({
  Button: ({ children, onPress, disabled, ...rest }: MockProps) => (
    <button
      data-testid={asStr(rest['data-testid'])}
      aria-label={asStr(rest['aria-label'])}
      onClick={onPress}
      disabled={disabled}
    >
      {children}
    </button>
  ),
  H1: ({ children }: MockProps) => <h1>{children}</h1>,
  Paragraph: ({ children }: MockProps) => <p>{children}</p>,
  Skeleton: () => <div data-testid="mock-draft-skeleton" />,
  XStack: ({ children }: MockProps) => <div>{children}</div>,
  YStack: ({ children, ...rest }: MockProps) => (
    <div data-testid={asStr(rest['data-testid'])}>{children}</div>
  ),
}));

jest.mock('tamagui', () => ({
  createTokens: (tokens: unknown) => tokens,
  Text: ({ children }: MockProps) => <span>{children}</span>,
}));

type Usage = {
  used: number;
  limit: number;
  remaining: number;
  isUnlimited: boolean;
} | null;

// Safe default so rendering before an explicit setUsage() can't crash the
// mocked hook (each test still sets the state it needs in its first line).
let mockUsageResult: {
  data: { getMyMockDraftUsage: Usage } | undefined;
  loading: boolean;
} = { data: undefined, loading: false };

// LS-10076: mock drafts no longer create a league, so the mutation is
// `createMockDraft` and it returns a `draftId` rather than a `leagueId`.
const mockCreateMockDraft = jest.fn(() =>
  Promise.resolve({ data: { createMockDraft: { draftId: 42 } } }),
);

// LS-10465: unfinished mock drafts for the resume banner. Empty by default.
let mockActiveDrafts: Record<string, unknown>[] = [];

jest.mock('@legacy-sports/graphql', () => ({
  useGetMyMockDraftUsageQuery: () => mockUsageResult,
  useGetMyActiveMockDraftsQuery: () => ({
    data: { myActiveMockDrafts: mockActiveDrafts },
  }),
  useCreateMockDraftMutation: () => [
    mockCreateMockDraft,
    { loading: false, error: undefined },
  ],
  Sport: { Baseball: 'baseball', Football: 'football' },
  MockDraftMode: { Offline: 'OFFLINE', Online: 'ONLINE' },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setUsage(usage: Usage, loading = false): void {
  mockUsageResult = {
    data: usage == null ? undefined : { getMyMockDraftUsage: usage },
    loading,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/baseball/mock-draft']}>
      <Routes>
        <Route path="/baseball/mock-draft" element={<MockDraftPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MockDraftPage — weekly limit reflected in UI (LS-5178)', () => {
  afterEach(() => jest.clearAllMocks());

  it('shows a skeleton while usage is still loading on first load', () => {
    setUsage(null, true);
    renderPage();
    expect(screen.getAllByTestId('mock-draft-skeleton').length).toBeGreaterThan(
      0,
    );
    expect(
      screen.queryByRole('button', { name: /Start Mock Draft/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the setup form with a usage helper for a free user below the cap', () => {
    setUsage({ used: 1, limit: 2, remaining: 1, isUnlimited: false });
    renderPage();
    expect(
      screen.getByRole('button', { name: /Start Mock Draft/i }),
    ).toBeEnabled();
    expect(
      screen.getByText(/1 of 2 free mock drafts used this week/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('mock-draft-limit-reached'),
    ).not.toBeInTheDocument();
  });

  it('renders the disabled limit-reached state for a free user at the cap', () => {
    setUsage({ used: 2, limit: 2, remaining: 0, isUnlimited: false });
    renderPage();
    expect(screen.getByTestId('mock-draft-limit-reached')).toBeInTheDocument();
    expect(
      screen.getByText(/2\/2 mock drafts used this week/i),
    ).toBeInTheDocument();
    // The form's Start button must NOT be reachable when the limit is hit.
    expect(
      screen.queryByRole('button', { name: /Start Mock Draft/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Upgrade to Premium/i }),
    ).toBeInTheDocument();
  });

  it('renders the form without a usage helper for unlimited (premium) users', () => {
    setUsage({ used: 5, limit: 2, remaining: 2, isUnlimited: true });
    renderPage();
    expect(
      screen.getByRole('button', { name: /Start Mock Draft/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/free mock drafts used this week/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('mock-draft-limit-reached'),
    ).not.toBeInTheDocument();
  });
});

describe('MockDraftPage — sport threading & navigation (LS-9040)', () => {
  afterEach(() => jest.clearAllMocks());

  it('forwards sport to createMockDraft and navigates to the baseball draft room', async () => {
    setUsage({ used: 0, limit: 2, remaining: 2, isUnlimited: false });
    mockStartSettings = {
      numTeams: 8,
      userPickPosition: 1,
      draftOrder: 'snake',
      playerPool: 'all',
      sport: 'baseball',
    };
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Start Mock Draft/i }));

    await screen.findByRole('button', { name: /Start Mock Draft/i });
    expect(mockCreateMockDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        // `userPickPosition` from the form is sent as `pickPosition` (LS-10076).
        variables: expect.objectContaining({
          sport: 'baseball',
          pickPosition: 1,
        }),
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/baseball/mock-draft/42');
  });

  it('does not send a rosterSize — the server uses the sport default (LS-10086)', async () => {
    setUsage({ used: 0, limit: 2, remaining: 2, isUnlimited: false });
    mockStartSettings = {
      numTeams: 8,
      userPickPosition: 1,
      draftOrder: 'snake',
      playerPool: 'all',
      sport: 'baseball',
    };
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Start Mock Draft/i }));

    await screen.findByRole('button', { name: /Start Mock Draft/i });
    expect(mockCreateMockDraft.mock.calls[0][0].variables).not.toHaveProperty(
      'rosterSize',
    );
  });

  it('forwards sport=football to createMockDraft and navigates to the football draft room', async () => {
    setUsage({ used: 0, limit: 2, remaining: 2, isUnlimited: false });
    mockStartSettings = {
      numTeams: 8,
      userPickPosition: 1,
      draftOrder: 'snake',
      playerPool: 'afc',
      sport: 'football',
    };
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Start Mock Draft/i }));

    await screen.findByRole('button', { name: /Start Mock Draft/i });
    expect(mockCreateMockDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          sport: 'football',
          playerPool: 'afc',
        }),
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/football/mock-draft/42');
  });
});

describe('MockDraftPage — draft mode threading (LS-9144, LS-10076)', () => {
  afterEach(() => jest.clearAllMocks());

  it('forwards mode=OFFLINE and omits pickTimeLimitSeconds when mode is offline', async () => {
    setUsage({ used: 0, limit: 2, remaining: 2, isUnlimited: false });
    mockStartSettings = {
      numTeams: 8,
      userPickPosition: 1,
      draftOrder: 'snake',
      playerPool: 'all',
      sport: 'baseball',
      mode: 'offline',
      isPublic: false,
    };
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Start Mock Draft/i }));

    await screen.findByRole('button', { name: /Start Mock Draft/i });
    expect(mockCreateMockDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          mode: 'OFFLINE',
          pickTimeLimitSeconds: undefined,
        }),
      }),
    );
  });

  it('forwards mode=ONLINE, the chosen pick timer and the lobby visibility when mode is shared', async () => {
    setUsage({ used: 0, limit: 2, remaining: 2, isUnlimited: false });
    mockStartSettings = {
      numTeams: 8,
      userPickPosition: 1,
      draftOrder: 'snake',
      playerPool: 'all',
      sport: 'baseball',
      mode: 'shared',
      isPublic: true,
      pickTimeLimitSeconds: 60,
    };
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Start Mock Draft/i }));

    await screen.findByRole('button', { name: /Start Mock Draft/i });
    expect(mockCreateMockDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          mode: 'ONLINE',
          // The setup form's Pick Timer choice is forwarded (LS-10466).
          pickTimeLimitSeconds: 60,
          // Shared lobbies carry the Private/Public choice through (LS-10076).
          isPublic: true,
        }),
      }),
    );
  });
});

describe('MockDraftPage — Shared-mode invite pause (LS-9181)', () => {
  afterEach(() => jest.clearAllMocks());

  it('shows the invite card instead of navigating when a Shared draft returns an inviteCode', async () => {
    setUsage({ used: 0, limit: 2, remaining: 2, isUnlimited: false });
    mockStartSettings = {
      numTeams: 8,
      userPickPosition: 1,
      draftOrder: 'snake',
      playerPool: 'all',
      sport: 'baseball',
      mode: 'shared',
    };
    mockCreateMockDraft.mockResolvedValueOnce({
      data: {
        createMockDraft: { draftId: 42, inviteCode: 'ABC12XYZ' },
      },
    });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Start Mock Draft/i }));

    expect(
      await screen.findByTestId('mock-draft-invite-card'),
    ).toBeInTheDocument();
    expect(screen.getByText('ABC12XYZ')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: /Continue to Draft Room/i }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/baseball/mock-draft/42');
  });

  it('navigates to the join-by-code screen when "Join instead" is pressed', () => {
    setUsage({ used: 0, limit: 2, remaining: 2, isUnlimited: false });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Join instead/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/baseball/mock-draft/join');
  });
});

describe('MockDraftPage — resume banner (LS-10465)', () => {
  afterEach(() => {
    mockActiveDrafts = [];
    jest.clearAllMocks();
  });

  const lobby = {
    draftId: 77,
    sport: 'football',
    status: 'not-started',
    mode: 'ONLINE',
    isHost: true,
    totalSeats: 8,
  };

  it('hides the banner when the user has no unfinished mock drafts', () => {
    setUsage({ used: 0, limit: 2, remaining: 2, isUnlimited: false });
    renderPage();
    expect(
      screen.queryByTestId('resume-mock-draft-banner'),
    ).not.toBeInTheDocument();
  });

  it('lists an unfinished draft on the setup screen and links to its room', () => {
    mockActiveDrafts = [lobby];
    setUsage({ used: 0, limit: 2, remaining: 2, isUnlimited: false });
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Resume 77' }));
    expect(mockNavigate).toHaveBeenCalledWith('/football/mock-draft/77');
  });

  it('still offers the resume link once the weekly cap is reached', () => {
    mockActiveDrafts = [lobby];
    setUsage({ used: 2, limit: 2, remaining: 0, isUnlimited: false });
    renderPage();

    expect(screen.getByTestId('mock-draft-limit-reached')).toBeInTheDocument();
    expect(screen.getByTestId('resume-mock-draft-banner')).toBeInTheDocument();
  });
});
