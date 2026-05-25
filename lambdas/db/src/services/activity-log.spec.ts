import { logDraftPickActivity } from './activity-log';

const mockWarn = jest.fn();
const mockError = jest.fn();

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    warn: (...args: unknown[]) => mockWarn(...args),
    error: (...args: unknown[]) => mockError(...args),
  },
}));

// Minimal drizzle-like select chain that resolves with the given rows array.
function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };
  return chain;
}

// Drizzle select chain that rejects.
function makeRejectingSelectChain(err: Error) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockRejectedValue(err),
  };
  return chain;
}

function makeInsertChain() {
  const values = jest.fn().mockResolvedValue(undefined);
  const insert = jest.fn().mockReturnValue({ values });
  return { insert, values };
}

const baseData = {
  leagueId: 1,
  teamId: 2,
  actorUserId: 3,
  playerId: 4,
  round: 1,
  pickNumber: 5,
  overallPick: 5,
};

describe('logDraftPickActivity', () => {
  beforeEach(() => {
    mockWarn.mockClear();
    mockError.mockClear();
  });

  it('writes the activity log entry with resolved names on success', async () => {
    const { insert, values } = makeInsertChain();
    const context = {
      db: {
        select: jest
          .fn()
          // First call: players
          .mockReturnValueOnce(
            makeSelectChain([{ firstName: 'Mike', lastName: 'Trout' }]),
          )
          // Second call: teams
          .mockReturnValueOnce(makeSelectChain([{ name: 'Angels' }])),
        insert,
      },
    };

    await logDraftPickActivity(context as never, baseData);

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'draft_pick_made',
        payload: expect.objectContaining({
          playerName: 'Mike Trout',
          teamName: 'Angels',
        }),
      }),
    );
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('still writes the activity log entry when name resolution fails', async () => {
    const { insert, values } = makeInsertChain();
    const context = {
      db: {
        select: jest
          .fn()
          .mockReturnValue(
            makeRejectingSelectChain(new Error('connection pool exhausted')),
          ),
        insert,
      },
    };

    await logDraftPickActivity(context as never, baseData);

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'draft_pick_made',
        payload: expect.not.objectContaining({
          playerName: expect.anything(),
          teamName: expect.anything(),
        }),
      }),
    );
    expect(mockWarn).toHaveBeenCalledWith(
      'Failed to resolve names for draft pick activity (non-fatal)',
      expect.any(Error),
      expect.objectContaining({ leagueId: 1, playerId: 4 }),
    );
    expect(mockError).not.toHaveBeenCalled();
  });

  it('logs warn (not error) and does not throw when insert fails', async () => {
    const dbError = new Error('connection pool exhausted');
    const values = jest.fn().mockRejectedValue(dbError);
    const insert = jest.fn().mockReturnValue({ values });
    const context = {
      db: {
        select: jest
          .fn()
          .mockReturnValueOnce(
            makeSelectChain([{ firstName: 'Mike', lastName: 'Trout' }]),
          )
          .mockReturnValueOnce(makeSelectChain([{ name: 'Angels' }])),
        insert,
      },
    };

    await expect(
      logDraftPickActivity(context as never, baseData),
    ).resolves.toBeUndefined();
    expect(mockWarn).toHaveBeenCalledWith(
      'Failed to insert activity log entry',
      dbError,
      expect.objectContaining({ eventType: 'draft_pick_made', leagueId: 1 }),
    );
    expect(mockError).not.toHaveBeenCalled();
  });

  it('omits teamName from payload when teamId is null', async () => {
    const { insert, values } = makeInsertChain();
    const context = {
      db: {
        select: jest
          .fn()
          .mockReturnValueOnce(
            makeSelectChain([{ firstName: 'Mike', lastName: 'Trout' }]),
          ),
        insert,
      },
    };

    await logDraftPickActivity(context as never, { ...baseData, teamId: null });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ playerName: 'Mike Trout' }),
      }),
    );
    expect(
      (values.mock.calls[0][0] as { payload: Record<string, unknown> }).payload,
    ).not.toHaveProperty('teamName');
  });
});
