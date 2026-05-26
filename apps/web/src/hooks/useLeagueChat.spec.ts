import { act, renderHook } from '@testing-library/react';
import { useLeagueChat } from './useLeagueChat';

jest.mock('@apollo/client/react', () => ({
  useQuery: jest.fn(),
}));

jest.mock('./useLeagueWebSocket', () => ({
  useLeagueWebSocket: jest.fn(),
}));

jest.mock('../api/db/graphql.generated', () => ({
  GetLeagueChatMessages: 'GET_LEAGUE_CHAT_MESSAGES',
  useSendLeagueChatMessageMutation: jest.fn(),
}));

const { useQuery } = jest.requireMock('@apollo/client/react');
const { useLeagueWebSocket } = jest.requireMock('./useLeagueWebSocket');
const { useSendLeagueChatMessageMutation } = jest.requireMock(
  '../api/db/graphql.generated',
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
