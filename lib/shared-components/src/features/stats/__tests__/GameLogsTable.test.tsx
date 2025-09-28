import React from 'react';
import { render } from '@testing-library/react';
import { GameLogsTable } from '../GameLogsTable';

// Mock fetch globally
global.fetch = jest.fn();

describe('GameLogsTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with default props', () => {
    const { getByPlaceholderText, getByText } = render(<GameLogsTable />);

    expect(getByPlaceholderText('Enter player ID')).toBeTruthy();
    expect(getByPlaceholderText('YYYY-MM-DD')).toBeTruthy();
    expect(getByText('Get Player Data')).toBeTruthy();
  });

  it('renders correctly with custom API endpoint', () => {
    const { getByPlaceholderText, getByText } = render(
      <GameLogsTable apiEndpoint="https://custom-api.com/game-logs" />,
    );

    expect(getByPlaceholderText('Enter player ID')).toBeTruthy();
    expect(getByPlaceholderText('YYYY-MM-DD')).toBeTruthy();
    expect(getByText('Get Player Data')).toBeTruthy();
  });

  it('displays input fields and button', () => {
    const { getByPlaceholderText, getByText } = render(<GameLogsTable />);

    expect(getByPlaceholderText('Enter player ID')).toBeTruthy();
    expect(getByPlaceholderText('YYYY-MM-DD')).toBeTruthy();
    expect(getByText('Get Player Data')).toBeTruthy();
  });
});
