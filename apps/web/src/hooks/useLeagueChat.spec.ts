import { act, renderHook } from '@testing-library/react';
import { CombinedGraphQLErrors } from '@apollo/client';
import { LOGGER } from '@legacy-sports/logging';
import { CHAT_RATE_LIMITED_MESSAGE } from '@legacy-sports/shared-components/chat';
import { useLeagueChat } from './useLeagueChat';

jest.mock('@apollo/client/react', () => ({
  useQuery: jest.fn(),
}));

jest.mock('./useLeagueWebSocket', () => ({
  useLeagueWebSocket: jest.fn(),
}));

jest.mock('@legacy-sports/graphql', () => ({
  GetLeagueChatMessages: 'GET_LEAGUE_CHAT_MESSAGES',
  useSendLeagueChatMessageMutation: jest.fn(),
}));

const { useQuery } = jest.requireMock('@apollo/client/react');
const { useLeagueWebSocket } = jest.requireMock('./useLeagueWebSocket');
const { useSendLeagueChatMessageMutation } = jest.requireMock(
  '@legacy-sports/graphql',
);

const makeRawMessages = (leagueId: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: String(leagueId * 100 + i),
    userId: '1',
    messageText: `league${leagueId} msg${i}`,
    gifUrl: null,
    timestamp: '2024-01-01T00:00:00Z',
    messageType: 'text',
    metadata: null,
    sender: { username: 'user1', avatarUrl: null },
  }));

describe('useLeagueChat — message ordering (LS-4059)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    useLeagueWebSocket.mockReturnValue(undefined);
    useSendLeagueChatMessageMutation.mockReturnValue([
      jest.fn(),
      { loading: false },
    ]);
  });

  it('sorts messages by createdAt timestamp when history arrives out of order', () => {
    const outOfOrderMessages = [
      {
        id: '3',
        userId: '1',
        messageText: 'third',
        gifUrl: null,
        timestamp: '2024-01-01T00:00:03Z',
        messageType: 'text',
        metadata: null,
        sender: { username: 'user1', avatarUrl: null },
      },
      {
        id: '1',
        userId: '1',
        messageText: 'first',
        gifUrl: null,
        timestamp: '2024-01-01T00:00:01Z',
        messageType: 'text',
        metadata: null,
        sender: { username: 'user1', avatarUrl: null },
      },
      {
        id: '2',
        userId: '1',
        messageText: 'second',
        gifUrl: null,
        timestamp: '2024-01-01T00:00:02Z',
        messageType: 'text',
        metadata: null,
        sender: { username: 'user1', avatarUrl: null },
      },
    ];

    useQuery.mockReturnValue({
      loading: true,
      data: undefined,
      refetch: jest.fn(),
    });

    const { result, rerender } = renderHook(() => useLeagueChat(1));
    expect(result.current.messages).toHaveLength(0);

    useQuery.mockReturnValue({
      loading: false,
      data: { getLeagueMessages: outOfOrderMessages },
      refetch: jest.fn(),
    });

    rerender();

    expect(result.current.messages.map((m) => m.messageText)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('sorts new WS messages into correct position among existing messages', () => {
    type WsChatMessage = {
      leagueId: number;
      messageId: string;
      senderId: string | null;
      senderUsername: string;
      messageText: string;
      gifUrl: string | null;
      timestamp: string;
      messageType: string | null;
      metadata: Record<string, unknown> | null;
    };
    let wsCallback: ((n: WsChatMessage) => void) | null = null;

    useLeagueWebSocket.mockImplementation(
      ({
        onLeagueChatMessage,
      }: {
        onLeagueChatMessage: (n: WsChatMessage) => void;
      }) => {
        wsCallback = onLeagueChatMessage;
      },
    );

    useQuery.mockReturnValue({
      loading: true,
      data: undefined,
      refetch: jest.fn(),
    });

    const { result, rerender } = renderHook(() => useLeagueChat(1));

    useQuery.mockReturnValue({
      loading: false,
      data: {
        getLeagueMessages: [
          {
            id: '2',
            userId: '1',
            messageText: 'second',
            gifUrl: null,
            timestamp: '2024-01-01T00:00:02Z',
            messageType: 'text',
            metadata: null,
            sender: { username: 'user1', avatarUrl: null },
          },
        ],
      },
      refetch: jest.fn(),
    });

    rerender();
    expect(result.current.messages).toHaveLength(1);

    // WS delivers "first" out of order after "second" is already in state
    act(() => {
      wsCallback?.({
        leagueId: 1,
        messageId: '1',
        senderId: '1',
        senderUsername: 'user1',
        messageText: 'first',
        gifUrl: null,
        timestamp: '2024-01-01T00:00:01Z',
        messageType: 'text',
        metadata: null,
      });
    });

    expect(result.current.messages.map((m) => m.messageText)).toEqual([
      'first',
      'second',
    ]);
  });
});

describe('useLeagueChat — stale-data guard (LS-2461)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    useLeagueWebSocket.mockReturnValue(undefined);
    useSendLeagueChatMessageMutation.mockReturnValue([
      jest.fn(),
      { loading: false },
    ]);
  });

  it('applies historyData once loading=false for a given leagueId', () => {
    // Phase 1: initial load in progress (network-only starts loading)
    useQuery.mockReturnValue({
      loading: true,
      data: undefined,
      refetch: jest.fn(),
    });

    const { result, rerender } = renderHook(() => useLeagueChat(1));

    expect(result.current.messages).toHaveLength(0);

    // Phase 2: data arrives
    useQuery.mockReturnValue({
      loading: false,
      data: { getLeagueMessages: makeRawMessages(1, 3) },
      refetch: jest.fn(),
    });

    rerender();

    expect(result.current.messages).toHaveLength(3);
  });

  it('does not apply stale historyData when loading=true after leagueId changes', () => {
    // Phase 1: league 1 loading
    useQuery.mockReturnValue({
      loading: true,
      data: undefined,
      refetch: jest.fn(),
    });

    const { result, rerender } = renderHook(
      ({ leagueId }: { leagueId: number }) => useLeagueChat(leagueId),
      { initialProps: { leagueId: 1 } },
    );

    // Phase 2: league 1 data arrives
    useQuery.mockReturnValue({
      loading: false,
      data: { getLeagueMessages: makeRawMessages(1, 3) },
      refetch: jest.fn(),
    });

    rerender({ leagueId: 1 });
    expect(result.current.messages).toHaveLength(3);

    // Phase 3: leagueId switches to 2 — Apollo keeps stale league-1 data, sets loading=true
    useQuery.mockReturnValue({
      loading: true,
      data: { getLeagueMessages: makeRawMessages(1, 3) },
      refetch: jest.fn(),
    });

    rerender({ leagueId: 2 });

    // Reset effect clears messages; loading guard must prevent stale league-1
    // data from re-populating the league-2 view.
    expect(result.current.messages).toHaveLength(0);
  });
});

describe('useLeagueChat — WS notifications are scoped to the viewed league (LS-6301)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    useSendLeagueChatMessageMutation.mockReturnValue([
      jest.fn(),
      { loading: false },
    ]);
    useQuery.mockReturnValue({
      loading: false,
      data: { getLeagueMessages: [] },
      refetch: jest.fn(),
    });
  });

  it('drops a WS chat notification whose leagueId does not match the viewed league', () => {
    type WsChatMessage = {
      leagueId: number;
      messageId: string;
      senderId: string | null;
      senderUsername: string;
      messageText: string;
      gifUrl: string | null;
      timestamp: string;
      messageType: string | null;
      metadata: Record<string, unknown> | null;
    };
    let wsCallback: ((n: WsChatMessage) => void) | null = null;

    useLeagueWebSocket.mockImplementation(
      ({
        onLeagueChatMessage,
      }: {
        onLeagueChatMessage: (n: WsChatMessage) => void;
      }) => {
        wsCallback = onLeagueChatMessage;
      },
    );

    const { result } = renderHook(() => useLeagueChat(1));

    // Notification carries leagueId 2 while this hook instance is scoped to
    // league 1 — must be silently dropped, not rendered into league 1's chat.
    act(() => {
      wsCallback?.({
        leagueId: 2,
        messageId: '99',
        senderId: '7',
        senderUsername: 'intruder',
        messageText: 'message from another league',
        gifUrl: null,
        timestamp: '2024-01-01T00:00:00Z',
        messageType: 'text',
        metadata: null,
      });
    });

    expect(result.current.messages).toHaveLength(0);
  });

  it('applies a WS chat notification whose leagueId matches the viewed league', () => {
    type WsChatMessage = {
      leagueId: number;
      messageId: string;
      senderId: string | null;
      senderUsername: string;
      messageText: string;
      gifUrl: string | null;
      timestamp: string;
      messageType: string | null;
      metadata: Record<string, unknown> | null;
    };
    let wsCallback: ((n: WsChatMessage) => void) | null = null;

    useLeagueWebSocket.mockImplementation(
      ({
        onLeagueChatMessage,
      }: {
        onLeagueChatMessage: (n: WsChatMessage) => void;
      }) => {
        wsCallback = onLeagueChatMessage;
      },
    );

    const { result } = renderHook(() => useLeagueChat(1));

    act(() => {
      wsCallback?.({
        leagueId: 1,
        messageId: '100',
        senderId: '7',
        senderUsername: 'teammate',
        messageText: 'message from this league',
        gifUrl: null,
        timestamp: '2024-01-01T00:00:00Z',
        messageType: 'text',
        metadata: null,
      });
    });

    expect(result.current.messages.map((m) => m.messageText)).toEqual([
      'message from this league',
    ]);
  });
});

describe('useLeagueChat — send errors (LS-10468)', () => {
  let sendMutation: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    useLeagueWebSocket.mockReturnValue(undefined);
    useQuery.mockReturnValue({
      loading: false,
      data: { getLeagueMessages: [] },
      refetch: jest.fn().mockResolvedValue({}),
    });
    sendMutation = jest.fn();
    useSendLeagueChatMessageMutation.mockReturnValue([
      sendMutation,
      { loading: false },
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the rate-limit notice without logging an error when the send is throttled', async () => {
    const logError = jest.spyOn(LOGGER, 'error').mockReturnValue(undefined);
    sendMutation.mockRejectedValue(
      new CombinedGraphQLErrors({
        errors: [
          {
            message: 'Too many attempts. Please try again later.',
            extensions: { code: 'RATE_LIMITED' },
          },
        ],
      }),
    );

    const { result } = renderHook(() => useLeagueChat(1));
    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(result.current.sendError).toBe(CHAT_RATE_LIMITED_MESSAGE);
    expect(logError).not.toHaveBeenCalled();
  });

  it('suppresses the global error toast for chat sends', async () => {
    sendMutation.mockResolvedValue({});

    const { result } = renderHook(() => useLeagueChat(1));
    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(sendMutation).toHaveBeenCalledWith(
      expect.objectContaining({ context: { suppressGlobalError: true } }),
    );
  });

  it('keeps the generic failure message and logs any other send error', async () => {
    const logError = jest.spyOn(LOGGER, 'error').mockReturnValue(undefined);
    sendMutation.mockRejectedValue(new Error('Failed to fetch'));

    const { result } = renderHook(() => useLeagueChat(1));
    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(result.current.sendError).toBe(
      'Failed to send message. Please try again.',
    );
    expect(logError).toHaveBeenCalled();
  });
});

describe('useLeagueChat — failed-send recovery (LS-10718)', () => {
  const FAILED = 'Failed to send message. Please try again.';
  let sendMutation: jest.Mock;
  let refetch: jest.Mock;
  let onReconnect: (() => void) | null;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(LOGGER, 'error').mockReturnValue(undefined);
    jest.spyOn(LOGGER, 'warn').mockReturnValue(undefined);
    onReconnect = null;
    useLeagueWebSocket.mockImplementation(
      (opts: { onReconnect: () => void }) => {
        onReconnect = opts.onReconnect;
      },
    );
    refetch = jest.fn().mockResolvedValue({});
    useQuery.mockReturnValue({
      loading: false,
      data: { getLeagueMessages: [] },
      refetch,
    });
    sendMutation = jest.fn();
    useSendLeagueChatMessageMutation.mockReturnValue([
      sendMutation,
      { loading: false },
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function failedSend(result: {
    current: ReturnType<typeof useLeagueChat>;
  }): Promise<boolean> {
    sendMutation.mockRejectedValueOnce(new Error('Failed to fetch'));
    let sent = true;
    await act(async () => {
      sent = await result.current.sendMessage('QA_offline');
    });
    return sent;
  }

  it('returns false when the mutation fails', async () => {
    const { result } = renderHook(() => useLeagueChat(1));
    expect(await failedSend(result)).toBe(false);
    expect(result.current.sendError).toBe(FAILED);
  });

  it('returns false when the send is rate limited', async () => {
    sendMutation.mockRejectedValue(
      new CombinedGraphQLErrors({
        errors: [
          { message: 'slow down', extensions: { code: 'RATE_LIMITED' } },
        ],
      }),
    );
    const { result } = renderHook(() => useLeagueChat(1));
    let sent = true;
    await act(async () => {
      sent = await result.current.sendMessage('hello');
    });
    expect(sent).toBe(false);
  });

  it('returns true and clears a previous error when the send succeeds', async () => {
    const { result } = renderHook(() => useLeagueChat(1));
    await failedSend(result);

    sendMutation.mockResolvedValueOnce({});
    let sent = false;
    await act(async () => {
      sent = await result.current.sendMessage('QA_offline');
    });

    expect(sent).toBe(true);
    expect(result.current.sendError).toBeNull();
  });

  it('reports success when the message was stored but the history refetch fails', async () => {
    // A send the server accepted must never look failed — the composer would
    // restore the text and a retry would double-post.
    sendMutation.mockResolvedValueOnce({});
    refetch.mockRejectedValueOnce(new Error('Failed to fetch'));
    const { result } = renderHook(() => useLeagueChat(1));

    let sent = false;
    await act(async () => {
      sent = await result.current.sendMessage('hello');
    });

    expect(sent).toBe(true);
    expect(result.current.sendError).toBeNull();
    expect(sendMutation).toHaveBeenCalledWith(
      expect.not.objectContaining({ refetchQueries: expect.anything() }),
    );
    expect(refetch).toHaveBeenCalled();
  });

  it('clears the send error when the socket reconnects', async () => {
    const { result } = renderHook(() => useLeagueChat(1));
    await failedSend(result);
    expect(result.current.sendError).toBe(FAILED);

    act(() => {
      onReconnect?.();
    });

    expect(result.current.sendError).toBeNull();
  });

  it('clears the send error via clearSendError', async () => {
    const { result } = renderHook(() => useLeagueChat(1));
    await failedSend(result);

    act(() => {
      result.current.clearSendError();
    });

    expect(result.current.sendError).toBeNull();
  });
});
