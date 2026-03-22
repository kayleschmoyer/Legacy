import React from 'react';
import { TradeProposal } from './TradeProposal';
import { fireEvent, render } from '../../test-utils';

describe('TradeProposal', () => {
  it('renders the title', () => {
    const { getByText } = render(
      <TradeProposal
        onClose={jest.fn()}
        leagueId="league-123"
        teamId="team-456"
      />,
    );

    expect(getByText('Trade Proposal')).toBeTruthy();
  });

  it('calls onClose when Close button is pressed', () => {
    const onCloseMock = jest.fn();
    const { getByText } = render(
      <TradeProposal
        onClose={onCloseMock}
        leagueId="league-123"
        teamId="team-456"
      />,
    );

    fireEvent.click(getByText('Close'));
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });
});
