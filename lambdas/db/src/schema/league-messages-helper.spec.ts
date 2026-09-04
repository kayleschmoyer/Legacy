import {
  persistAndBroadcastLeagueMessage,
  postSystemLeagueMessage,
} from './league-messages-helper';

function makeDb(returningValue: unknown[]) {
  const values = jest.fn().mockReturnValue({
    returning: jest.fn().mockResolvedValue(returningValue),
  });
  const insert = jest.fn().mockReturnValue({ values });
  return { db: { insert } as never, values, insert };
}

describe('persistAndBroadcastLeagueMessage (LS-9666)', () => {
  it('persists the message and broadcasts over the WebSocket path', async () => {
    const { db, values } = makeDb([
      { id: 1, timestamp: '2026-01-01 00:00:00+00' },
    ]);
    const notifyLeagueChatMessage = jest.fn().mockResolvedValue(undefined);

    const msg = await persistAndBroadcastLeagueMessage(
      db,
      { notifyLeagueChatMessage } as never,
      {
        leagueId: 5,
        userId: 9,
        senderUsername: 'alice',
        messageText: 'hi',
        messageType: 'text',
      },
    );

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        leagueId: 5,
        userId: 9,
        messageText: 'hi',
        messageType: 'text',
        containsProfanity: false,
      }),
    );
    expect(msg).toMatchObject({ id: 1 });
    expect(notifyLeagueChatMessage).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        senderId: 9,
        senderUsername: 'alice',
        messageType: 'text',
      }),
    );
  });

  it('never throws when the notification service broadcast fails', async () => {
    const { db } = makeDb([{ id: 2, timestamp: null }]);
    const notifyLeagueChatMessage = jest
      .fn()
      .mockRejectedValue(new Error('ws down'));

    await expect(
      persistAndBroadcastLeagueMessage(
        db,
        { notifyLeagueChatMessage } as never,
        {
          leagueId: 5,
          userId: null,
          senderUsername: 'System',
          messageText: 'system event',
          messageType: 'system_scoring_changed',
        },
      ),
    ).resolves.toMatchObject({ id: 2 });
  });

  it('skips broadcasting when no notification service is provided', async () => {
    const { db } = makeDb([{ id: 3, timestamp: null }]);

    await expect(
      persistAndBroadcastLeagueMessage(db, undefined, {
        leagueId: 5,
        userId: null,
        senderUsername: 'System',
        messageText: 'system event',
      }),
    ).resolves.toMatchObject({ id: 3 });
  });
});

describe('postSystemLeagueMessage (LS-9666)', () => {
  it('always posts with userId null and the given system messageType', async () => {
    const { db, values } = makeDb([{ id: 4, timestamp: null }]);

    await postSystemLeagueMessage(db, undefined, {
      leagueId: 7,
      messageType: 'system_scores_recomputed',
      messageText: 'Scores were recomputed for 3 matchups',
      metadata: { matchupCount: 3, reason: 'commissioner_recalculation' },
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        leagueId: 7,
        userId: null,
        messageType: 'system_scores_recomputed',
        metadata: { matchupCount: 3, reason: 'commissioner_recalculation' },
      }),
    );
  });

  it('never throws when persisting fails — the triggering mutation already succeeded', async () => {
    const db = {
      insert: jest.fn().mockImplementation(() => {
        throw new Error('db down');
      }),
    } as never;

    await expect(
      postSystemLeagueMessage(db, undefined, {
        leagueId: 7,
        messageType: 'system_scoring_changed',
        messageText: 'settings changed',
        metadata: {},
      }),
    ).resolves.toBeNull();
  });
});
