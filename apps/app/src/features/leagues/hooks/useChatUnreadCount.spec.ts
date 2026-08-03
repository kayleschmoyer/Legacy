import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useChatUnreadCount } from './useChatUnreadCount';

const mockUseQuery = jest.fn();
jest.mock('@apollo/client/react', () => ({
  useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
}));

jest.mock('@legacy-sports/graphql', () => ({
  GetLeagueMessages: 'GET_LEAGUE_MESSAGES',
}));

const mockGetLastReadChatMessageId = jest.fn();
const mockSetLastReadChatMessageId = jest.fn();
jest.mock('../../../common/utilities/lastReadChatMessage', () => ({
  getLastReadChatMessageId: (...args: unknown[]): unknown =>
    mockGetLastReadChatMessageId(...args),
  setLastReadChatMessageId: (...args: unknown[]): unknown =>
    mockSetLastReadChatMessageId(...args),
}));

const MESSAGES = [
  { id: 1, sender: { id: 7 }, userId: 7 },
  { id: 2, sender: { id: 1 }, userId: 1 }, // authored by "me" (userId 1)
  { id: 3, sender: { id: 7 }, userId: 7 },
];

describe('useChatUnreadCount', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockUseQuery.mockReturnValue({
      data: { getLeagueMessages: MESSAGES },
    });
    mockGetLastReadChatMessageId.mockResolvedValue(null);
  });

  it('treats every message not authored by the viewer as unread when nothing has been read yet', async () => {
    const { result } = renderHook(() => useChatUnreadCount(1, 1));

    await waitFor(() => {
      // ids 1 and 3 are from another user (7); id 2 is the viewer's own message.
      expect(result.current.unreadCount).toBe(2);
    });
  });

  it('excludes messages at or below the persisted last-read id', async () => {
    mockGetLastReadChatMessageId.mockResolvedValue(1);
    const { result } = renderHook(() => useChatUnreadCount(1, 1));

    await waitFor(() => {
      // Only id 3 (>1, not authored by viewer) counts now.
      expect(result.current.unreadCount).toBe(1);
    });
  });

  it('excludes the viewer’s own messages from the count', async () => {
    // Viewer is userId 7 here — ids 1 and 3 are the viewer's own messages
    // (excluded); only id 2 (authored by userId 1) counts as unread.
    const { result } = renderHook(() => useChatUnreadCount(1, 7));

    await waitFor(() => {
      expect(result.current.unreadCount).toBe(1);
    });
  });

  it('markRead persists the newest known message id and clears the count', async () => {
    const { result } = renderHook(() => useChatUnreadCount(5, 1));

    await waitFor(() => expect(result.current.unreadCount).toBe(2));

    await act(() => {
      result.current.markRead();
    });

    expect(mockSetLastReadChatMessageId).toHaveBeenCalledWith(5, 3);
    await waitFor(() => expect(result.current.unreadCount).toBe(0));
  });

  it('does not call markRead’s persistence when there are no messages', async () => {
    mockUseQuery.mockReturnValue({ data: { getLeagueMessages: [] } });
    const { result } = renderHook(() => useChatUnreadCount(1, 1));

    await act(() => {
      result.current.markRead();
    });

    expect(mockSetLastReadChatMessageId).not.toHaveBeenCalled();
  });
});
