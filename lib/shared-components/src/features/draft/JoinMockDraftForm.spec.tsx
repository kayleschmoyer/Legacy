/**
 * LS-9181 — JoinMockDraftForm collects an invite code + team name to join a
 * Shared mock draft lobby.
 */
import React from 'react';
import { JoinMockDraftForm } from './JoinMockDraftForm';
import { fireEvent, render } from '../../test-utils';

const noop = () => undefined;

describe('JoinMockDraftForm', () => {
  it('disables Join Draft until a valid code and team name are entered', () => {
    const onSubmit = jest.fn();
    const { getByPlaceholderText, getByText } = render(
      <JoinMockDraftForm onSubmit={onSubmit} onCancel={noop} />,
    );

    fireEvent.click(getByText('Join Draft'));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(getByPlaceholderText('Enter 8-character code'), {
      target: { value: 'abc12xyz' },
    });
    fireEvent.change(getByPlaceholderText('Enter your team name'), {
      target: { value: 'My Squad' },
    });
    fireEvent.click(getByText('Join Draft'));

    expect(onSubmit).toHaveBeenCalledWith('ABC12XYZ', 'My Squad');
  });

  it('does not submit with a code shorter than 8 characters', () => {
    const onSubmit = jest.fn();
    const { getByPlaceholderText, getByText } = render(
      <JoinMockDraftForm onSubmit={onSubmit} onCancel={noop} />,
    );

    fireEvent.change(getByPlaceholderText('Enter 8-character code'), {
      target: { value: 'ABC1' },
    });
    fireEvent.change(getByPlaceholderText('Enter your team name'), {
      target: { value: 'My Squad' },
    });
    fireEvent.click(getByText('Join Draft'));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onCancel when Cancel is pressed', () => {
    const onCancel = jest.fn();
    const { getByText } = render(
      <JoinMockDraftForm onSubmit={noop} onCancel={onCancel} />,
    );

    fireEvent.click(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('surfaces an inline error', () => {
    const { getByText } = render(
      <JoinMockDraftForm
        onSubmit={noop}
        onCancel={noop}
        error="This mock draft is full."
      />,
    );

    expect(getByText('This mock draft is full.')).toBeTruthy();
  });

  it('prefills the invite code from initialInviteCode', () => {
    const { getByPlaceholderText } = render(
      <JoinMockDraftForm
        onSubmit={noop}
        onCancel={noop}
        initialInviteCode="abc12xyz"
      />,
    );

    expect(
      (getByPlaceholderText('Enter 8-character code') as HTMLInputElement)
        .value,
    ).toBe('ABC12XYZ');
  });
});
