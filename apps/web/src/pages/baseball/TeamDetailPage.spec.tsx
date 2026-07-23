/**
 * Unit tests for TeamDetailPage branding-clear confirmation dialog (LS-4063).
 *
 * Verifies that clicking "Clear" for team logo or banner opens a confirmation
 * dialog instead of immediately calling the API, and that the mutation is only
 * called after the user explicitly confirms.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any */
/* eslint-disable @typescript-eslint/no-unsafe-return -- mock factory spreads */
import React, { forwardRef as mockForwardRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TeamDetailPage } from './TeamDetailPage';

// ── Router ──────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => ({ teamId: '1' }),
}));

// ── Analytics / CSRF ─────────────────────────────────────────────────────────

const mockTrackTeamViewed = jest.fn();
jest.mock('../../utils/analytics', () => ({
  trackTeamViewed: (...args: unknown[]) => mockTrackTeamViewed(...args),
}));

jest.mock('../../lib/csrf', () => ({
  getCsrfToken: jest.fn(() => 'test-token'),
}));

let mockIsPremium = false;
jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremium: () => mockIsPremium,
}));

jest.mock('../../config/environment', () => ({
  env: { imageUploadUrl: 'https://upload.example.com' },
}));

// ── Sub-components ────────────────────────────────────────────────────────────

jest.mock('../../components/PageMeta', () => ({
  PageMeta: () => null,
}));

jest.mock('../../features/baseball/TeamAssistantManagerSettings', () => ({
  TeamAssistantManagerSettings: () => (
    <div data-testid="assistant-manager-settings" />
  ),
}));

jest.mock('@legacy-sports/shared-components/roster', () => ({
  RosterBoard: ({
    readOnly,
    error,
    teamPlayers,
  }: {
    readOnly?: boolean;
    error?: Error | null;
    teamPlayers?: ReadonlyArray<{
      id?: number | null;
      isLocked?: boolean | null;
    }>;
  }) => (
    <div
      data-testid="roster-board"
      data-read-only={String(!!readOnly)}
      data-error={error ? error.message : ''}
      data-locked-ids={(teamPlayers ?? [])
        .filter((p) => p?.isLocked)
        .map((p) => p?.id)
        .join(',')}
    />
  ),
}));

// LS-6046: real (pure, side-effect-free) implementations — mocked per the
// established convention (Team.spec.tsx) since the package root also
// exports native-only components that jest can't resolve in this suite.
jest.mock('@legacy-sports/shared-components', () => ({
  Skeleton: () => <div data-testid="settings-skeleton" />,
  TEAM_BRANDING_PRESET_COLORS: [
    '#1B3A5C',
    '#C41E3A',
    '#2D6A4F',
    '#8B6F47',
    '#7C6CAE',
    '#C5A55A',
    '#0E7490',
    '#9F1239',
  ],
  normalizeTeamColor: (c: string | null | undefined, fallback: string) => {
    if (!c) return fallback;
    if (c.startsWith('#')) return c.toUpperCase();
    if (/^[0-9A-Fa-f]{6}$/.test(c)) return `#${c.toUpperCase()}`;
    return c;
  },
}));

// ── GraphQL ───────────────────────────────────────────────────────────────────

const mockUpdateBranding = jest.fn();
const mockRefetchTeamById = jest.fn();
const mockRefetchMembers = jest.fn();
const mockUpdateTeamMemberPosition = jest.fn();
const mockSwapTeamMemberPositions = jest.fn();

jest.mock('@legacy-sports/graphql', () => ({
  useGetTeamMembersQuery: jest.fn(() => ({
    data: {
      teamMembers: [
        {
          id: 10,
          leagueId: 100,
          player: { firstName: 'Test', lastName: 'Player' },
          positionId: null,
        },
      ],
    },
    loading: false,
    error: undefined,
    refetch: mockRefetchMembers,
  })),
  useUpdateTeamMemberPositionMutation: jest.fn(() => [
    mockUpdateTeamMemberPosition,
    { loading: false },
  ]),
  useSwapTeamMemberPositionsMutation: jest.fn(() => [
    mockSwapTeamMemberPositions,
    { loading: false },
  ]),
  useGetTeamByIdQuery: jest.fn(() => ({
    data: {
      team: {
        id: 1,
        leagueId: 100,
        name: 'Test Team',
        avatarUrl: 'https://example.com/logo.png',
        bannerUrl: 'https://example.com/banner.jpg',
        primaryColor: '#123ABC',
        secondaryColor: '#ABC123',
      },
    },
    loading: false,
    refetch: mockRefetchTeamById,
  })),
  useGetViewerMembershipQuery: jest.fn(() => ({
    data: {
      viewerMembership: { teamId: 1, permissionLevel: 'general_manager' },
    },
    loading: false,
    error: undefined,
  })),
  useGetLeagueNameQuery: jest.fn(() => ({
    data: { leagueName: 'Test League' },
    loading: false,
    error: undefined,
  })),
  useGetPositionsForLeagueQuery: jest.fn(() => ({
    data: { leaguePositions: [] },
    loading: false,
  })),
  useUpdateTeamBrandingMutation: jest.fn(() => [
    mockUpdateBranding,
    { loading: false },
  ]),
}));

// ── Tamagui ───────────────────────────────────────────────────────────────────

jest.mock('tamagui', () => {
  const Dialog = Object.assign(
    ({ children, open }: any) => {
      return open ? <div role="dialog">{children}</div> : null;
    },
    {
      Portal: ({ children }: any) => <div>{children}</div>,
      Overlay: () => null,
      Content: ({ children }: any) => <div>{children}</div>,
      Title: ({ children }: any) => <h2>{children}</h2>,
      Description: ({ children }: any) => <div>{children}</div>,
      Close: ({ children }: any) => <div>{children}</div>,
    },
  );

  return {
    Dialog,
    // Forwards ref so app code that restores focus to a trigger button
    // (LS-6049) can be exercised in tests.
    Button: mockForwardRef(({ children, onPress, disabled }: any, ref: any) => (
      <button ref={ref} onClick={onPress} disabled={!!disabled}>
        {children}
      </button>
    )),
    Input: ({ value, onChangeText, placeholder }: any) => (
      <input
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChangeText?.(e.target.value)}
      />
    ),
    H3: ({ children }: any) => <h3>{children}</h3>,
    Paragraph: ({ children }: any) => <p>{children}</p>,
    Separator: () => <hr />,
    Spinner: () => <span data-testid="spinner" />,
    Text: ({ children, role, 'aria-live': ariaLive }: any) => (
      <span role={role} aria-live={ariaLive}>
        {children}
      </span>
    ),
    XStack: ({ children, testID }: any) => (
      <div {...(testID ? { 'data-testid': testID } : {})}>{children}</div>
    ),
    YStack: ({ children, testID }: any) => (
      <div {...(testID ? { 'data-testid': testID } : {})}>{children}</div>
    ),
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  AlertCircle: () => null,
  Check: () => null,
  X: () => null,
}));

// ── Constants ─────────────────────────────────────────────────────────────────

jest.mock('../../constants/colors', () => ({
  BRAND_GOLD: '#C5A55A',
  BRAND_GOLD_LIGHT: '#C5A55A',
  BRAND_NAVY: '#0A0F1A',
  BRAND_NAVY_DARK: '#0D1526',
  BRAND_NAVY_LIGHT: '#1B3A5C',
  BRAND_SEAM_RED: '#C41E3A',
  withAlpha: (color: string) => color,
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TeamDetailPage – clear branding confirmation (LS-4063)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateBranding.mockResolvedValue({});
    mockRefetchTeamById.mockResolvedValue({});
    mockIsPremium = false;
  });

  // ── Logo ──────────────────────────────────────────────────────────────────

  describe('Clear logo', () => {
    it('opens a confirmation dialog without calling the mutation', () => {
      render(<TeamDetailPage />);

      // Both "Clear" buttons exist (logo + banner); the logo one comes first
      const clearButtons = screen.getAllByRole('button', { name: /^clear$/i });
      fireEvent.click(clearButtons[0]);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/clear team logo/i)).toBeInTheDocument();
      expect(mockUpdateBranding).not.toHaveBeenCalled();
    });

    it('closes the dialog without calling the mutation when Cancel is clicked', () => {
      render(<TeamDetailPage />);

      const clearButtons = screen.getAllByRole('button', { name: /^clear$/i });
      fireEvent.click(clearButtons[0]);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockUpdateBranding).not.toHaveBeenCalled();
    });

    it('calls updateTeamBranding with avatarUrl empty string when confirmed', async () => {
      render(<TeamDetailPage />);

      const clearButtons = screen.getAllByRole('button', { name: /^clear$/i });
      fireEvent.click(clearButtons[0]);

      fireEvent.click(screen.getByRole('button', { name: /^clear logo$/i }));

      await waitFor(() => {
        expect(mockUpdateBranding).toHaveBeenCalledWith({
          variables: { teamId: 1, leagueId: 100, avatarUrl: '' },
        });
      });
    });

    // LS-6049: focus must return to the trigger button, not stay trapped in
    // the (now-unmounted) dialog or fall back to the document body.
    it('returns focus to the Clear button when Cancel is clicked', () => {
      render(<TeamDetailPage />);

      const clearButtons = screen.getAllByRole('button', { name: /^clear$/i });
      fireEvent.click(clearButtons[0]);

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

      expect(clearButtons[0]).toHaveFocus();
    });

    it('returns focus to the Clear button when the clear is confirmed', async () => {
      render(<TeamDetailPage />);

      const clearButtons = screen.getAllByRole('button', { name: /^clear$/i });
      fireEvent.click(clearButtons[0]);

      fireEvent.click(screen.getByRole('button', { name: /^clear logo$/i }));

      await waitFor(() => {
        expect(mockUpdateBranding).toHaveBeenCalled();
      });
      expect(clearButtons[0]).toHaveFocus();
    });
  });

  // ── Banner ────────────────────────────────────────────────────────────────

  describe('Clear banner', () => {
    it('opens a confirmation dialog without calling the mutation', () => {
      render(<TeamDetailPage />);

      // Banner "Clear" button is second
      const clearButtons = screen.getAllByRole('button', { name: /^clear$/i });
      fireEvent.click(clearButtons[1]);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/clear team banner/i)).toBeInTheDocument();
      expect(mockUpdateBranding).not.toHaveBeenCalled();
    });

    it('closes the dialog without calling the mutation when Cancel is clicked', () => {
      render(<TeamDetailPage />);

      const clearButtons = screen.getAllByRole('button', { name: /^clear$/i });
      fireEvent.click(clearButtons[1]);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockUpdateBranding).not.toHaveBeenCalled();
    });

    it('calls updateTeamBranding with bannerUrl empty string when confirmed', async () => {
      render(<TeamDetailPage />);

      const clearButtons = screen.getAllByRole('button', { name: /^clear$/i });
      fireEvent.click(clearButtons[1]);

      fireEvent.click(screen.getByRole('button', { name: /^clear banner$/i }));

      await waitFor(() => {
        expect(mockUpdateBranding).toHaveBeenCalledWith({
          variables: { teamId: 1, leagueId: 100, bannerUrl: '' },
        });
      });
    });

    // LS-6049: same focus-restoration guarantee for the banner trigger.
    it('returns focus to the Clear button when Cancel is clicked', () => {
      render(<TeamDetailPage />);

      const clearButtons = screen.getAllByRole('button', { name: /^clear$/i });
      fireEvent.click(clearButtons[1]);

      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

      expect(clearButtons[1]).toHaveFocus();
    });

    it('returns focus to the Clear button when the clear is confirmed', async () => {
      render(<TeamDetailPage />);

      const clearButtons = screen.getAllByRole('button', { name: /^clear$/i });
      fireEvent.click(clearButtons[1]);

      fireEvent.click(screen.getByRole('button', { name: /^clear banner$/i }));

      await waitFor(() => {
        expect(mockUpdateBranding).toHaveBeenCalled();
      });
      expect(clearButtons[1]).toHaveFocus();
    });
  });
});

// ── Branding save toast accessibility (LS-6045) ────────────────────────────

describe('TeamDetailPage – branding save toast accessibility (LS-6045)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateBranding.mockResolvedValue({});
    mockRefetchTeamById.mockResolvedValue({});
  });

  it('announces a successful save via a role="status" aria-live="polite" region', async () => {
    render(<TeamDetailPage />);

    fireEvent.change(
      screen.getByPlaceholderText('https://example.com/my-logo.png'),
      { target: { value: 'https://example.com/new-logo.png' } },
    );
    fireEvent.click(screen.getByRole('button', { name: /^save branding$/i }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Branding saved!');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('announces a validation error via a role="alert" region', () => {
    render(<TeamDetailPage />);

    fireEvent.change(
      screen.getByPlaceholderText('https://example.com/my-logo.png'),
      { target: { value: 'not-a-url' } },
    );
    fireEvent.click(screen.getByRole('button', { name: /^save branding$/i }));

    // LS-6043: client validation now mirrors server semantics (new URL()
    // parse) instead of a loose regex, so a malformed (non-parseable) URL
    // gets a "must be a valid URL" reason rather than the old generic text.
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Avatar URL must be a valid URL');
    expect(mockUpdateBranding).not.toHaveBeenCalled();
  });
});

// ── Team Colors (LS-6046) ───────────────────────────────────────────────────

describe('TeamDetailPage – team colors (LS-6046)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateBranding.mockResolvedValue({});
    mockRefetchTeamById.mockResolvedValue({});
  });

  it('AC1: renders primary/secondary color pickers seeded from the team', () => {
    render(<TeamDetailPage />);

    expect(screen.getByText('Team Colors')).toBeInTheDocument();
    expect(screen.getByLabelText('Primary Color hex')).toHaveValue('#123ABC');
    expect(screen.getByLabelText('Secondary Color hex')).toHaveValue('#ABC123');
    expect(
      screen.getByLabelText('Primary Color color picker'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Secondary Color color picker'),
    ).toBeInTheDocument();
  });

  it('AC1: seeds from the shared preset defaults when the team has no saved colors', () => {
    const graphql = jest.requireMock<{ useGetTeamByIdQuery: jest.Mock }>(
      '@legacy-sports/graphql',
    );
    graphql.useGetTeamByIdQuery.mockReturnValueOnce({
      data: {
        team: {
          id: 1,
          leagueId: 100,
          name: 'Test Team',
          avatarUrl: 'https://example.com/logo.png',
          bannerUrl: 'https://example.com/banner.jpg',
          primaryColor: null,
          secondaryColor: null,
        },
      },
      loading: false,
      refetch: mockRefetchTeamById,
    });

    render(<TeamDetailPage />);

    expect(screen.getByLabelText('Primary Color hex')).toHaveValue('#1B3A5C');
    expect(screen.getByLabelText('Secondary Color hex')).toHaveValue('#C5A55A');
  });

  it('AC2: selecting a preset swatch and saving calls updateTeamBranding with the new color', async () => {
    render(<TeamDetailPage />);

    fireEvent.click(screen.getByLabelText('Pick primary color #C41E3A'));
    fireEvent.click(screen.getByRole('button', { name: /^save colors$/i }));

    await waitFor(() => {
      expect(mockUpdateBranding).toHaveBeenCalledWith({
        variables: {
          teamId: 1,
          leagueId: 100,
          primaryColor: '#C41E3A',
          secondaryColor: '#ABC123',
        },
      });
    });
  });

  it('AC2: typing a valid 6-digit hex and saving persists it', async () => {
    render(<TeamDetailPage />);

    fireEvent.change(screen.getByLabelText('Secondary Color hex'), {
      target: { value: '#00FF00' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save colors$/i }));

    await waitFor(() => {
      expect(mockUpdateBranding).toHaveBeenCalledWith({
        variables: {
          teamId: 1,
          leagueId: 100,
          primaryColor: '#123ABC',
          secondaryColor: '#00FF00',
        },
      });
    });
  });

  it('AC3: an invalid/incomplete hex value is not saved and shows a validation message', () => {
    render(<TeamDetailPage />);

    fireEvent.change(screen.getByLabelText('Primary Color hex'), {
      target: { value: '#12' },
    });

    expect(
      screen.getByText(/enter a valid 6-digit hex color/i),
    ).toBeInTheDocument();
    // The underlying color state never updated, so Save stays disabled.
    expect(
      screen.getByRole('button', { name: /^save colors$/i }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /^save colors$/i }));
    expect(mockUpdateBranding).not.toHaveBeenCalled();
  });

  it('AC4: the color pickers render for a GM with no premium gating', () => {
    render(<TeamDetailPage />);

    const colorsSection = screen.getByText('Team Colors').closest('div');
    expect(colorsSection).not.toBeNull();
    expect(screen.queryByText(/premium/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Primary Color hex')).toBeInTheDocument();
    expect(screen.getByLabelText('Secondary Color hex')).toBeInTheDocument();
  });
});

// ── Image upload CSRF token (LS-6040) ───────────────────────────────────────

describe('TeamDetailPage – image upload CSRF token (LS-6040)', () => {
  const { getCsrfToken } = jest.requireMock<{ getCsrfToken: jest.Mock }>(
    '../../lib/csrf',
  );

  const uploadFile = (container: HTMLElement) => {
    const fileInput = container.querySelector('input[type="file"]');
    if (!fileInput) throw new Error('avatar file input not found');
    const file = new File(['fake-image-bytes'], 'logo.png', {
      type: 'image/png',
    });
    fireEvent.change(fileInput, { target: { files: [file] } });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateBranding.mockResolvedValue({});
    mockRefetchTeamById.mockResolvedValue({});
    getCsrfToken.mockReturnValue('test-token');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ url: 'https://cdn.example.com/logo.png' }),
    });
  });

  it('always sends the X-CSRF-Token header when a token is available', async () => {
    const { container } = render(<TeamDetailPage />);

    uploadFile(container);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/images/upload'),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-CSRF-Token': 'test-token' }),
        }),
      );
    });
  });

  it('throws and never fires the upload request when no CSRF token is available', async () => {
    getCsrfToken.mockReturnValue('');
    const { container } = render(<TeamDetailPage />);

    uploadFile(container);

    await waitFor(() => {
      expect(
        screen.getByText(/unable to verify your session/i),
      ).toBeInTheDocument();
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockUpdateBranding).not.toHaveBeenCalled();
  });
});

// ── Save branding validation (LS-6043) ──────────────────────────────────────

describe('TeamDetailPage – save branding URL validation (LS-6043)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateBranding.mockResolvedValue({});
    mockRefetchTeamById.mockResolvedValue({});
  });

  it('blocks a URL with embedded credentials before calling the mutation, showing the specific reason', async () => {
    render(<TeamDetailPage />);

    fireEvent.change(
      screen.getByPlaceholderText('https://example.com/my-logo.png'),
      { target: { value: 'https://attacker.com:80@evil.com/path' } },
    );
    fireEvent.click(screen.getByRole('button', { name: /^save branding$/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Avatar URL must not contain credentials'),
      ).toBeInTheDocument();
    });
    expect(mockUpdateBranding).not.toHaveBeenCalled();
  });

  it('saves successfully for a valid HTTPS URL', async () => {
    render(<TeamDetailPage />);

    fireEvent.change(
      screen.getByPlaceholderText('https://example.com/my-logo.png'),
      { target: { value: 'https://example.com/my-logo.png' } },
    );
    fireEvent.click(screen.getByRole('button', { name: /^save branding$/i }));

    await waitFor(() => {
      expect(mockUpdateBranding).toHaveBeenCalledWith({
        variables: {
          teamId: 1,
          leagueId: 100,
          avatarUrl: 'https://example.com/my-logo.png',
        },
      });
    });
  });
});

// ── Lineup Editor (LS-5360) ────────────────────────────────────────────────

describe('TeamDetailPage – lineup editor (LS-5360)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateBranding.mockResolvedValue({});
    mockRefetchTeamById.mockResolvedValue({});
    mockRefetchMembers.mockResolvedValue({});
    mockUpdateTeamMemberPosition.mockResolvedValue({});
    mockSwapTeamMemberPositions.mockResolvedValue({});
  });

  it('renders the RosterBoard as editable for the team GM', () => {
    render(<TeamDetailPage />);

    const board = screen.getByTestId('roster-board');
    expect(board).toBeInTheDocument();
    expect(board).toHaveAttribute('data-read-only', 'false');
  });

  it('renders the RosterBoard as read-only for a visitor', () => {
    const graphql = jest.requireMock<{
      useGetViewerMembershipQuery: jest.Mock;
    }>('@legacy-sports/graphql');
    graphql.useGetViewerMembershipQuery.mockReturnValue({
      data: {
        viewerMembership: { teamId: 999, permissionLevel: 'general_manager' },
      },
      loading: false,
      error: undefined,
    });

    render(<TeamDetailPage />);

    const board = screen.getByTestId('roster-board');
    expect(board).toHaveAttribute('data-read-only', 'true');
  });

  it('passes the positions query error through to RosterBoard instead of silently hiding it (LS-6038)', () => {
    const graphql = jest.requireMock<{
      useGetPositionsForLeagueQuery: jest.Mock;
    }>('@legacy-sports/graphql');
    graphql.useGetPositionsForLeagueQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error('Failed to fetch league positions'),
    });

    render(<TeamDetailPage />);

    const board = screen.getByTestId('roster-board');
    expect(board).toHaveAttribute(
      'data-error',
      'Failed to fetch league positions',
    );
  });
});

// ── Premium badge (LS-6054) ──────────────────────────────────────────────────

describe('TeamDetailPage – Premium badge (LS-6054)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateBranding.mockResolvedValue({});
    mockRefetchTeamById.mockResolvedValue({});
    mockIsPremium = false;

    // A prior describe block may have overridden this mock's return value
    // (jest.clearAllMocks() clears calls but not mockReturnValue overrides).
    const graphql = jest.requireMock<{
      useGetViewerMembershipQuery: jest.Mock;
    }>('@legacy-sports/graphql');
    graphql.useGetViewerMembershipQuery.mockReturnValue({
      data: {
        viewerMembership: { teamId: 1, permissionLevel: 'general_manager' },
      },
      loading: false,
      error: undefined,
    });
  });

  it('shows a Premium badge for a premium GM viewing their own team', () => {
    mockIsPremium = true;

    render(<TeamDetailPage />);

    expect(screen.getByTestId('team-premium-badge')).toBeInTheDocument();
    expect(screen.getByText('Premium')).toBeInTheDocument();
  });

  it('hides the Premium badge for a non-premium GM', () => {
    mockIsPremium = false;

    render(<TeamDetailPage />);

    expect(screen.queryByTestId('team-premium-badge')).not.toBeInTheDocument();
  });

  it("hides the Premium badge for a premium visitor viewing another GM's team", () => {
    mockIsPremium = true;
    const graphql = jest.requireMock<{
      useGetViewerMembershipQuery: jest.Mock;
    }>('@legacy-sports/graphql');
    graphql.useGetViewerMembershipQuery.mockReturnValue({
      data: {
        viewerMembership: { teamId: 999, permissionLevel: 'general_manager' },
      },
      loading: false,
      error: undefined,
    });

    render(<TeamDetailPage />);

    expect(screen.queryByTestId('team-premium-badge')).not.toBeInTheDocument();
  });
});

// ── Decoupled loading states (LS-6048) ─────────────────────────────────────

describe('TeamDetailPage – decoupled loading states (LS-6048)', () => {
  // `mockReturnValue` overrides persist across tests/describes (clearAllMocks
  // only clears call history, not implementations) — re-assert every hook's
  // resolved-state default here so this suite is isolated from ordering.
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateBranding.mockResolvedValue({});
    mockRefetchTeamById.mockResolvedValue({});
    mockRefetchMembers.mockResolvedValue({});

    const graphql = jest.requireMock<Record<string, jest.Mock>>(
      '@legacy-sports/graphql',
    );
    graphql.useGetTeamMembersQuery.mockReturnValue({
      data: {
        teamMembers: [
          {
            id: 10,
            leagueId: 100,
            player: { firstName: 'Test', lastName: 'Player' },
            positionId: null,
          },
        ],
      },
      loading: false,
      error: undefined,
      refetch: mockRefetchMembers,
    });
    graphql.useGetTeamByIdQuery.mockReturnValue({
      data: {
        team: {
          id: 1,
          leagueId: 100,
          name: 'Test Team',
          avatarUrl: 'https://example.com/logo.png',
          bannerUrl: 'https://example.com/banner.jpg',
        },
      },
      loading: false,
      refetch: mockRefetchTeamById,
    });
    graphql.useGetViewerMembershipQuery.mockReturnValue({
      data: {
        viewerMembership: { teamId: 1, permissionLevel: 'general_manager' },
      },
      loading: false,
      error: undefined,
    });
    graphql.useGetPositionsForLeagueQuery.mockReturnValue({
      data: { leaguePositions: [] },
      loading: false,
    });
  });

  it('renders team identity and roster while the permission query is still loading, instead of a full-page spinner', () => {
    const graphql = jest.requireMock<{
      useGetViewerMembershipQuery: jest.Mock;
    }>('@legacy-sports/graphql');
    graphql.useGetViewerMembershipQuery.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
    });

    render(<TeamDetailPage />);

    // Identity + roster render even though permission data hasn't resolved.
    expect(screen.getByTestId('roster-board')).toBeInTheDocument();
    expect(screen.getByText('Test Team')).toBeInTheDocument();
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();

    // The GM/Commissioner settings section (which depends on permission
    // data) does not render yet — it's replaced by an inline skeleton.
    expect(
      screen.queryByTestId('assistant-manager-settings'),
    ).not.toBeInTheDocument();
    expect(screen.getAllByTestId('settings-skeleton').length).toBeGreaterThan(
      0,
    );
  });

  it('renders the full-page spinner while identity-blocking queries (e.g. team members) are loading', () => {
    const graphql = jest.requireMock<{ useGetTeamMembersQuery: jest.Mock }>(
      '@legacy-sports/graphql',
    );
    graphql.useGetTeamMembersQuery.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
      refetch: mockRefetchMembers,
    });

    render(<TeamDetailPage />);

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.queryByTestId('roster-board')).not.toBeInTheDocument();
  });

  it('renders GM settings once permission data resolves', () => {
    render(<TeamDetailPage />);

    expect(
      screen.getByTestId('assistant-manager-settings'),
    ).toBeInTheDocument();
  });

  it('renders commissioner settings as soon as permission data resolves', () => {
    const graphql = jest.requireMock<{
      useGetViewerMembershipQuery: jest.Mock;
    }>('@legacy-sports/graphql');
    graphql.useGetViewerMembershipQuery.mockReturnValue({
      data: {
        viewerMembership: { teamId: null, permissionLevel: 'commissioner' },
      },
      loading: false,
      error: undefined,
    });

    render(<TeamDetailPage />);

    expect(
      screen.getByTestId('assistant-manager-settings'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('settings-skeleton')).not.toBeInTheDocument();
  });
});

// ── Analytics tracking (LS-7686 / LS-8581) ───────────────────────────────────

describe('TeamDetailPage – analytics tracking (LS-7686)', () => {
  const graphql = jest.requireMock<{
    useGetTeamMembersQuery: jest.Mock;
    useGetTeamByIdQuery: jest.Mock;
  }>('@legacy-sports/graphql');

  const teamMembersWithLeagueId = (leagueId: number | null) => ({
    data: {
      teamMembers: [
        {
          id: 10,
          leagueId,
          player: { firstName: 'Test', lastName: 'Player' },
          positionId: null,
        },
      ],
    },
    loading: false,
    error: undefined,
    refetch: mockRefetchMembers,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateBranding.mockResolvedValue({});
    mockRefetchTeamById.mockResolvedValue({});
    graphql.useGetTeamMembersQuery.mockReturnValue(
      teamMembersWithLeagueId(100),
    );
  });

  it('calls trackTeamViewed with the resolved teamId and leagueId once both are available', () => {
    render(<TeamDetailPage />);

    expect(mockTrackTeamViewed).toHaveBeenCalledTimes(1);
    expect(mockTrackTeamViewed).toHaveBeenCalledWith(1, 100);
  });

  it('does not call trackTeamViewed before leagueId resolves', () => {
    graphql.useGetTeamMembersQuery.mockReturnValue(
      teamMembersWithLeagueId(null),
    );
    // teamById's leagueId fallback must also be unresolved — otherwise it
    // supplies leagueId regardless of the members-side value.
    graphql.useGetTeamByIdQuery.mockReturnValue({
      data: { team: { id: 1, leagueId: null } },
      loading: false,
      refetch: mockRefetchTeamById,
    });

    render(<TeamDetailPage />);

    expect(mockTrackTeamViewed).not.toHaveBeenCalled();
  });

  it('fires again when leagueId changes between renders for the same team — documents that no dedupe ref exists today (unlike MatchupDetailPage)', () => {
    const { rerender } = render(<TeamDetailPage />);
    expect(mockTrackTeamViewed).toHaveBeenCalledTimes(1);
    expect(mockTrackTeamViewed).toHaveBeenLastCalledWith(1, 100);

    // Simulates the leagueId source transition the ticket describes
    // (membersData vs. teamById resolving to different values at different
    // times). TeamDetailPage has no lastTrackedTeamViewKeyRef-style guard, so
    // this fires a second time — this is documenting current behavior, not
    // asserting it as desired.
    graphql.useGetTeamMembersQuery.mockReturnValue(
      teamMembersWithLeagueId(200),
    );
    rerender(<TeamDetailPage />);

    expect(mockTrackTeamViewed).toHaveBeenCalledTimes(2);
    expect(mockTrackTeamViewed).toHaveBeenLastCalledWith(1, 200);
  });

  it('does not fire again on a re-render with an unchanged teamId/leagueId (React dependency-array diffing, not an explicit dedupe ref)', () => {
    const { rerender } = render(<TeamDetailPage />);
    expect(mockTrackTeamViewed).toHaveBeenCalledTimes(1);

    rerender(<TeamDetailPage />);

    expect(mockTrackTeamViewed).toHaveBeenCalledTimes(1);
  });
});

// ── League link, not raw ID (LS-6052) ──────────────────────────────────────

describe('TeamDetailPage – league identity link (LS-6052)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateBranding.mockResolvedValue({});
    mockRefetchTeamById.mockResolvedValue({});
    mockRefetchMembers.mockResolvedValue({});
  });

  it('never renders the raw league ID as text', () => {
    render(<TeamDetailPage />);

    expect(screen.queryByText(/league id/i)).not.toBeInTheDocument();
  });

  it('renders "Part of <League Name>" and navigates to the league detail page on click', () => {
    const graphql = jest.requireMock<{ useGetLeagueNameQuery: jest.Mock }>(
      '@legacy-sports/graphql',
    );
    graphql.useGetLeagueNameQuery.mockReturnValue({
      data: { leagueName: 'The Dynasty League' },
      loading: false,
      error: undefined,
    });

    render(<TeamDetailPage />);

    const link = screen.getByRole('button', {
      name: /part of the dynasty league/i,
    });
    expect(link).toBeInTheDocument();
    expect(screen.queryByText(/league id/i)).not.toBeInTheDocument();

    fireEvent.click(link);
    expect(mockNavigate).toHaveBeenCalledWith('/baseball/league/100');
  });
});

// ── Lineup Editor Lock-Window Enforcement (LS-6035) ─────────────────────────
//
// TeamMember.isLocked (lib/graphql/src/teamMember.fragment.graphql) is the
// signal RosterBoard uses to block edits to a player whose game has started
// (see RosterBoard.spec.tsx for the enforcement behavior itself). Nothing
// previously verified that TeamDetailPage forwards that flag unchanged from
// the team-members query into RosterBoard's teamPlayers prop.

describe('TeamDetailPage – lineup editor lock-window enforcement (LS-6035)', () => {
  const mockTeamMembers = (
    members: ReadonlyArray<{
      id: number;
      positionId: number | null;
      isLocked?: boolean;
    }>,
  ) => {
    const graphql = jest.requireMock<{ useGetTeamMembersQuery: jest.Mock }>(
      '@legacy-sports/graphql',
    );
    graphql.useGetTeamMembersQuery.mockReturnValue({
      data: {
        teamMembers: members.map((m) => ({
          leagueId: 100,
          player: { firstName: 'Test', lastName: 'Player' },
          ...m,
        })),
      },
      loading: false,
      error: undefined,
      refetch: mockRefetchMembers,
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateBranding.mockResolvedValue({});
    mockRefetchTeamById.mockResolvedValue({});
    mockRefetchMembers.mockResolvedValue({});
    mockUpdateTeamMemberPosition.mockResolvedValue({});
    mockSwapTeamMemberPositions.mockResolvedValue({});

    // Reset to the GM baseline regardless of mock state left behind by
    // preceding describe blocks (e.g. the visitor/premium/loading overrides
    // above).
    const graphql = jest.requireMock<{
      useGetViewerMembershipQuery: jest.Mock;
    }>('@legacy-sports/graphql');
    graphql.useGetViewerMembershipQuery.mockReturnValue({
      data: {
        viewerMembership: { teamId: 1, permissionLevel: 'general_manager' },
      },
      loading: false,
      error: undefined,
    });
  });

  it('forwards a locked team member to RosterBoard with isLocked: true', () => {
    mockTeamMembers([
      { id: 10, positionId: 1, isLocked: true },
      { id: 11, positionId: null, isLocked: false },
    ]);

    render(<TeamDetailPage />);

    expect(screen.getByTestId('roster-board')).toHaveAttribute(
      'data-locked-ids',
      '10',
    );
  });

  it('does not mark an unlocked team member as locked', () => {
    mockTeamMembers([
      { id: 10, positionId: 1, isLocked: false },
      { id: 11, positionId: null, isLocked: false },
    ]);

    render(<TeamDetailPage />);

    expect(screen.getByTestId('roster-board')).toHaveAttribute(
      'data-locked-ids',
      '',
    );
  });

  it('preserves per-player lock state independent of the read-only (visitor) gate', () => {
    mockTeamMembers([{ id: 10, positionId: 1, isLocked: true }]);
    const graphql = jest.requireMock<{
      useGetViewerMembershipQuery: jest.Mock;
    }>('@legacy-sports/graphql');
    graphql.useGetViewerMembershipQuery.mockReturnValue({
      data: {
        viewerMembership: { teamId: 999, permissionLevel: 'general_manager' },
      },
      loading: false,
      error: undefined,
    });

    render(<TeamDetailPage />);

    const board = screen.getByTestId('roster-board');
    expect(board).toHaveAttribute('data-read-only', 'true');
    expect(board).toHaveAttribute('data-locked-ids', '10');
  });
});

// ── Assistant manager UX matches backend permission (LS-6051 / BTD-028) ────

describe('TeamDetailPage – assistant manager permissions (LS-6051)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateBranding.mockResolvedValue({});
    mockRefetchTeamById.mockResolvedValue({});
    mockRefetchMembers.mockResolvedValue({});
    mockUpdateTeamMemberPosition.mockResolvedValue({});
    mockSwapTeamMemberPositions.mockResolvedValue({});

    // `mockReturnValue` persists across tests (clearAllMocks resets calls,
    // not implementations) — reset to the default GM membership so each
    // test's role is explicit rather than inherited from a prior test.
    const graphql = jest.requireMock<{
      useGetViewerMembershipQuery: jest.Mock;
    }>('@legacy-sports/graphql');
    graphql.useGetViewerMembershipQuery.mockReturnValue({
      data: {
        viewerMembership: { teamId: 1, permissionLevel: 'general_manager' },
      },
      loading: false,
      error: undefined,
    });
  });

  function mockAsAssistantManager() {
    const graphql = jest.requireMock<{
      useGetViewerMembershipQuery: jest.Mock;
    }>('@legacy-sports/graphql');
    graphql.useGetViewerMembershipQuery.mockReturnValue({
      data: {
        viewerMembership: {
          teamId: 1,
          permissionLevel: 'assistant_manager',
        },
      },
      loading: false,
      error: undefined,
    });
  }

  it('does not show the visitor note for an assistant_manager of this team', () => {
    mockAsAssistantManager();

    render(<TeamDetailPage />);

    expect(
      screen.queryByText(/viewing this team as a visitor/i),
    ).not.toBeInTheDocument();
  });

  it('renders the RosterBoard as editable for an assistant_manager of this team', () => {
    mockAsAssistantManager();

    render(<TeamDetailPage />);

    const board = screen.getByTestId('roster-board');
    expect(board).toHaveAttribute('data-read-only', 'false');
  });

  it('shows Team Settings (branding) for an assistant_manager of this team', () => {
    mockAsAssistantManager();

    render(<TeamDetailPage />);

    expect(screen.getByText('Team Settings')).toBeInTheDocument();
  });

  it('hides Assistant Manager Settings (invite/remove) for an assistant_manager', () => {
    mockAsAssistantManager();

    render(<TeamDetailPage />);

    expect(
      screen.queryByTestId('assistant-manager-settings'),
    ).not.toBeInTheDocument();
  });

  it('still shows the visitor note for an assistant_manager of a different team', () => {
    const graphql = jest.requireMock<{
      useGetViewerMembershipQuery: jest.Mock;
    }>('@legacy-sports/graphql');
    graphql.useGetViewerMembershipQuery.mockReturnValue({
      data: {
        viewerMembership: {
          teamId: 999,
          permissionLevel: 'assistant_manager',
        },
      },
      loading: false,
      error: undefined,
    });

    render(<TeamDetailPage />);

    expect(
      screen.getByText(/viewing this team as a visitor/i),
    ).toBeInTheDocument();
  });
});
