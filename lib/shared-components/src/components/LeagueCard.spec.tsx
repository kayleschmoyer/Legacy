import React from 'react';
import { type League, LeagueCard } from './LeagueCard';
import { render } from '../test-utils';

const baseLeague: League = {
  id: 7,
  name: 'Dead Ball Dynasty',
  maxRosterSize: 25,
  currentWeekNumber: 14,
  draftStatus: 'completed',
};

describe('LeagueCard', () => {
  it('renders the league name', () => {
    const { getByText } = render(<LeagueCard league={baseLeague} />);
    expect(getByText('Dead Ball Dynasty')).toBeTruthy();
  });

  it('falls back to "Unnamed League" when name is missing', () => {
    const { getAllByText } = render(<LeagueCard league={{ id: 1 }} />);
    expect(getAllByText('Unnamed League').length).toBeGreaterThan(0);
  });

  it('renders the roster/week summary', () => {
    const { getByText } = render(<LeagueCard league={baseLeague} />);
    expect(getByText('25-slot rosters • Week 14')).toBeTruthy();
  });

  it('renders the metric labels', () => {
    const { getByText } = render(<LeagueCard league={baseLeague} />);
    expect(getByText('Matchup')).toBeTruthy();
    expect(getByText('Roster Limit')).toBeTruthy();
    expect(getByText('Draft Status')).toBeTruthy();
  });

  it('renders the formatted draft status', () => {
    const { getAllByText } = render(<LeagueCard league={baseLeague} />);
    // Appears in both the status badge and the Draft Status metric value.
    expect(getAllByText('Completed').length).toBeGreaterThanOrEqual(2);
  });

  it('renders the View League action', () => {
    const { getByText } = render(<LeagueCard league={baseLeague} />);
    expect(getByText('View League')).toBeTruthy();
  });

  it('renders a preseason matchup metric when no current week is set', () => {
    const { getByText } = render(
      <LeagueCard league={{ id: 2, name: 'Preseason Club' }} />,
    );
    expect(getByText('Preseason Slate')).toBeTruthy();
  });
});
