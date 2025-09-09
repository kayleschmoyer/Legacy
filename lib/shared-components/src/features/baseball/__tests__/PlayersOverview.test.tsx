import React from 'react';
import { render } from '@testing-library/react-native';
import { PlayersOverview, TableView } from '../PlayersOverview';

// Mock the UsefulTables components
jest.mock('../../stats/UsefulTables', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { Text } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */

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
      <PlayersOverview initialView={TableView.PITCHING} />
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
