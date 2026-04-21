import React from 'react';
import { CreateLeagueModal } from './CreateLeagueModal';
import { act, fireEvent, render } from '../../test-utils';

jest.mock('../../platform-components', () => ({
  Alert: { alert: jest.fn() },
  Platform: { OS: 'web' },
}));

describe('CreateLeagueModal', () => {
  const defaultProps = {
    visible: true,
    sport: 'baseball' as const,
    onClose: jest.fn(),
    onSubmit: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the modal title', () => {
    const { getByText } = render(<CreateLeagueModal {...defaultProps} />);
    expect(getByText('Create League')).toBeTruthy();
  });

  it('renders league name input on Basics step', () => {
    const { getByPlaceholderText } = render(
      <CreateLeagueModal {...defaultProps} />,
    );
    expect(getByPlaceholderText('e.g. Dead Ball Dynasty')).toBeTruthy();
  });

  it('renders step labels in stepper', () => {
    const { getByText } = render(<CreateLeagueModal {...defaultProps} />);
    expect(getByText('Basics')).toBeTruthy();
    expect(getByText('Roster')).toBeTruthy();
    expect(getByText('Era')).toBeTruthy();
    expect(getByText('Draft')).toBeTruthy();
    expect(getByText('Waivers')).toBeTruthy();
  });

  it('shows Next button on first step', () => {
    const { getByText } = render(<CreateLeagueModal {...defaultProps} />);
    expect(getByText('Next')).toBeTruthy();
  });

  it('shows "Creating…" text when loading and on last step', () => {
    const { getByText, rerender } = render(
      <CreateLeagueModal {...defaultProps} />,
    );
    act(() => {
      fireEvent.click(getByText('Waivers'));
    });
    rerender(<CreateLeagueModal {...defaultProps} loading={true} />);
    expect(getByText('Creating…')).toBeTruthy();
  });

  it('renders inline error banner when error prop is set', () => {
    const { getByText } = render(
      <CreateLeagueModal {...defaultProps} error="Failed to create league" />,
    );
    expect(getByText('Failed to create league')).toBeTruthy();
  });

  it('renders premium upgrade banner on Era step when not premium', () => {
    const { getByText } = render(<CreateLeagueModal {...defaultProps} />);
    act(() => {
      fireEvent.click(getByText('Era'));
    });
    expect(getByText('Historical eras are premium')).toBeTruthy();
  });

  it('does not render premium banner when isPremium is true', () => {
    const { queryByText, getByText } = render(
      <CreateLeagueModal {...defaultProps} isPremium />,
    );
    act(() => {
      fireEvent.click(getByText('Era'));
    });
    expect(queryByText('Historical eras are premium')).toBeNull();
  });

  it('clicking Next advances to the Roster step', () => {
    const { getByText } = render(<CreateLeagueModal {...defaultProps} />);
    act(() => {
      fireEvent.click(getByText('Next'));
    });
    expect(getByText('Roster & Schedule')).toBeTruthy();
  });

  it('clicking Back on second step returns to Basics', () => {
    const { getByText } = render(<CreateLeagueModal {...defaultProps} />);
    act(() => {
      fireEvent.click(getByText('Roster'));
    });
    act(() => {
      fireEvent.click(getByText('Back'));
    });
    expect(getByText('Basic Settings')).toBeTruthy();
  });

  it('omits Era step for non-baseball sports', () => {
    const { queryByText } = render(
      <CreateLeagueModal {...defaultProps} sport="football" />,
    );
    expect(queryByText('Era')).toBeNull();
  });

  it('clicking a premium era option opens upgrade modal and does not change selection', () => {
    const { getByText } = render(<CreateLeagueModal {...defaultProps} />);
    act(() => {
      fireEvent.click(getByText('Era'));
    });
    act(() => {
      fireEvent.click(getByText('Dead Ball'));
    });
    expect(getByText(/Upgrade to Legacy Commissioner/)).toBeTruthy();
    expect(getByText(/ALL ERAS/)).toBeTruthy();
  });

  it('clicking locked FAAB option opens upgrade modal and does not change waiver type', () => {
    const { getByText, queryByText } = render(
      <CreateLeagueModal {...defaultProps} />,
    );
    act(() => {
      fireEvent.click(getByText('Waivers'));
    });
    act(() => {
      fireEvent.click(getByText('FAAB · Premium'));
    });
    expect(getByText(/Upgrade to Legacy Commissioner/)).toBeTruthy();
    expect(queryByText('FAAB Budget (per manager)')).toBeNull();
  });

  it('enabling salary cap when not premium opens upgrade modal and leaves salaryCapEnabled false', () => {
    const { getByText, queryByText } = render(
      <CreateLeagueModal {...defaultProps} />,
    );
    act(() => {
      fireEvent.click(getByText('Waivers'));
    });
    act(() => {
      fireEvent.click(getByText('On'));
    });
    expect(getByText(/Upgrade to Legacy Commissioner/)).toBeTruthy();
    expect(queryByText('Cap Amount')).toBeNull();
  });

  it('calls onSubmit with form data when Create League is pressed on last step', () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const { getByText, getByPlaceholderText, getByRole } = render(
      <CreateLeagueModal {...defaultProps} onSubmit={onSubmit} />,
    );
    act(() => {
      fireEvent.change(getByPlaceholderText('e.g. Dead Ball Dynasty'), {
        target: { value: 'Test League' },
      });
    });
    act(() => {
      fireEvent.click(getByText('Waivers'));
    });
    act(() => {
      fireEvent.click(getByRole('button', { name: 'submit-create-league' }));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ leagueName: 'Test League', sport: 'baseball' }),
    );
  });
});
