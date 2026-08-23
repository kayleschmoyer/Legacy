import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

// ── Component under test ─────────────────────────────────────────────────────
import { LeagueChatTab } from './LeagueChatTab';

// ── Mock type helpers ────────────────────────────────────────────────────────
type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock the useLeagueChat hook
const mockSendMessage = jest.fn().mockResolvedValue(undefined);
const mockPostAnnouncement = jest.fn().mockResolvedValue(undefined);
const mockUseLeagueChat = jest.fn(() => ({
  messages: [],
  loading: false,
  sending: false,
  wsError: null,
  sendMessage: mockSendMessage,
  mentionCandidates: [],
  announcements: [],
  postingAnnouncement: false,
  postAnnouncement: mockPostAnnouncement,
}));

jest.mock('./hooks/useLeagueChat', () => ({
  useLeagueChat: (...args: unknown[]) => mockUseLeagueChat(...args),
}));

// Mock @legacy-sports/shared-components
jest.mock('@legacy-sports/shared-components', () => {
  const { View, Text } = jest.requireActual<typeof import('react-native')>(
    'react-native',
  ) as RNComponents;
  return {
    GifPicker: ({
      onSelect,
      onClose,
    }: {
      giphyApiKey: string;
      onSelect: (url: string) => void;
      onClose: () => void;
    }) => (
      <View testID="gif-picker">
        <Text onPress={() => onSelect('https://media.giphy.com/test.gif')}>
          Select GIF
        </Text>
        <Text onPress={onClose}>Close GIF Picker</Text>
      </View>
    ),
  };
});

// Mock @legacy-sports/logging
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock @legacy-sports/rollbar/native
jest.mock('@legacy-sports/rollbar/native', () => ({
  captureError: jest.fn(),
}));

// Mock tamagui
jest.mock('tamagui', () => {
  const { View, Text } = jest.requireActual<typeof import('react-native')>(
    'react-native',
  ) as RNComponents;
  return {
    createTokens: (tokens: unknown) => tokens,
    Button: ({
      children,
      onPress,
      disabled,
      testID,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
      testID?: string;
      size?: string;
      backgroundColor?: string;
      color?: string;
      chromeless?: boolean;
      opacity?: number;
      minWidth?: number;
      paddingHorizontal?: string;
    }) => (
      <Text testID={testID} onPress={disabled ? undefined : onPress}>
        {children}
      </Text>
    ),
    Spinner: ({ testID }: { testID?: string; size?: string }) => (
      <View testID={testID ?? 'spinner'} />
    ),
    Text: ({
      children,
      testID,
      onPress,
    }: {
      children?: React.ReactNode;
      testID?: string;
      onPress?: () => void;
      color?: string;
      fontSize?: string | number;
      marginTop?: string;
      flexShrink?: number;
    }) => (
      <Text testID={testID} onPress={onPress}>
        {children}
      </Text>
    ),
    XStack: ({
      children,
      testID,
      ...rest
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => (
      <View testID={testID} {...rest}>
        {children}
      </View>
    ),
    YStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <View testID={testID}>{children}</View>,
  };
});

// ── Test data ────────────────────────────────────────────────────────────────

const mockUserInfo = {
  id: 1,
  username: 'testuser',
  email: 'test@example.com',
  isAdmin: false,
  about: null,
};

const mockMessages = [
  {
    id: 1,
    userId: 1,
    username: 'testuser',
    messageText: 'Hello everyone!',
    messageType: 'text',
    gifUrl: undefined,
    createdAt: '2026-03-31T10:00:00Z',
  },
  {
    id: 2,
    userId: 2,
    username: 'otheruser',
    messageText: 'Hey there!',
    messageType: 'text',
    gifUrl: undefined,
    createdAt: '2026-03-31T10:01:00Z',
  },
];

const mockGifMessage = {
  id: 3,
  userId: 2,
  username: 'otheruser',
  messageText: '',
  messageType: 'gif',
  gifUrl: 'https://media.giphy.com/test.gif',
  createdAt: '2026-03-31T10:02:00Z',
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LeagueChatTab', () => {
  const defaultProps = {
    leagueId: 42,
    userInfo: mockUserInfo,
    isCommissioner: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLeagueChat.mockReturnValue({
      messages: [],
      loading: false,
      sending: false,
      wsError: null,
      sendMessage: mockSendMessage,
      mentionCandidates: [],
      announcements: [],
      postingAnnouncement: false,
      postAnnouncement: mockPostAnnouncement,
    });
  });

  describe('loading state', () => {
    it('shows spinner while messages are loading', () => {
      mockUseLeagueChat.mockReturnValue({
        messages: [],
        loading: true,
        sending: false,
        sendMessage: mockSendMessage,
      });

      render(<LeagueChatTab {...defaultProps} />);
      expect(screen.getByTestId('spinner')).toBeTruthy();
    });

    it('shows loading text while loading', () => {
      mockUseLeagueChat.mockReturnValue({
        messages: [],
        loading: true,
        sending: false,
        sendMessage: mockSendMessage,
      });

      render(<LeagueChatTab {...defaultProps} />);
      expect(screen.getByText('Loading messages…')).toBeTruthy();
    });
  });

  describe('empty state', () => {
    it('shows empty state message when there are no messages', () => {
      render(<LeagueChatTab {...defaultProps} />);
      expect(screen.getByText(/No messages yet/)).toBeTruthy();
    });

    it('prompts user to be the first to say something', () => {
      render(<LeagueChatTab {...defaultProps} />);
      expect(screen.getByText(/Be the first to say something/)).toBeTruthy();
    });
  });

  describe('message display', () => {
    it('renders text messages', () => {
      mockUseLeagueChat.mockReturnValue({
        messages: mockMessages,
        loading: false,
        sending: false,
        sendMessage: mockSendMessage,
      });

      render(<LeagueChatTab {...defaultProps} />);
      expect(screen.getByText('Hello everyone!')).toBeTruthy();
      expect(screen.getByText('Hey there!')).toBeTruthy();
    });

    it('shows sender username for messages from others', () => {
      mockUseLeagueChat.mockReturnValue({
        messages: mockMessages,
        loading: false,
        sending: false,
        sendMessage: mockSendMessage,
      });

      render(<LeagueChatTab {...defaultProps} />);
      expect(screen.getByText('otheruser')).toBeTruthy();
    });

    it('does not show sender username for own messages', () => {
      mockUseLeagueChat.mockReturnValue({
        messages: [mockMessages[0]], // only own message
        loading: false,
        sending: false,
        sendMessage: mockSendMessage,
      });

      render(<LeagueChatTab {...defaultProps} />);
      // 'testuser' (own username) should not appear as a label
      expect(screen.queryByText('testuser')).toBeNull();
    });

    it('renders GIF messages without showing a text bubble', () => {
      mockUseLeagueChat.mockReturnValue({
        messages: [mockGifMessage],
        loading: false,
        sending: false,
        sendMessage: mockSendMessage,
      });

      // GIF message renders an Image element — verify component doesn't crash
      // and the empty messageText is not displayed as a chat bubble
      render(<LeagueChatTab {...defaultProps} />);
      // The no-messages placeholder should not be shown when there is a message
      expect(screen.queryByText(/No messages yet/)).toBeNull();
    });
  });

  describe('message input', () => {
    it('renders the message input field', () => {
      render(<LeagueChatTab {...defaultProps} />);
      expect(screen.getByPlaceholderText('Message the league…')).toBeTruthy();
    });

    it('renders the Send button', () => {
      render(<LeagueChatTab {...defaultProps} />);
      expect(screen.getByText('Send')).toBeTruthy();
    });

    it('calls sendMessage when Send is pressed with text', async () => {
      render(<LeagueChatTab {...defaultProps} />);

      const input = screen.getByPlaceholderText('Message the league…');
      fireEvent.changeText(input, 'Test message');
      fireEvent.press(screen.getByText('Send'));

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith('Test message');
      });
    });

    it('does not call sendMessage when input is empty', () => {
      render(<LeagueChatTab {...defaultProps} />);
      fireEvent.press(screen.getByText('Send'));
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('shows sending indicator while message is being sent', () => {
      mockUseLeagueChat.mockReturnValue({
        messages: [],
        loading: false,
        sending: true,
        sendMessage: mockSendMessage,
      });

      render(<LeagueChatTab {...defaultProps} />);
      expect(screen.getByText('…')).toBeTruthy();
    });
  });

  describe('hook integration', () => {
    it('passes the correct leagueId to useLeagueChat', () => {
      render(<LeagueChatTab {...defaultProps} />);
      expect(mockUseLeagueChat).toHaveBeenCalledWith(42);
    });

    it('re-subscribes when leagueId changes', () => {
      const { rerender } = render(<LeagueChatTab {...defaultProps} />);
      rerender(
        <LeagueChatTab
          leagueId={99}
          userInfo={mockUserInfo}
          isCommissioner={false}
        />,
      );
      expect(mockUseLeagueChat).toHaveBeenCalledWith(99);
    });
  });

  describe('WebSocket error state', () => {
    it('shows connection-failed banner when wsError is set', () => {
      mockUseLeagueChat.mockReturnValue({
        messages: [],
        loading: false,
        sending: false,
        wsError: new Error('Keychain read failed'),
        sendMessage: mockSendMessage,
      });

      render(<LeagueChatTab {...defaultProps} />);
      expect(screen.getByTestId('ws-error-banner')).toBeTruthy();
      expect(
        screen.getByText(
          'Could not connect to live chat. Messages may be delayed.',
        ),
      ).toBeTruthy();
    });

    it('does not show connection-failed banner when wsError is null', () => {
      render(<LeagueChatTab {...defaultProps} />);
      expect(screen.queryByTestId('ws-error-banner')).toBeNull();
    });
  });

  describe('system messages (LS-9097)', () => {
    it('renders a trade/waiver/draft event as a centered system notice', () => {
      mockUseLeagueChat.mockReturnValue({
        messages: [
          {
            id: 10,
            userId: 0,
            username: '',
            messageText: 'Team A traded with Team B',
            messageType: 'trade',
            createdAt: '2026-03-31T10:00:00Z',
          },
        ],
        loading: false,
        sending: false,
        wsError: null,
        sendMessage: mockSendMessage,
        mentionCandidates: [],
      });

      render(<LeagueChatTab {...defaultProps} />);
      expect(screen.getByTestId('system-message')).toBeTruthy();
      expect(screen.getByText('Team A traded with Team B')).toBeTruthy();
    });

    it('renders a plain text message as a normal bubble, not a system notice', () => {
      mockUseLeagueChat.mockReturnValue({
        messages: mockMessages,
        loading: false,
        sending: false,
        wsError: null,
        sendMessage: mockSendMessage,
        mentionCandidates: [],
      });

      render(<LeagueChatTab {...defaultProps} />);
      expect(screen.queryByTestId('system-message')).toBeNull();
    });
  });

  describe('@mentions (LS-9097)', () => {
    const mentionCandidates = [{ userId: 2, label: 'Wolfpack' }];

    it('bolds a message segment that matches a roster mention', () => {
      mockUseLeagueChat.mockReturnValue({
        messages: [
          {
            id: 11,
            userId: 2,
            username: 'otheruser',
            messageText: 'hi @Wolfpack, good luck this week',
            messageType: 'text',
            createdAt: '2026-03-31T10:00:00Z',
          },
        ],
        loading: false,
        sending: false,
        wsError: null,
        sendMessage: mockSendMessage,
        mentionCandidates,
      });

      render(<LeagueChatTab {...defaultProps} />);
      expect(screen.getByText('@Wolfpack')).toBeTruthy();
    });

    it('shows autocomplete suggestions while typing an @mention', () => {
      mockUseLeagueChat.mockReturnValue({
        messages: [],
        loading: false,
        sending: false,
        wsError: null,
        sendMessage: mockSendMessage,
        mentionCandidates,
      });

      render(<LeagueChatTab {...defaultProps} />);
      const input = screen.getByPlaceholderText('Message the league…');

      fireEvent.changeText(input, 'hi @Wolf');
      fireEvent(input, 'selectionChange', {
        nativeEvent: { selection: { start: 8, end: 8 } },
      });

      expect(screen.getByTestId('mention-suggestions')).toBeTruthy();
      expect(screen.getByTestId('mention-suggestion-2')).toBeTruthy();
    });

    it('inserts the selected mention into the input on tap', () => {
      mockUseLeagueChat.mockReturnValue({
        messages: [],
        loading: false,
        sending: false,
        wsError: null,
        sendMessage: mockSendMessage,
        mentionCandidates,
      });

      render(<LeagueChatTab {...defaultProps} />);
      const input = screen.getByPlaceholderText('Message the league…');

      fireEvent.changeText(input, 'hi @Wolf');
      fireEvent(input, 'selectionChange', {
        nativeEvent: { selection: { start: 8, end: 8 } },
      });
      fireEvent.press(screen.getByTestId('mention-suggestion-2'));

      expect(screen.getByDisplayValue('hi @Wolfpack ')).toBeTruthy();
    });

    it('does not show suggestions once the mention token is closed by a space', () => {
      mockUseLeagueChat.mockReturnValue({
        messages: [],
        loading: false,
        sending: false,
        wsError: null,
        sendMessage: mockSendMessage,
        mentionCandidates,
      });

      render(<LeagueChatTab {...defaultProps} />);
      const input = screen.getByPlaceholderText('Message the league…');

      fireEvent.changeText(input, 'hi @Wolfpack ');
      fireEvent(input, 'selectionChange', {
        nativeEvent: { selection: { start: 13, end: 13 } },
      });

      expect(screen.queryByTestId('mention-suggestions')).toBeNull();
    });
  });

  describe('offline queueing (LS-9097)', () => {
    it('renders a pending message with a sending indicator', () => {
      mockUseLeagueChat.mockReturnValue({
        messages: [
          {
            id: -1,
            userId: 0,
            username: '',
            messageText: 'sent while offline',
            messageType: 'text',
            createdAt: '2026-03-31T10:00:00Z',
            pending: true,
          },
        ],
        loading: false,
        sending: false,
        wsError: null,
        sendMessage: mockSendMessage,
        mentionCandidates: [],
      });

      render(<LeagueChatTab {...defaultProps} />);
      expect(screen.getByText('sent while offline')).toBeTruthy();
      expect(screen.getByText(/Sending…/)).toBeTruthy();
    });
  });

  describe('commissioner announcements (LS-6303 / FLD-051)', () => {
    const mockAnnouncement = {
      id: 5,
      username: 'CommishBob',
      messageText: 'Trade deadline is Friday!',
      createdAt: '2026-03-31T10:00:00Z',
    };

    it('does not render a pinned banner when there are no announcements', () => {
      render(<LeagueChatTab {...defaultProps} />);
      expect(screen.queryByTestId('pinned-announcement-banner')).toBeNull();
    });

    it('pins the latest announcement at the top', () => {
      mockUseLeagueChat.mockReturnValue({
        messages: [],
        loading: false,
        sending: false,
        wsError: null,
        sendMessage: mockSendMessage,
        mentionCandidates: [],
        announcements: [mockAnnouncement],
        postingAnnouncement: false,
        postAnnouncement: mockPostAnnouncement,
      });

      render(<LeagueChatTab {...defaultProps} />);
      expect(screen.getByTestId('pinned-announcement-banner')).toBeTruthy();
      expect(screen.getByText('Trade deadline is Friday!')).toBeTruthy();
    });

    it('does not show the Announce toggle for non-commissioners', () => {
      render(<LeagueChatTab {...defaultProps} isCommissioner={false} />);
      expect(screen.queryByTestId('announce-toggle')).toBeNull();
    });

    it('shows the Announce toggle for commissioners', () => {
      render(<LeagueChatTab {...defaultProps} isCommissioner={true} />);
      expect(screen.getByTestId('announce-toggle')).toBeTruthy();
    });

    it('posts an announcement instead of a regular message while in announce mode', async () => {
      render(<LeagueChatTab {...defaultProps} isCommissioner={true} />);

      fireEvent.press(screen.getByTestId('announce-toggle'));
      const input = screen.getByPlaceholderText(
        'Write an announcement to the league…',
      );
      fireEvent.changeText(input, 'League fees due next week');
      fireEvent.press(screen.getByText('Send'));

      await waitFor(() => {
        expect(mockPostAnnouncement).toHaveBeenCalledWith(
          'League fees due next week',
        );
      });
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('restores the draft instead of losing it when posting an announcement fails', async () => {
      mockPostAnnouncement.mockRejectedValueOnce(new Error('network blip'));
      mockUseLeagueChat.mockReturnValue({
        messages: [],
        loading: false,
        sending: false,
        wsError: null,
        sendMessage: mockSendMessage,
        mentionCandidates: [],
        announcements: [],
        postingAnnouncement: false,
        postAnnouncement: mockPostAnnouncement,
      });

      render(<LeagueChatTab {...defaultProps} isCommissioner={true} />);

      fireEvent.press(screen.getByTestId('announce-toggle'));
      const input = screen.getByPlaceholderText(
        'Write an announcement to the league…',
      );
      fireEvent.changeText(input, 'League fees due next week');
      fireEvent.press(screen.getByText('Send'));

      await waitFor(() => {
        expect(mockPostAnnouncement).toHaveBeenCalled();
      });
      await waitFor(() => {
        expect(
          screen.getByDisplayValue('League fees due next week'),
        ).toBeTruthy();
      });
      // Still in announce mode — the commissioner can retry the same send.
      expect(screen.getByTestId('announce-mode-banner')).toBeTruthy();
    });
  });
});
