import React from 'react';
import { render } from '@testing-library/react';
import { CareerStatsViewer } from '../CareerStatsViewer';

// Mock fetch globally
global.fetch = jest.fn();

describe('CareerStatsViewer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with default props', () => {
    const { getByPlaceholderText, getByText } = render(<CareerStatsViewer />);

    expect(getByPlaceholderText('Enter player ID')).toBeTruthy();
    expect(getByText('Get Career Stats')).toBeTruthy();
  });

  it('renders correctly with custom API endpoint', () => {
    const { getByPlaceholderText, getByText } = render(
      <CareerStatsViewer apiEndpoint="https://custom-api.com/career-stats" />,
    );

    expect(getByPlaceholderText('Enter player ID')).toBeTruthy();
    expect(getByText('Get Career Stats')).toBeTruthy();
  });

  it('displays input field and button', () => {
    const { getByPlaceholderText, getByText } = render(<CareerStatsViewer />);

    expect(getByPlaceholderText('Enter player ID')).toBeTruthy();
    expect(getByText('Get Career Stats')).toBeTruthy();
  });
});
