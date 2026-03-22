import React from 'react';
import { CreateLeagueModal } from './CreateLeagueModal';
import { render } from '../../test-utils';

jest.mock('../../platform-components', () => ({
  Alert: { alert: jest.fn() },
  Platform: { OS: 'web' },
}));

describe('CreateLeagueModal', () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    onSubmit: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the modal title "Create New League"', () => {
    const { getByText } = render(<CreateLeagueModal {...defaultProps} />);
    expect(getByText('Create New League')).toBeTruthy();
  });

  it('renders league name input', () => {
    const { getByPlaceholderText } = render(
      <CreateLeagueModal {...defaultProps} />,
    );
    expect(getByPlaceholderText('Enter league name')).toBeTruthy();
  });

  it('renders Cancel and Create League buttons', () => {
    const { getByText } = render(<CreateLeagueModal {...defaultProps} />);
    expect(getByText('Cancel')).toBeTruthy();
    expect(getByText('Create League')).toBeTruthy();
  });

  it('shows "Creating..." text when loading', () => {
    const { getByText } = render(
      <CreateLeagueModal {...defaultProps} loading={true} />,
    );
    expect(getByText('Creating...')).toBeTruthy();
  });

  it('makes input read-only when loading', () => {
    const { getByPlaceholderText } = render(
      <CreateLeagueModal {...defaultProps} loading={true} />,
    );
    const input = getByPlaceholderText('Enter league name');
    expect(input).toHaveAttribute('readonly');
  });
});
