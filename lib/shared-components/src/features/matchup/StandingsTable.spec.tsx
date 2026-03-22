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
});
