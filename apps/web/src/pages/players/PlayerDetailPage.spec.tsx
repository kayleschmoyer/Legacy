import React from 'react';
import { render, screen } from '@testing-library/react';
import { PlayerDetailPage } from './PlayerStatsPage';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockUseParams = jest.fn(() => ({ id: '123' }));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ key: 'default' }),
  useParams: () => mockUseParams(),
}));

const mockWarn = jest.fn();
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: (...args: unknown[]) => {
      mockWarn(...args);
    },
    error: jest.fn(),
  },
}));

jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremium: () => false,
  useHasEntitlement: () => false,
}));

let mockIsAuthenticated = true;
let mockAuthLoading = false;
jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    isLoading: mockAuthLoading,
  }),
}));

const mockStoreCameFrom = jest.fn<void, []>();
jest.mock('../../lib/came-from', () => ({
  storeCameFrom: () => mockStoreCameFrom(),
}));

jest.mock('../../components/PageMeta', () => ({
  PageMeta: () => null,
}));

jest.mock('../../components/PlayerDetailModal', () => ({
  PlayerDetailModal: ({ playerId }: { playerId: number }) => (
    <div data-testid="player-detail-modal" data-player-id={String(playerId)} />
  ),
}));

jest.mock('@legacy-sports/graphql', () => ({
  useGetPlayerIdByBrefIdQuery: () => ({
    data: undefined,
    loading: false,
    error: undefined,
  }),
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PlayerDetailPage — invalid numeric ID telemetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('emits LOGGER.warn when numeric ID exceeds MAX_GRAPHQL_INT', () => {
    mockUseParams.mockReturnValue({ id: '9999999999' });
    render(<PlayerDetailPage />);
    expect(mockWarn).toHaveBeenCalledWith('[PlayerDetailPage] invalid id', {
      identifier: '9999999999',
    });
  });

  it('emits LOGGER.warn when numeric ID is zero', () => {
    mockUseParams.mockReturnValue({ id: '0' });
    render(<PlayerDetailPage />);
    expect(mockWarn).toHaveBeenCalledWith('[PlayerDetailPage] invalid id', {
      identifier: '0',
    });
  });

  it('does not emit LOGGER.warn for a valid numeric ID', () => {
    mockUseParams.mockReturnValue({ id: '42' });
    render(<PlayerDetailPage />);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('does not emit LOGGER.warn for a bref ID (non-numeric)', () => {
    mockUseParams.mockReturnValue({ id: 'troutmi01' });
    render(<PlayerDetailPage />);
    expect(mockWarn).not.toHaveBeenCalled();
  });
});

// LS-10546: career stats on /players/:id are open to every signed-in viewer,
// matching /football/players/:id. The `useHasEntitlement` mock above returns
// false, so this pins the free view: the real detail surface, no PremiumGate
// placeholder. Signed-out visitors are sent to sign in (login-only, LS-6248).
describe('PlayerDetailPage — free and signed-out viewers (LS-10546)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAuthenticated = true;
    mockAuthLoading = false;
  });

  it('renders the career-stats detail modal for a signed-in free viewer', () => {
    mockUseParams.mockReturnValue({ id: '42' });
    render(<PlayerDetailPage />);
    expect(screen.getByTestId('player-detail-modal')).toHaveAttribute(
      'data-player-id',
      '42',
    );
    expect(screen.queryByText('Player Career Stats')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('redirects a signed-out visitor to /login without mounting the modal', () => {
    mockUseParams.mockReturnValue({ id: '42' });
    mockIsAuthenticated = false;
    render(<PlayerDetailPage />);
    expect(screen.queryByTestId('player-detail-modal')).not.toBeInTheDocument();
    expect(mockStoreCameFrom).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('waits for auth to resolve before redirecting', () => {
    mockUseParams.mockReturnValue({ id: '42' });
    mockIsAuthenticated = false;
    mockAuthLoading = true;
    render(<PlayerDetailPage />);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
