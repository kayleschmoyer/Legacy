import { act, renderHook } from '@testing-library/react-native';
import { useDraftChatUnread } from './useDraftChatUnread';

// LS-10593: unread dot keyed on a persisted last-read id.

let mockStored: number | null = null;
const mockGet = jest.fn((_key: unknown) => Promise.resolve(mockStored));
const mockSet = jest.fn();
jest.mock('../common/utilities/lastReadChatMessage', () => ({
  getLastReadChatMessageId: (key: unknown): Promise<number | null> =>
    mockGet(key),
  setLastReadChatMessageId: (...args: unknown[]): unknown => mockSet(...args),
}));

type Props = Parameters<typeof useDraftChatUnread>[0];

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useDraftChatUnread (native)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStored = null;
  });

  it('reads and writes a mock draft by its string key', async () => {
    mockStored = 2;
    const props: Props = {
      storageKey: 'draft-7',
      messages: [{ id: 3, userId: 2 }],
      currentUserId: 1,
      chatOpen: true,
      onNewMessage: jest.fn(),
    };
    renderHook((p: Props) => useDraftChatUnread(p), { initialProps: props });
    await flush();

    expect(mockGet).toHaveBeenCalledWith('draft-7');
    expect(mockSet).toHaveBeenCalledWith('draft-7', 3);
  });

  it('does not notify before the stored id has loaded', () => {
    const onNewMessage = jest.fn();
    renderHook((p: Props) => useDraftChatUnread(p), {
      initialProps: {
        storageKey: 12,
        messages: [{ id: 3, userId: 2 }],
        currentUserId: 1,
        chatOpen: false,
        onNewMessage,
      },
    });

    expect(onNewMessage).not.toHaveBeenCalled();
  });

  it('does not re-notify after the chat is opened and closed again', async () => {
    mockStored = 2;
    const onNewMessage = jest.fn();
    const base: Props = {
      storageKey: 12,
      messages: [{ id: 3, userId: 2 }],
      currentUserId: 1,
      chatOpen: false,
      onNewMessage,
    };
    const { rerender } = renderHook((p: Props) => useDraftChatUnread(p), {
      initialProps: base,
    });
    await flush();
    expect(onNewMessage).toHaveBeenCalledTimes(1);

    rerender({ ...base, chatOpen: true });
    rerender({ ...base, chatOpen: false });

    expect(mockSet).toHaveBeenCalledWith(12, 3);
    expect(onNewMessage).toHaveBeenCalledTimes(1);
  });
});
