import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { LeagueChatTab } from './LeagueChatTab';
import type { ChatMessage } from '../../hooks/useLeagueChat';

let mockMessages: ChatMessage[] = [];
const mockSendMessage = jest.fn<Promise<boolean>, [string, string?]>();
const mockClearSendError = jest.fn();
let mockSendError: string | null = null;

jest.mock('../../hooks/useLeagueChat', () => ({
  useLeagueChat: () => ({
    messages: mockMessages,
    loading: false,
    sending: false,
    sendError: mockSendError,
    sendMessage: mockSendMessage,
    clearSendError: mockClearSendError,
  }),
}));

jest.mock('./GifPicker', () => ({ GifPicker: () => null }));
jest.mock('@tamagui/lucide-icons/icons/MessageSquare', () => ({
  MessageSquare: () => null,
}));

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

// LS-10678: chat text is stored exactly as typed and rendered as a React text
// node — HTML-significant characters must display literally and stay inert.
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

// LS-10718: a failed send must not discard the typed message, and the error
// banner must clear once the user edits the composer.
function getComposer(): HTMLTextAreaElement {
  return screen.getByLabelText('Message the league');
}

async function typeAndSend(text: string): Promise<void> {
  fireEvent.change(getComposer(), { target: { value: text } });
  fireEvent.keyDown(getComposer(), { key: 'Enter' });
  // Let the awaited sendMessage settle.
  await act(() => Promise.resolve());
}

describe('LeagueChatTab — failed sends (LS-10718)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMessages = [];
    mockSendError = null;
  });

  it('restores the typed text to the composer when the send fails', async () => {
    mockSendMessage.mockResolvedValue(false);
    render(<LeagueChatTab leagueId={1} userId={1} />);

    await typeAndSend('QA_offline');

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledWith('QA_offline');
    expect(getComposer().value).toBe('QA_offline');
  });

  it('clears the composer when the send succeeds', async () => {
    mockSendMessage.mockResolvedValue(true);
    render(<LeagueChatTab leagueId={1} userId={1} />);

    await typeAndSend('hello league');

    expect(getComposer().value).toBe('');
  });

  it('does not overwrite text typed while the failed send was in flight', async () => {
    let resolveSend: (sent: boolean) => void = () => undefined;
    mockSendMessage.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveSend = resolve;
      }),
    );
    render(<LeagueChatTab leagueId={1} userId={1} />);

    await typeAndSend('first message');
    fireEvent.change(getComposer(), { target: { value: 'second draft' } });
    resolveSend(false);
    await act(() => Promise.resolve());

    expect(getComposer().value).toBe('second draft');
  });

  it('clears the send error when the user edits the composer', () => {
    mockSendError = 'Failed to send message. Please try again.';
    render(<LeagueChatTab leagueId={1} userId={1} />);

    fireEvent.change(getComposer(), { target: { value: 'Q' } });

    expect(mockClearSendError).toHaveBeenCalled();
  });
});
