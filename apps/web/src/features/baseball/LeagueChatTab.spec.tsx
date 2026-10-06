import React from 'react';
import { render, screen } from '@testing-library/react';
import { LeagueChatTab } from './LeagueChatTab';
import type { ChatMessage } from '../../hooks/useLeagueChat';

// LS-10678: chat text is stored exactly as typed and rendered as a React text
// node — HTML-significant characters must display literally and stay inert.

let mockMessages: ChatMessage[] = [];
jest.mock('../../hooks/useLeagueChat', () => ({
  useLeagueChat: () => ({
    messages: mockMessages,
    loading: false,
    sending: false,
    sendError: null,
    sendMessage: jest.fn(),
  }),
}));

jest.mock('./GifPicker', () => ({ GifPicker: () => null }));

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 1,
    userId: 2,
    username: 'alice',
    avatarUrl: null,
    messageText: 'hello',
    gifUrl: null,
    createdAt: '2026-10-06T05:51:43.809Z',
    messageType: 'text',
    metadata: null,
    ...overrides,
  };
}

describe('LeagueChatTab message text (LS-10678)', () => {
  beforeAll(() => {
    Element.prototype.scrollTo = jest.fn();
  });

  it('renders <, >, &, " and \' literally without rendering HTML', () => {
    const typed = `QA_<b>x</b> & "q" it's`;
    mockMessages = [makeMessage({ messageText: typed })];

    const { container } = render(<LeagueChatTab leagueId={12} userId={1} />);

    expect(screen.getByText(typed)).toBeTruthy();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).not.toMatch(/&(amp|lt|gt|quot|#39);/);
  });
});
