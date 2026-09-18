import React from 'react';
import { fireEvent } from '@testing-library/react';
import { DraftClockBar } from './DraftClockBar';
import { render, screen } from '../../test-utils';

const baseProps = {
  isMyPick: false,
  draftPaused: false,
  untimed: false,
  round: 4,
  roundPickNumber: 6,
  timeRemaining: 47,
  pickTimeLimitSeconds: 90,
  onClockTeamName: 'Sandlot Dreamers',
};

describe('DraftClockBar', () => {
  it('shows who is on the clock, the round/pick slot and the countdown ring', () => {
    render(<DraftClockBar {...baseProps} />);

    expect(screen.getByText('On the clock · R4 · P6')).toBeTruthy();
    expect(screen.getByText('Sandlot Dreamers')).toBeTruthy();
    expect(screen.getByRole('timer')).toBeTruthy();
    expect(screen.getByText('0:47')).toBeTruthy();
  });

  it('switches to the second-person eyebrow on my pick', () => {
    render(<DraftClockBar {...baseProps} isMyPick />);

    expect(screen.getByText("You're on the clock · R4 · P6")).toBeTruthy();
  });

  it('says the draft is paused regardless of whose pick it is', () => {
    render(<DraftClockBar {...baseProps} isMyPick draftPaused />);

    expect(screen.getByText('Draft paused · R4 · P6')).toBeTruthy();
    expect(screen.getByText('PAUSE')).toBeTruthy();
  });

  it('warns that the clock may be stale while reconnecting', () => {
    render(<DraftClockBar {...baseProps} connectionStale />);

    expect(
      screen.getByText('Reconnecting — clock may be out of date'),
    ).toBeTruthy();
  });

  it('drops the ring entirely for untimed mock drafts', () => {
    render(<DraftClockBar {...baseProps} untimed />);

    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.queryByText('0:47')).toBeNull();
  });

  it('falls back to a waiting label before the on-clock team resolves', () => {
    render(<DraftClockBar {...baseProps} onClockTeamName={null} />);

    expect(screen.getByText('Waiting…')).toBeTruthy();
  });

  it('opens chat from the clock bar and flags unread messages', () => {
    const onOpenChat = jest.fn();
    render(<DraftClockBar {...baseProps} onOpenChat={onOpenChat} unreadChat />);

    const chat = screen.getByTestId('draft-clock-bar-chat');
    expect(chat.getAttribute('aria-label')).toBe('Open chat, unread messages');
    expect(screen.getByTestId('draft-clock-bar-chat-unread-dot')).toBeTruthy();
    fireEvent.click(chat);
    expect(onOpenChat).toHaveBeenCalledTimes(1);
  });

  it('renders no chat control when no handler is given', () => {
    render(<DraftClockBar {...baseProps} />);

    expect(screen.queryByTestId('draft-clock-bar-chat')).toBeNull();
  });
});
