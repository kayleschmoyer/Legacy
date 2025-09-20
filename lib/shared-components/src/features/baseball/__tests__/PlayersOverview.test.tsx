import React from 'react';
import { render } from '@testing-library/react';
import { PlayersOverview, TableView } from '../PlayersOverview';

// Mock the UsefulTables components
jest.mock('../../stats/UsefulTables', () => {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */

  return {
    BattingStatsTableWithData: () =>
      React.createElement(Text, {}, 'BattingStatsTableWithData'),
    FieldingStatsTableWithData: () =>
      React.createElement(Text, {}, 'FieldingStatsTableWithData'),
    PitchingStatsTableWithData: () =>
      React.createElement(Text, {}, 'PitchingStatsTableWithData'),
  };
});

describe('PlayersOverview', () => {
  it('renders correctly with default props', () => {
    const { getByText } = render(<PlayersOverview />);

    expect(getByText('Batting')).toBeTruthy();
    expect(getByText('Pitching')).toBeTruthy();
    expect(getByText('Fielding')).toBeTruthy();
  });

  it('renders correctly with custom initial view', () => {
    const { getByText } = render(
      <PlayersOverview initialView={TableView.PITCHING} />,
    );

    expect(getByText('Batting')).toBeTruthy();
    expect(getByText('Pitching')).toBeTruthy();
    expect(getByText('Fielding')).toBeTruthy();
  });

  it('displays all three tab buttons', () => {
    const { getByText } = render(<PlayersOverview />);

    expect(getByText('Batting')).toBeTruthy();
    expect(getByText('Pitching')).toBeTruthy();
    expect(getByText('Fielding')).toBeTruthy();
  });
});
