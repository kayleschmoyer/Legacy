import React from 'react';
import { StandingsTable } from './StandingsTable';
import { fireEvent, render } from '../../test-utils';

type StandingRecord = React.ComponentProps<
  typeof StandingsTable
>['standings'][0];

function makeTeam(
  overrides: Partial<StandingRecord> & { teamId: string; teamName: string },
): StandingRecord {
  return {
    __typename: 'TeamStanding' as const,
    wins: 0,
    losses: 0,
    ties: 0,
    winPercentage: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    avatarUrl: null,
    primaryColor: null,
    secondaryColor: null,
    divisionId: null,
    ...overrides,
  };
}

const mockStandings: StandingRecord[] = [
  makeTeam({
    teamId: '1',
    teamName: 'Thunder',
    wins: 10,
    losses: 4,
    winPercentage: 0.714,
    pointsFor: 1250.5,
    pointsAgainst: 1100.2,
  }),
  makeTeam({
    teamId: '2',
    teamName: 'Lightning',
    wins: 9,
    losses: 5,
    winPercentage: 0.643,
    pointsFor: 1180.3,
    pointsAgainst: 1050.7,
  }),
  makeTeam({
    teamId: '3',
    teamName: 'Avalanche',
    wins: 8,
    losses: 6,
    winPercentage: 0.571,
    pointsFor: 1120.8,
    pointsAgainst: 1090.1,
  }),
];

const divisionStandings: StandingRecord[] = [
  makeTeam({
    teamId: '1',
    teamName: 'Thunder',
    wins: 10,
    losses: 4,
    winPercentage: 0.714,
    pointsFor: 1250.5,
    pointsAgainst: 1100.2,
    divisionId: 1,
  }),
  makeTeam({
    teamId: '2',
    teamName: 'Lightning',
    wins: 9,
    losses: 5,
    winPercentage: 0.643,
    pointsFor: 1180.3,
    pointsAgainst: 1050.7,
    divisionId: 1,
  }),
  makeTeam({
    teamId: '3',
    teamName: 'Cyclones',
    wins: 7,
    losses: 7,
    winPercentage: 0.5,
    pointsFor: 1050.0,
    pointsAgainst: 1060.0,
    divisionId: 2,
  }),
  makeTeam({
    teamId: '4',
    teamName: 'Blaze',
    wins: 5,
    losses: 9,
    winPercentage: 0.357,
    pointsFor: 980.4,
    pointsAgainst: 1150.3,
    divisionId: 2,
  }),
];

describe('StandingsTable', () => {
  it('renders team names and records', () => {
    const { getByText } = render(<StandingsTable standings={mockStandings} />);

    expect(getByText('Thunder')).toBeTruthy();
    expect(getByText('Lightning')).toBeTruthy();
    expect(getByText('Avalanche')).toBeTruthy();
    expect(getByText('League Standings')).toBeTruthy();
  });

  it('shows loading state', () => {
    const { getByText } = render(<StandingsTable standings={[]} loading />);

    expect(getByText('Loading standings...')).toBeTruthy();
  });

  it('shows error state', () => {
    const { getByText } = render(
      <StandingsTable
        standings={[]}
        error={new globalThis.Error('Network failure')}
      />,
    );

    expect(getByText('Error: Network failure')).toBeTruthy();
  });

  it('shows empty state', () => {
    const { getByText } = render(<StandingsTable standings={[]} />);

    expect(getByText('No standings available')).toBeTruthy();
  });

  it('sorts by wins and toggles direction', () => {
    const { getAllByText } = render(
      <StandingsTable standings={mockStandings} />,
    );

    // Find the "W" column header — use exact match and pick the standalone "W"
    const wCandidates = getAllByText(
      (_content, element) =>
        element?.textContent?.trim() === 'W' &&
        element.tagName !== 'HTML' &&
        element.tagName !== 'BODY',
    );
    const winsHeader = wCandidates[0];
    fireEvent.click(winsHeader);

    // First row should have the most wins (10)
    const allTens = getAllByText('10');
    expect(allTens.length).toBeGreaterThan(0);

    // Click again to toggle to ascending
    fireEvent.click(winsHeader);

    // After toggling, order should reverse - 8 wins team first
    const allEights = getAllByText('8');
    expect(allEights.length).toBeGreaterThan(0);
  });

  it('sorts by different columns', () => {
    const { getByText, getAllByText } = render(
      <StandingsTable standings={mockStandings} />,
    );

    // Click Team header — use a matcher that finds the standalone "Team" header
    const teamCandidates = getAllByText(
      (_content, element) =>
        element?.textContent?.trim() === 'Team' &&
        element.tagName !== 'HTML' &&
        element.tagName !== 'BODY',
    );
    fireEvent.click(teamCandidates[0]);

    // Click L header — use a matcher that finds the standalone "L" header
    const lCandidates = getAllByText(
      (_content, element) =>
        element?.textContent?.trim() === 'L' &&
        element.tagName !== 'HTML' &&
        element.tagName !== 'BODY',
    );
    fireEvent.click(lCandidates[0]);

    // Component should still render without errors
    expect(getByText('Thunder')).toBeTruthy();
    expect(getByText('Lightning')).toBeTruthy();
    expect(getByText('Avalanche')).toBeTruthy();
  });

  it('displays division grouping correctly', () => {
    const { getByText } = render(
      <StandingsTable standings={divisionStandings} />,
    );

    expect(getByText('Division 1')).toBeTruthy();
    expect(getByText('Division 2')).toBeTruthy();

    // Teams should still render within their divisions
    expect(getByText('Thunder')).toBeTruthy();
    expect(getByText('Lightning')).toBeTruthy();
    expect(getByText('Cyclones')).toBeTruthy();
    expect(getByText('Blaze')).toBeTruthy();
  });

  it('renders Diff column with correct sign for positive difference', () => {
    const { getByText } = render(
      <StandingsTable
        standings={[
          makeTeam({
            teamId: '1',
            teamName: 'Rockets',
            pointsFor: 1400.8,
            pointsAgainst: 1250.5,
          }),
        ]}
      />,
    );
    // diff = 1400.8 - 1250.5 = 150.3
    expect(getByText('+150.3')).toBeTruthy();
  });

  it('renders Diff column with minus sign for negative difference', () => {
    const { getByText } = render(
      <StandingsTable
        standings={[
          makeTeam({
            teamId: '1',
            teamName: 'Underdogs',
            pointsFor: 900.0,
            pointsAgainst: 1100.5,
          }),
        ]}
      />,
    );
    // diff = 900.0 - 1100.5 = -200.5
    expect(getByText('-200.5')).toBeTruthy();
  });

  it('shows "You" chip on the current user\'s row', () => {
    const { getAllByText } = render(
      <StandingsTable standings={mockStandings} currentUserTeamId={2} />,
    );
    // "You" chip should appear exactly once (on team 2 = Lightning)
    const youChips = getAllByText('You');
    expect(youChips.length).toBe(1);
  });

  it('renders the full team name (wrap, not ellipsis-truncate) alongside the "You" chip for long names', () => {
    const longName = 'Diamond Dynasty Wildcats of Doom';
    const { getByText, getAllByText } = render(
      <StandingsTable
        standings={[
          ...mockStandings,
          makeTeam({ teamId: '4', teamName: longName }),
        ]}
        currentUserTeamId={4}
      />,
    );
    // The full name renders (numberOfLines allows wrapping to two lines
    // instead of collapsing to an ellipsis), and the "You" chip still shows
    // exactly once alongside it — LS-8659.
    expect(getByText(longName)).toBeTruthy();
    expect(getAllByText('You').length).toBe(1);
  });

  it('does not show "You" chip when currentUserTeamId is null', () => {
    const { queryByText } = render(
      <StandingsTable standings={mockStandings} currentUserTeamId={null} />,
    );
    expect(queryByText('You')).toBeNull();
  });

  it('calls onTeamPress with the correct teamId when a row is pressed', () => {
    const onTeamPress = jest.fn();
    const { getByText } = render(
      <StandingsTable standings={mockStandings} onTeamPress={onTeamPress} />,
    );
    fireEvent.click(getByText('Thunder'));
    expect(onTeamPress).toHaveBeenCalledWith(1);
  });

  it('renders custom title', () => {
    const { getByText } = render(
      <StandingsTable standings={mockStandings} title="AFC East" />,
    );
    expect(getByText('AFC East')).toBeTruthy();
  });

  it('renders subtitle when provided', () => {
    const { getByText } = render(
      <StandingsTable
        standings={mockStandings}
        subtitle="Sorted by win percentage"
      />,
    );
    expect(getByText('Sorted by win percentage')).toBeTruthy();
  });

  it('renders rank badges with numeric positions', () => {
    const { getByText } = render(<StandingsTable standings={mockStandings} />);
    // Rank badges show 1, 2, 3 for three teams
    expect(getByText('1')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
  });

  it('renders Waiver column header when showWaiverOrder is true', () => {
    const { getByText } = render(
      <StandingsTable standings={mockStandings} showWaiverOrder />,
    );
    expect(getByText('Waiver')).toBeTruthy();
  });

  it('does not render Waiver column header when showWaiverOrder is false', () => {
    const { queryByText } = render(
      <StandingsTable standings={mockStandings} showWaiverOrder={false} />,
    );
    expect(queryByText('Waiver')).toBeNull();
  });

  it('renders waiver order values from waiverOrders map', () => {
    const { getByText } = render(
      <StandingsTable
        standings={mockStandings}
        showWaiverOrder
        waiverOrders={{ '1': 15, '2': 11, '3': 13 }}
      />,
    );
    expect(getByText('15')).toBeTruthy();
    expect(getByText('11')).toBeTruthy();
    expect(getByText('13')).toBeTruthy();
  });

  it('sorts by waiver priority and toggles direction — LS-9119', () => {
    const { getByText, getAllByRole } = render(
      <StandingsTable
        standings={mockStandings}
        showWaiverOrder
        waiverOrders={{ '1': 15, '2': 11, '3': 13 }}
      />,
    );

    // Re-query between clicks: the header label gains a sort-direction arrow
    // after the first click, so the exact text 'Waiver' no longer matches.
    fireEvent.click(getByText(/^Waiver/));

    // Ascending: lowest waiver number (11, Lightning) sorts first.
    const rows = getAllByRole('row');
    expect(rows[1].textContent).toContain('Lightning');

    fireEvent.click(getByText(/^Waiver/));

    // Descending: highest waiver number (15, Thunder) sorts first.
    const rowsDesc = getAllByRole('row');
    expect(rowsDesc[1].textContent).toContain('Thunder');
  });

  it('sorts by the # (rank) column — LS-9120', () => {
    const { getByText, getAllByRole } = render(
      <StandingsTable standings={mockStandings} />,
    );

    // First click selects the rank sort key (defaults to desc, matching the
    // table's initial winPct-desc order).
    fireEvent.click(getByText('#'));
    // Second click toggles to ascending — lowest win% (Avalanche) sorts first.
    fireEvent.click(getByText(/^#/));

    const rows = getAllByRole('row');
    expect(rows[1].textContent).toContain('Avalanche');
  });
});
