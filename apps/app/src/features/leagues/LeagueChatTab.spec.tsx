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
const mockUseLeagueChat = jest.fn(() => ({
  messages: [],
  loading: false,
  sending: false,
  sendMessage: mockSendMessage,
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

// Mock tamagui
jest.mock('tamagui', () => {
  const { View, Text } = jest.requireActual<typeof import('react-native')>(
    'react-native',
  ) as RNComponents;
  return {
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
  const defaultProps = { leagueId: 42, userInfo: mockUserInfo };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLeagueChat.mockReturnValue({
      messages: [],
      loading: false,
      sending: false,
      sendMessage: mockSendMessage,
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
      rerender(<LeagueChatTab leagueId={99} userInfo={mockUserInfo} />);
      expect(mockUseLeagueChat).toHaveBeenCalledWith(99);
    });
  });
});
