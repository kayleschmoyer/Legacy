import React from 'react';
import { render, screen } from '@testing-library/react-native';

// ── Component under test ─────────────────────────────────────────────────────
import FreeAgentsScreen from './FreeAgents';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@legacy-sports/shared-components', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    FreeAgents: () => <View testID="free-agents-component" />,
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('FreeAgentsScreen', () => {
  it('renders without crashing', () => {
    render(<FreeAgentsScreen />);
    expect(screen.getByTestId('free-agents-component')).toBeTruthy();
  });

  it('renders the shared FreeAgents component', () => {
    render(<FreeAgentsScreen />);
    expect(screen.getByTestId('free-agents-component')).toBeTruthy();
  });
});
