import React from 'react';
import { DraftChatTab } from './DraftChatTab';
import type { DraftChatBubbleMessage } from './DraftChatTab';
import { fireEvent, render, screen } from '../../test-utils';

const messages: DraftChatBubbleMessage[] = [
  { id: 1, userId: 2, username: 'Alice', messageText: 'Hey team' },
  { id: 2, userId: 1, username: 'Me', messageText: 'Ready to draft' },
];

function renderTab(
  overrides: Partial<Parameters<typeof DraftChatTab>[0]> = {},
) {
  const onSend = jest.fn();
  const utils = render(
    <DraftChatTab
      currentUserId={1}
      messages={messages}
      loading={false}
      sending={false}
      onSend={onSend}
      {...overrides}
    />,
  );
  return { ...utils, onSend };
}

describe('DraftChatTab', () => {
  it('renders a sender label above bubbles from other users, and not above mine', () => {
    renderTab();

    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.queryByText('Me')).toBeNull();
  });

  it('renders both message texts', () => {
    renderTab();

    expect(screen.getByText('Hey team')).toBeTruthy();
    expect(screen.getByText('Ready to draft')).toBeTruthy();
  });

  it('shows an empty state when there are no messages', () => {
    renderTab({ messages: [] });

    expect(screen.getByText('No messages yet. Say hello!')).toBeTruthy();
  });

  it('shows a loading spinner and no bubbles while loading', () => {
    renderTab({ loading: true });

    expect(screen.queryByText('Hey team')).toBeNull();
  });

  it('sends the trimmed input text via onSend and clears the input', () => {
    const { onSend } = renderTab();

    const input = screen.getByPlaceholderText('Message the league…');
    fireEvent.change(input, { target: { value: '  go time  ' } });
    fireEvent.click(screen.getByTestId('draft-chat-send'));

    expect(onSend).toHaveBeenCalledWith('go time');
    expect(input).toHaveValue('');
  });

  it('sends on Enter', () => {
    const { onSend } = renderTab();

    const input = screen.getByPlaceholderText('Message the league…');
    fireEvent.change(input, { target: { value: 'quick message' } });
    fireEvent.keyPress(input, { key: 'Enter', charCode: 13 });

    expect(onSend).toHaveBeenCalledWith('quick message');
  });

  it('does not send an empty or whitespace-only message', () => {
    const { onSend } = renderTab();

    const input = screen.getByPlaceholderText('Message the league…');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('draft-chat-send'));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not send while a message is already sending', () => {
    const { onSend } = renderTab({ sending: true });

    const input = screen.getByPlaceholderText('Message the league…');
    fireEvent.change(input, { target: { value: 'go time' } });
    fireEvent.click(screen.getByTestId('draft-chat-send'));

    expect(onSend).not.toHaveBeenCalled();
  });
});
