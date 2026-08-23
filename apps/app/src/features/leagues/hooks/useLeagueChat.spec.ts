import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClientNotificationType } from '@legacy-sports/utils';
import { useLeagueChat } from './useLeagueChat';

// At runtime Expo Metro aliases `@legacy-sports/utils` to lib/utils/src/index.ts
// (via tsconfig paths), so ClientNotificationType resolves. Under jest the app's
// moduleNameMapper + `native.ts` extension priority resolves the barrel to
// index.native.ts, which omits notification-types. Pull the real constant from
// its canonical source so this spec exercises the actual event name.
jest.mock('@legacy-sports/utils', () => ({
  ClientNotificationType: jest.requireActual<
    typeof import('../../../../../../lib/utils/src/lib/notification-types')
  >('../../../../../../lib/utils/src/lib/notification-types')
    .ClientNotificationType,
}));

const mockUseQuery = jest.fn();
jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
}));

const mockUseSendLeagueMessageMutation = jest.fn();
const mockUseGetLeagueTeamsQuery = jest.fn();
const mockUseGetLeagueAnnouncementsQuery = jest.fn();
const mockUsePostLeagueAnnouncementMutation = jest.fn();
jest.mock('@legacy-sports/graphql', () => ({
  GetLeagueMessages: 'GET_LEAGUE_MESSAGES',
  GetLeagueAnnouncements: 'GET_LEAGUE_ANNOUNCEMENTS',
  useSendLeagueMessageMutation: (...args: unknown[]): unknown =>
    mockUseSendLeagueMessageMutation(...args),
  useGetLeagueTeamsQuery: (...args: unknown[]): unknown =>
    mockUseGetLeagueTeamsQuery(...args),
  useGetLeagueAnnouncementsQuery: (...args: unknown[]): unknown =>
    mockUseGetLeagueAnnouncementsQuery(...args),
  usePostLeagueAnnouncementMutation: (...args: unknown[]): unknown =>
    mockUsePostLeagueAnnouncementMutation(...args),
}));

jest.mock('@legacy-sports/rollbar/native', () => ({
  captureError: jest.fn(),
}));

// Fake shared-socket client whose `.on` registration this spec drives
// directly, mirroring the real WebSocketClient event-emitter contract.
const mockRegisteredHandlers = new Map<string, (n: unknown) => void>();
const fakeClient = {
  on: (type: string, handler: (n: unknown) => void) => {
    mockRegisteredHandlers.set(type, handler);
    return () => mockRegisteredHandlers.delete(type);
  },
};

let mockConnected = true;
jest.mock('../../../context/LeagueWebSocketContext', () => ({
  useLeagueWebSocketClient: () => ({
    client: fakeClient,
    get connected() {
      return mockConnected;
    },
  }),
}));

describe('useLeagueChat — WS notifications are scoped to the viewed league (LS-6301)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegisteredHandlers.clear();
    mockConnected = true;
    mockUseQuery.mockReturnValue({ loading: false, data: undefined });
    mockUseGetLeagueTeamsQuery.mockReturnValue({ data: undefined });
    mockUseGetLeagueAnnouncementsQuery.mockReturnValue({ data: undefined });
    mockUsePostLeagueAnnouncementMutation.mockReturnValue([
      jest.fn(),
      { loading: false },
    ]);
    mockUseSendLeagueMessageMutation.mockReturnValue([
      jest.fn(),
      { loading: false },
    ]);
  });

  it('drops a WS chat notification whose leagueId does not match the viewed league', () => {
    const { result } = renderHook(() => useLeagueChat(1));

    const handler = mockRegisteredHandlers.get(
      ClientNotificationType.LEAGUE_CHAT_MESSAGE,
    );
    expect(handler).toBeDefined();

    // Notification carries leagueId 2 while this hook instance is scoped to
    // league 1 — must be silently dropped, not rendered into league 1's chat.
    void act(() => {
      handler?.({
        type: ClientNotificationType.LEAGUE_CHAT_MESSAGE,
        leagueId: 2,
        messageId: 99,
        senderId: 7,
        senderUsername: 'intruder',
        messageText: 'message from another league',
        timestamp: '2024-01-01T00:00:00Z',
        messageType: 'text',
      });
    });

    expect(result.current.messages).toHaveLength(0);
  });

  it('applies a WS chat notification whose leagueId matches the viewed league', () => {
    const { result } = renderHook(() => useLeagueChat(1));

    const handler = mockRegisteredHandlers.get(
      ClientNotificationType.LEAGUE_CHAT_MESSAGE,
    );

    void act(() => {
      handler?.({
        type: ClientNotificationType.LEAGUE_CHAT_MESSAGE,
        leagueId: 1,
        messageId: 100,
        senderId: 7,
        senderUsername: 'teammate',
        messageText: 'message from this league',
        timestamp: '2024-01-01T00:00:00Z',
        messageType: 'text',
      });
    });

    expect(result.current.messages.map((m) => m.messageText)).toEqual([
      'message from this league',
    ]);
  });
});

describe('useLeagueChat — @mention roster (LS-9097)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegisteredHandlers.clear();
    mockConnected = true;
    mockUseQuery.mockReturnValue({ loading: false, data: undefined });
    mockUseSendLeagueMessageMutation.mockReturnValue([
      jest.fn(),
      { loading: false },
    ]);
    mockUseGetLeagueAnnouncementsQuery.mockReturnValue({ data: undefined });
    mockUsePostLeagueAnnouncementMutation.mockReturnValue([
      jest.fn(),
      { loading: false },
    ]);
  });

  it('derives mention candidates from the league team roster', () => {
    mockUseGetLeagueTeamsQuery.mockReturnValue({
      data: {
        leagueTeams: [
          { id: 1, name: 'Wolfpack', managerId: 10 },
          { id: 2, name: 'Bears', managerId: 11 },
          { id: 3, name: null, managerId: 12 },
          { id: 4, name: 'No Manager', managerId: null },
        ],
      },
    });

    const { result } = renderHook(() => useLeagueChat(1));

    expect(result.current.mentionCandidates).toEqual([
      { userId: 10, label: 'Wolfpack' },
      { userId: 11, label: 'Bears' },
    ]);
  });

  it('returns no mention candidates when the roster has not loaded', () => {
    mockUseGetLeagueTeamsQuery.mockReturnValue({ data: undefined });

    const { result } = renderHook(() => useLeagueChat(1));

    expect(result.current.mentionCandidates).toEqual([]);
  });
});

describe('useLeagueChat — offline queueing (LS-9097)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockRegisteredHandlers.clear();
    mockConnected = true;
    mockUseQuery.mockReturnValue({ loading: false, data: undefined });
    mockUseGetLeagueTeamsQuery.mockReturnValue({ data: undefined });
    mockUseGetLeagueAnnouncementsQuery.mockReturnValue({ data: undefined });
    mockUsePostLeagueAnnouncementMutation.mockReturnValue([
      jest.fn(),
      { loading: false },
    ]);
    await AsyncStorage.clear();
  });

  it('queues a message instead of sending it while disconnected', async () => {
    mockConnected = false;
    const sendMutation = jest.fn();
    mockUseSendLeagueMessageMutation.mockReturnValue([
      sendMutation,
      { loading: false },
    ]);

    const { result } = renderHook(() => useLeagueChat(1));

    await act(async () => {
      await result.current.sendMessage('queued while offline');
    });

    expect(sendMutation).not.toHaveBeenCalled();
    expect(
      result.current.messages.find(
        (m) => m.messageText === 'queued while offline',
      ),
    ).toMatchObject({ pending: true });
  });

  it('flushes the queue once the socket reconnects', async () => {
    mockConnected = false;
    const sendMutation = jest.fn(
      (options: {
        variables: { leagueId: number; messageText: string; gifUrl?: string };
        onCompleted?: (data: unknown) => void;
      }) => {
        options.onCompleted?.({
          sendLeagueMessage: {
            id: 55,
            userId: 1,
            username: 'me',
            messageText: 'queued while offline',
            messageType: 'text',
            timestamp: '2026-01-01T00:00:00Z',
          },
        });
        return Promise.resolve();
      },
    );
    mockUseSendLeagueMessageMutation.mockReturnValue([
      sendMutation,
      { loading: false },
    ]);

    const { result, rerender } = renderHook(() => useLeagueChat(1));

    await act(async () => {
      await result.current.sendMessage('queued while offline');
    });
    expect(result.current.messages.some((m) => m.pending)).toBe(true);

    mockConnected = true;
    await act(() => {
      rerender(undefined);
    });

    await waitFor(() => {
      expect(sendMutation).toHaveBeenCalledTimes(1);
    });
    expect(sendMutation.mock.calls[0][0].variables.messageText).toBe(
      'queued while offline',
    );

    await waitFor(() => {
      expect(result.current.messages.some((m) => m.pending)).toBe(false);
    });
    expect(result.current.messages.map((m) => m.messageText)).toContain(
      'queued while offline',
    );
  });
});

describe('useLeagueChat — commissioner announcements (LS-6303 / FLD-051)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegisteredHandlers.clear();
    mockConnected = true;
    mockUseQuery.mockReturnValue({ loading: false, data: undefined });
    mockUseGetLeagueTeamsQuery.mockReturnValue({ data: undefined });
    mockUseSendLeagueMessageMutation.mockReturnValue([
      jest.fn(),
      { loading: false },
    ]);
  });

  it('maps getLeagueAnnouncements results to the flat announcement shape', () => {
    mockUseGetLeagueAnnouncementsQuery.mockReturnValue({
      data: {
        getLeagueAnnouncements: [
          {
            id: 5,
            messageText: 'Trade deadline is Friday!',
            timestamp: '2026-03-31T10:00:00Z',
            sender: { username: 'CommishBob' },
          },
        ],
      },
    });
    mockUsePostLeagueAnnouncementMutation.mockReturnValue([
      jest.fn(),
      { loading: false },
    ]);

    const { result } = renderHook(() => useLeagueChat(1));

    expect(result.current.announcements).toEqual([
      {
        id: 5,
        username: 'CommishBob',
        messageText: 'Trade deadline is Friday!',
        createdAt: '2026-03-31T10:00:00Z',
      },
    ]);
  });

  it('returns no announcements when none have been posted', () => {
    mockUseGetLeagueAnnouncementsQuery.mockReturnValue({ data: undefined });
    mockUsePostLeagueAnnouncementMutation.mockReturnValue([
      jest.fn(),
      { loading: false },
    ]);

    const { result } = renderHook(() => useLeagueChat(1));

    expect(result.current.announcements).toEqual([]);
  });

  it('posts an announcement with the trimmed text', async () => {
    mockUseGetLeagueAnnouncementsQuery.mockReturnValue({ data: undefined });
    const postMutation = jest.fn().mockResolvedValue(undefined);
    mockUsePostLeagueAnnouncementMutation.mockReturnValue([
      postMutation,
      { loading: false },
    ]);

    const { result } = renderHook(() => useLeagueChat(1));

    await act(async () => {
      await result.current.postAnnouncement('  Fees due Monday  ');
    });

    expect(postMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { leagueId: 1, messageText: 'Fees due Monday' },
      }),
    );
  });

  it('does not post an empty announcement', async () => {
    mockUseGetLeagueAnnouncementsQuery.mockReturnValue({ data: undefined });
    const postMutation = jest.fn().mockResolvedValue(undefined);
    mockUsePostLeagueAnnouncementMutation.mockReturnValue([
      postMutation,
      { loading: false },
    ]);

    const { result } = renderHook(() => useLeagueChat(1));

    await act(async () => {
      await result.current.postAnnouncement('   ');
    });

    expect(postMutation).not.toHaveBeenCalled();
  });
});
