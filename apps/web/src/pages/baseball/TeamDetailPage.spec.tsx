/**
 * Unit tests for TeamDetailPage branding-clear confirmation dialog (LS-4063).
 *
 * Verifies that clicking "Clear" for team logo or banner opens a confirmation
 * dialog instead of immediately calling the API, and that the mutation is only
 * called after the user explicitly confirms.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any */
/* eslint-disable @typescript-eslint/no-unsafe-return -- mock factory spreads */
import React from 'react';
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

jest.mock('../../utils/analytics', () => ({
  trackTeamViewed: jest.fn(),
}));

jest.mock('../../lib/csrf', () => ({
  getCsrfToken: jest.fn(() => 'test-token'),
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

// ── GraphQL ───────────────────────────────────────────────────────────────────

const mockUpdateBranding = jest.fn();
const mockRefetchTeams = jest.fn();

jest.mock('../../api/db/graphql.generated', () => ({
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
  })),
  useGetTeamByIdQuery: jest.fn(() => ({
    data: { teamById: { id: 1, leagueId: 100 } },
    loading: false,
  })),
  useGetLeagueTeamsQuery: jest.fn(() => ({
    data: {
      leagueTeams: [
        {
          id: 1,
          name: 'Test Team',
          avatarUrl: 'https://example.com/logo.png',
          bannerUrl: 'https://example.com/banner.jpg',
        },
      ],
    },
    loading: false,
    error: undefined,
    refetch: mockRefetchTeams,
  })),
  useGetUserTeamIdQuery: jest.fn(() => ({
    data: { userTeamId: 1 },
    loading: false,
    error: undefined,
  })),
  useGetLeagueByIdQuery: jest.fn(() => ({
    data: {
      league: {
        id: 100,
        userMembership: { permissionLevel: 'general_manager' },
      },
    },
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
    Button: ({ children, onPress, disabled }: any) => (
      <button onClick={onPress} disabled={!!disabled}>
        {children}
      </button>
    ),
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
    Text: ({ children }: any) => <span>{children}</span>,
    XStack: ({ children }: any) => <div>{children}</div>,
    YStack: ({ children }: any) => <div>{children}</div>,
  };
});

jest.mock('@tamagui/lucide-icons', () => ({
  AlertCircle: () => null,
  Check: () => null,
  X: () => null,
}));

// ── Constants ─────────────────────────────────────────────────────────────────

jest.mock('../../constants/colors', () => ({
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
    mockRefetchTeams.mockResolvedValue({});
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
  });
});
