import { act, renderHook } from '@testing-library/react-native';
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
jest.mock('@legacy-sports/graphql', () => ({
  GetLeagueMessages: 'GET_LEAGUE_MESSAGES',
  useSendLeagueMessageMutation: (...args: unknown[]): unknown =>
    mockUseSendLeagueMessageMutation(...args),
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

jest.mock('../../../context/LeagueWebSocketContext', () => ({
  useLeagueWebSocketClient: () => ({ client: fakeClient, connected: true }),
}));

describe('useLeagueChat — WS notifications are scoped to the viewed league (LS-6301)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockRegisteredHandlers.clear();
    mockUseQuery.mockReturnValue({ loading: false, data: undefined });
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
