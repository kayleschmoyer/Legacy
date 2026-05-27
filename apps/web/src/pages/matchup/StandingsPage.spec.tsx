import React from 'react';
import { render, screen } from '@testing-library/react';
import type { ApolloError } from '@apollo/client';

import { StandingsPage } from './StandingsPage';
import { useStandings } from '../../hooks/useStandings';

jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn().mockReturnValue(jest.fn()),
  useParams: jest.fn().mockReturnValue({ leagueId: '1' }),
}));

jest.mock('../../hooks/useStandings');
const mockUseStandings = jest.mocked(useStandings);

jest.mock('@legacy-sports/shared-components', () => ({
  StandingsTable: () => <div data-testid="standings-table" />,
}));

const defaultReturn = {
  standings: [],
  loading: false,
  error: undefined,
  refetch: jest.fn(),
};

beforeEach(() => {
  mockUseStandings.mockReturnValue(defaultReturn);
});

describe('StandingsPage error rendering', () => {
  it('shows the error message when error has a string message', () => {
    const error = {
      message: 'Network request failed',
    } as unknown as ApolloError;
    mockUseStandings.mockReturnValue({ ...defaultReturn, error });
    render(<StandingsPage />);
    expect(screen.getByText('Network request failed')).toBeInTheDocument();
  });

  it('shows fallback text when error.message is undefined', () => {
    const error = { message: undefined } as unknown as ApolloError;
    mockUseStandings.mockReturnValue({ ...defaultReturn, error });
    render(<StandingsPage />);
    expect(
      screen.getByText('An unexpected error occurred'),
    ).toBeInTheDocument();
  });

  it('renders the standings table when data is loaded', () => {
    render(<StandingsPage />);
    expect(screen.getByTestId('standings-table')).toBeInTheDocument();
  });
});
