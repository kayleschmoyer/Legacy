import React from 'react';
import { render } from '@testing-library/react';
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

jest.mock('../../components/PageMeta', () => ({
  PageMeta: () => null,
}));

jest.mock('../../components/PremiumGate', () => ({
  PremiumGate: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('../../components/PlayerDetailModal', () => ({
  PlayerDetailModal: () => null,
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
