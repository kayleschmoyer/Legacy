import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AnalyticsPage from './AnalyticsPage';

const mockAnalyticsScreen = jest.fn(({ leagueId }: { leagueId: number }) => (
  <div>Analytics Screen {leagueId}</div>
));

jest.mock('@legacy-sports/shared-components/analytics', () => ({
  AnalyticsScreen: (props: { leagueId: number }) => mockAnalyticsScreen(props),
}));

jest.mock('../../components/PageMeta', () => ({
  PageMeta: () => null,
}));

describe('AnalyticsPage', () => {
  beforeEach(() => {
    mockAnalyticsScreen.mockClear();
  });

  it('renders the shared analytics screen with the route league id', () => {
    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/leagues/42/analytics']}
      >
        <Routes>
          <Route
            path="/leagues/:leagueId/analytics"
            element={<AnalyticsPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Analytics Screen 42')).toBeInTheDocument();
    expect(mockAnalyticsScreen).toHaveBeenCalledTimes(1);
    expect(mockAnalyticsScreen).toHaveBeenCalledWith({ leagueId: 42 });
  });

  it('redirects invalid league ids back to the leagues page', () => {
    render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={['/leagues/not-a-number/analytics']}
      >
        <Routes>
          <Route
            path="/leagues/:leagueId/analytics"
            element={<AnalyticsPage />}
          />
          <Route
            path="/baseball/leagues"
            element={<div>League Discovery</div>}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('League Discovery')).toBeInTheDocument();
    expect(mockAnalyticsScreen).not.toHaveBeenCalled();
  });
});
