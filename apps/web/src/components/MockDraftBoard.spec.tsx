import React from 'react';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { MockDraftBoardScreen } from './MockDraftBoard';

// The board itself is covered in shared-components; this suite only checks
// which sport and draft id the route hands it (LS-10489).
const mockBoardProps = jest.fn();

jest.mock('@legacy-sports/shared-components/elite-draft', () => ({
  DraftChatTab: () => null,
  EliteDraftBoardScreen: (props: Record<string, unknown>) => {
    mockBoardProps(props);
    return null;
  },
}));

let mockDraftMessages:
  | { id: number; userId: number; messageText: string }[]
  | undefined;
jest.mock('@apollo/client/react', () => ({
  useQuery: () => ({
    data: mockDraftMessages ? { draftMessages: mockDraftMessages } : undefined,
    loading: false,
    refetch: jest.fn(),
  }),
  useMutation: () => [jest.fn(), { loading: false }],
}));

jest.mock('@legacy-sports/graphql', () => ({
  GetDraftMessages: {},
  SendDraftMessage: {},
}));

jest.mock('../config/environment', () => ({
  env: { websocketUrl: 'ws://test' },
}));

function renderAt(path: string): void {
  const router = createMemoryRouter(
    [
      {
        path: '/baseball/mock-draft/:draftId',
        element: <MockDraftBoardScreen />,
      },
      {
        path: '/football/mock-draft/:draftId',
        element: <MockDraftBoardScreen />,
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

function lastBoardProps(): Record<string, unknown> {
  const calls = mockBoardProps.mock.calls;
  return calls[calls.length - 1][0] as Record<string, unknown>;
}

describe('MockDraftBoardScreen', () => {
  beforeEach(() => {
    mockBoardProps.mockClear();
    mockDraftMessages = undefined;
    window.localStorage.clear();
  });

  it('renders the football board on the football mock draft route', () => {
    renderAt('/football/mock-draft/42');

    expect(lastBoardProps()).toMatchObject({
      sport: 'football',
      draftId: 42,
      leagueId: null,
    });
  });

  it('renders the baseball board on the baseball mock draft route', () => {
    renderAt('/baseball/mock-draft/7');

    expect(lastBoardProps()).toMatchObject({ sport: 'baseball', draftId: 7 });
  });

  // LS-10593: unread is keyed on a persisted last-read id per mock draft
  // (`draft-<id>`) rather than a per-mount message count.
  describe('chat unread tracking', () => {
    const KEY = 'ls.lastReadChatMessage.draft-7';
    type RenderChatTab = (props: Record<string, unknown>) => React.ReactNode;

    function renderConnector(props: {
      chatOpen?: boolean;
      onNewMessage: () => void;
    }): { rerender: (next: typeof props) => void } {
      renderAt('/baseball/mock-draft/7');
      const renderChatTab = lastBoardProps().renderChatTab as RenderChatTab;
      const view = (p: typeof props) => (
        <>{renderChatTab({ leagueId: null, draftId: 7, userId: 1, ...p })}</>
      );
      const utils = render(view(props));
      return { rerender: (next) => utils.rerender(view(next)) };
    }

    it('does not raise unread for already-read history', () => {
      window.localStorage.setItem(KEY, '4');
      mockDraftMessages = [
        { id: 3, userId: 2, messageText: 'hi' },
        { id: 4, userId: 2, messageText: 'gl' },
      ];
      const onNewMessage = jest.fn();
      renderConnector({ chatOpen: false, onNewMessage });

      expect(onNewMessage).not.toHaveBeenCalled();
    });

    it('raises unread for a new message from someone else while closed', () => {
      window.localStorage.setItem(KEY, '4');
      mockDraftMessages = [{ id: 4, userId: 2, messageText: 'gl' }];
      const onNewMessage = jest.fn();
      const { rerender } = renderConnector({ chatOpen: false, onNewMessage });

      mockDraftMessages = [
        { id: 4, userId: 2, messageText: 'gl' },
        { id: 5, userId: 3, messageText: 'nice pick' },
      ];
      rerender({ chatOpen: false, onNewMessage });

      expect(onNewMessage).toHaveBeenCalledTimes(1);
    });

    it('persists the newest message as read when chat is open', () => {
      mockDraftMessages = [{ id: 9, userId: 2, messageText: 'hi' }];
      renderConnector({ chatOpen: true, onNewMessage: jest.fn() });

      expect(window.localStorage.getItem(KEY)).toBe('9');
    });
  });
});
