/**
 * LS-9181 — MockDraftInviteCard shows the invite code for a freshly-created
 * Shared mock draft lobby and lets the creator continue into the draft room.
 */
import React from 'react';
import { MockDraftInviteCard } from './MockDraftInviteCard';
import { fireEvent, render } from '../../test-utils';

describe('MockDraftInviteCard', () => {
  it('renders the invite code and continue action', () => {
    const onContinue = jest.fn();
    const { getByText } = render(
      <MockDraftInviteCard inviteCode="ABC12XYZ" onContinue={onContinue} />,
    );

    expect(getByText('ABC12XYZ')).toBeTruthy();
    expect(getByText('Invite Friends to Draft')).toBeTruthy();

    fireEvent.click(getByText('Continue to Draft Room'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
