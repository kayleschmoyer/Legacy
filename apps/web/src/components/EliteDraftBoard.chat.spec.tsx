import React, { useContext } from 'react';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { EliteDraftBoardScreen } from './EliteDraftBoard';
import { LeagueWebSocketContext } from '../context/LeagueWebSocketContext';

// LS-10593: the league draft room's league socket + the Chat tab connector's
// persisted-last-read unread tracking. The board itself is covered in
// shared-components; it is stubbed here to capture its props and the
// LeagueWebSocketContext value it sees.

const mockBoardProps = jest.fn();
const mockBoardSocketContext = jest.fn();

function MockBoard(props: Record<string, unknown>): null {
  mockBoardProps(props);
  mockBoardSocketContext(useContext(LeagueWebSocketContext));
  return null;
}

jest.mock('@legacy-sports/shared-components/elite-draft', () => ({
  DraftChatTab: () => null,
  LEAVES_DRAFT_ATTRIBUTE: 'data-leaves-draft',
  EliteDraftBoardScreen: (props: Record<string, unknown>) => MockBoard(props),
}));

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({
    user: { id: 1 },
    isLoading: false,
    token: 'jwt-token',
  }),
}));

jest.mock('../features/baseball/LeagueChatTab', () => ({
  LeagueChatTab: () => null,
}));

jest.mock('../config/environment', () => ({
  env: { websocketUrl: 'ws://test' },
}));

const mockSocketClient = { id: 'league-socket' };
const mockLifecycle = jest.fn();
jest.mock('../hooks/useLeagueWebSocketLifecycle', () => ({
  useLeagueWebSocketLifecycle: (...args: unknown[]): unknown => {
    mockLifecycle(...args);
    return { client: mockSocketClient, connected: true };
  },
}));

interface MockChatMessage {
  id: number;
  userId: number | null;
  username: string;
  messageText: string;
}
let mockChatMessages: MockChatMessage[] = [];
jest.mock('../hooks/useLeagueChat', () => ({
  useLeagueChat: () => ({
    messages: mockChatMessages,
    loading: false,
    sending: false,
    sendError: null,
    sendMessage: jest.fn(),
  }),
}));

const STORAGE_KEY = 'ls.lastReadChatMessage.12';

function renderBoard(): void {
  const router = createMemoryRouter(
    [
      {
        path: '/baseball/league/:id/draft',
        element: <EliteDraftBoardScreen />,
      },
    ],
    { initialEntries: ['/baseball/league/12/draft'] },
  );
  render(<RouterProvider router={router} />);
}

type RenderChatTab = (props: Record<string, unknown>) => React.ReactNode;

function renderConnector(props: {
  chatOpen?: boolean;
  onNewMessage: () => void;
}): { rerender: (next: typeof props) => void } {
  renderBoard();
  const renderChatTab = (
    mockBoardProps.mock.calls[0][0] as { renderChatTab: RenderChatTab }
  ).renderChatTab;
  const view = (p: typeof props) => (
    <>{renderChatTab({ leagueId: 12, userId: 1, ...p })}</>
  );
  const utils = render(view(props));
  return { rerender: (next) => utils.rerender(view(next)) };
}

const history: MockChatMessage[] = [
  { id: 10, userId: 2, username: 'a', messageText: 'hi' },
  { id: 11, userId: 1, username: 'me', messageText: 'yo' },
];

describe('EliteDraftBoardScreen (web wrapper) — chat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChatMessages = [];
    window.localStorage.clear();
  });

  // League chat only fans out to sockets registered under the league id, so
  // without its own league socket the draft room never received messages.
  it('opens a league socket for the draft league and provides it to the board', () => {
    renderBoard();

    expect(mockLifecycle).toHaveBeenLastCalledWith({
      leagueId: 12,
      isAuthenticated: true,
      authToken: 'jwt-token',
    });
    expect(mockBoardSocketContext).toHaveBeenLastCalledWith({
      client: mockSocketClient,
      connected: true,
    });
  });

  it('does not raise unread for already-read history on re-entry', () => {
    window.localStorage.setItem(STORAGE_KEY, '11');
    mockChatMessages = history;
    const onNewMessage = jest.fn();
    renderConnector({ chatOpen: false, onNewMessage });

    expect(onNewMessage).not.toHaveBeenCalled();
  });

  it('raises unread once for a new message from someone else while closed', () => {
    window.localStorage.setItem(STORAGE_KEY, '11');
    mockChatMessages = history;
    const onNewMessage = jest.fn();
    const { rerender } = renderConnector({ chatOpen: false, onNewMessage });

    mockChatMessages = [
      ...history,
      { id: 12, userId: 3, username: 'b', messageText: 'pick!' },
    ];
    rerender({ chatOpen: false, onNewMessage });
    // A fresh onNewMessage identity must not re-fire for the same message.
    const nextOnNewMessage = jest.fn();
    rerender({ chatOpen: false, onNewMessage: nextOnNewMessage });

    expect(onNewMessage).toHaveBeenCalledTimes(1);
    expect(nextOnNewMessage).not.toHaveBeenCalled();
  });

  it('treats an undefined chatOpen (wide layout) as closed without re-firing', () => {
    window.localStorage.setItem(STORAGE_KEY, '10');
    mockChatMessages = history;
    const onNewMessage = jest.fn();
    const { rerender } = renderConnector({ onNewMessage });
    rerender({ onNewMessage });

    // Only id 11 is newer than last-read, and it's the viewer's own.
    expect(onNewMessage).not.toHaveBeenCalled();
  });

  it('persists the newest message as read when chat is open', () => {
    window.localStorage.setItem(STORAGE_KEY, '5');
    mockChatMessages = history;
    const onNewMessage = jest.fn();
    renderConnector({ chatOpen: true, onNewMessage });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('11');
    expect(onNewMessage).not.toHaveBeenCalled();
  });
});
