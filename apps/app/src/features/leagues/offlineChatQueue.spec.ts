import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getQueuedMessages,
  type QueuedChatMessage,
  setQueuedMessages,
} from './offlineChatQueue';

describe('offlineChatQueue', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('returns an empty array when nothing is persisted', async () => {
    expect(await getQueuedMessages(1)).toEqual([]);
  });

  it('round-trips a persisted queue for a league', async () => {
    const queue: QueuedChatMessage[] = [
      {
        localId: 'local-1',
        messageText: 'hello',
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        localId: 'local-2',
        messageText: '',
        gifUrl: 'https://media.giphy.com/test.gif',
        createdAt: '2026-01-01T00:01:00Z',
      },
    ];

    setQueuedMessages(1, queue);
    await Promise.resolve(); // let the fire-and-forget AsyncStorage.setItem settle

    expect(await getQueuedMessages(1)).toEqual(queue);
  });

  it('scopes queues per league', async () => {
    setQueuedMessages(1, [
      {
        localId: 'a',
        messageText: 'league 1',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    setQueuedMessages(2, [
      {
        localId: 'b',
        messageText: 'league 2',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    await Promise.resolve();

    expect(await getQueuedMessages(1)).toEqual([
      {
        localId: 'a',
        messageText: 'league 1',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    expect(await getQueuedMessages(2)).toEqual([
      {
        localId: 'b',
        messageText: 'league 2',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
  });

  it('clears the queue when persisted with an empty array', async () => {
    setQueuedMessages(1, [
      { localId: 'a', messageText: 'hi', createdAt: '2026-01-01T00:00:00Z' },
    ]);
    await Promise.resolve();
    expect(await getQueuedMessages(1)).toHaveLength(1);

    setQueuedMessages(1, []);
    await Promise.resolve();
    expect(await getQueuedMessages(1)).toEqual([]);
  });

  it('ignores an invalid leagueId when persisting', () => {
    expect(() =>
      setQueuedMessages(0, [
        { localId: 'a', messageText: 'hi', createdAt: '2026-01-01T00:00:00Z' },
      ]),
    ).not.toThrow();
  });

  it('returns an empty array for malformed persisted JSON', async () => {
    await AsyncStorage.setItem('ls.chatOfflineQueue.1', '{not valid json');
    expect(await getQueuedMessages(1)).toEqual([]);
  });
});
