/**
 * Unit tests for the draft push helpers (LS-10593): "you're on the clock"
 * and "your draft has started".
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/db-client', () =>
  mockDbClientModule({
    PublicSchema: {
      leagueMembers: {
        leagueId: 'leagueId',
        userId: 'userId',
        teamId: 'teamId',
      },
      leagues: { id: 'id', name: 'name' },
    },
  }),
);

const mockGetSeatById = jest.fn();
jest.mock('./participants', () => ({
  getSeatById: (...args: unknown[]) => mockGetSeatById(...args),
}));

const mockGetCurrentDraftPickInfo = jest.fn();
jest.mock('./helpers', () => ({
  getCurrentDraftPickInfo: (...args: unknown[]) =>
    mockGetCurrentDraftPickInfo(...args),
}));

import { LOGGER } from '@legacy-sports/logging';
import type { PublicDb } from '@legacy-sports/db-client';
import type { NotificationPublisher } from '@legacy-sports/aws-utils';

import { notifyDraftStartPushes, notifyOnTheClock } from './on-the-clock-push';

const mockLoggerWarn = (LOGGER as unknown as { warn: jest.Mock }).warn;

function selectSpy(db: PublicDb): jest.Mock {
  return (db as unknown as { select: jest.Mock }).select;
}

/**
 * A db whose `.select().from().where()` resolves to the next queued row set,
 * and whose `.limit()` (league-name lookup) resolves to `leagueRows`.
 */
function makeDb(whereResults: unknown[][], leagueRows: unknown[] = []) {
  const queue = [...whereResults];
  interface Chain {
    from: jest.Mock;
    where: jest.Mock;
  }
  const chain: Chain = {
    from: jest.fn((): Chain => chain),
    where: jest.fn(() => {
      const rows = queue.shift() ?? [];
      return Object.assign(Promise.resolve(rows), {
        limit: jest.fn().mockResolvedValue(leagueRows),
      });
    }),
  };
  return { select: jest.fn(() => chain) } as unknown as PublicDb;
}

function makePublisher() {
  const publishToMany = jest.fn().mockResolvedValue(undefined);
  return {
    publisher: { publishToMany } as unknown as NotificationPublisher,
    publishToMany,
  };
}

const params = {
  draftId: 3,
  leagueId: 9,
  participantId: 77,
  round: 2,
  pickNumber: 4,
};

describe('notifyOnTheClock', () => {
  beforeEach(() => jest.clearAllMocks());

  it("pushes every manager of the on-clock seat's team", async () => {
    mockGetSeatById.mockResolvedValue({
      userId: null,
      teamId: 5,
      autoPick: false,
    });
    const db = makeDb([[{ userId: 1 }, { userId: 2 }, { userId: 1 }]]);
    const { publisher, publishToMany } = makePublisher();

    const pushed = await notifyOnTheClock(db, publisher, params);

    expect(pushed).toEqual([1, 2]);
    expect(publishToMany).toHaveBeenCalledWith([1, 2], {
      notificationType: 'DRAFT_ON_THE_CLOCK',
      title: "You're on the clock!",
      body: "Round 2, Pick 4 — it's your turn to draft.",
      data: { leagueId: 9, draftId: 3 },
    });
  });

  it("prefers the seat's own user_id over league membership", async () => {
    mockGetSeatById.mockResolvedValue({
      userId: 42,
      teamId: 5,
      autoPick: false,
    });
    const db = makeDb([]);
    const { publisher, publishToMany } = makePublisher();

    await notifyOnTheClock(db, publisher, params);

    expect(selectSpy(db)).not.toHaveBeenCalled();
    expect(publishToMany).toHaveBeenCalledWith([42], expect.anything());
  });

  it('skips auto-pick seats', async () => {
    mockGetSeatById.mockResolvedValue({
      userId: 42,
      teamId: 5,
      autoPick: true,
    });
    const { publisher, publishToMany } = makePublisher();

    expect(await notifyOnTheClock(makeDb([]), publisher, params)).toEqual([]);
    expect(publishToMany).not.toHaveBeenCalled();
  });

  it('skips seats with no user', async () => {
    mockGetSeatById.mockResolvedValue({
      userId: null,
      teamId: 5,
      autoPick: false,
    });
    const { publisher, publishToMany } = makePublisher();

    await notifyOnTheClock(makeDb([[]]), publisher, params);

    expect(publishToMany).not.toHaveBeenCalled();
  });

  it('skips mock drafts (no league) and a missing publisher', async () => {
    const { publisher, publishToMany } = makePublisher();

    await notifyOnTheClock(makeDb([]), publisher, {
      ...params,
      leagueId: null,
    });
    await notifyOnTheClock(makeDb([]), null, params);

    expect(mockGetSeatById).not.toHaveBeenCalled();
    expect(publishToMany).not.toHaveBeenCalled();
  });

  it('never throws — failures are logged', async () => {
    mockGetSeatById.mockRejectedValue(new Error('db down'));
    const { publisher } = makePublisher();

    await expect(
      notifyOnTheClock(makeDb([]), publisher, params),
    ).resolves.toEqual([]);
    expect(mockLoggerWarn).toHaveBeenCalled();
  });
});

describe('notifyDraftStartPushes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends on-the-clock to the first pick and DRAFT_STARTED to everyone else', async () => {
    mockGetCurrentDraftPickInfo.mockResolvedValue({
      participantId: 77,
      round: 1,
      pickNumber: 1,
      isComplete: false,
    });
    mockGetSeatById.mockResolvedValue({
      userId: null,
      teamId: 5,
      autoPick: false,
    });
    const db = makeDb(
      [
        [{ userId: 1 }], // on-clock seat's team managers
        [], // league-name lookup (resolved through .limit)
        [{ userId: 1 }, { userId: 2 }, { userId: 3 }], // league members
      ],
      [{ name: 'Sluggers' }],
    );
    const { publisher, publishToMany } = makePublisher();

    await notifyDraftStartPushes(db, publisher, { draftId: 3, leagueId: 9 });

    expect(publishToMany).toHaveBeenCalledTimes(2);
    expect(publishToMany).toHaveBeenNthCalledWith(
      1,
      [1],
      expect.objectContaining({ notificationType: 'DRAFT_ON_THE_CLOCK' }),
    );
    expect(publishToMany).toHaveBeenNthCalledWith(2, [2, 3], {
      notificationType: 'DRAFT_STARTED',
      title: 'Your draft has started!',
      body: 'The Sluggers draft is live — join the draft room.',
      data: { leagueId: 9, draftId: 3 },
    });
  });

  it('sends DRAFT_STARTED to every member when the first seat auto-picks', async () => {
    mockGetCurrentDraftPickInfo.mockResolvedValue({
      participantId: 77,
      round: 1,
      pickNumber: 1,
      isComplete: false,
    });
    mockGetSeatById.mockResolvedValue({
      userId: null,
      teamId: 5,
      autoPick: true,
    });
    const db = makeDb(
      [[], [{ userId: 1 }, { userId: 2 }]],
      [{ name: 'Sluggers' }],
    );
    const { publisher, publishToMany } = makePublisher();

    await notifyDraftStartPushes(db, publisher, { draftId: 3, leagueId: 9 });

    expect(publishToMany).toHaveBeenCalledTimes(1);
    expect(publishToMany).toHaveBeenCalledWith(
      [1, 2],
      expect.objectContaining({ notificationType: 'DRAFT_STARTED' }),
    );
  });

  it('skips mock drafts and never throws', async () => {
    const { publisher, publishToMany } = makePublisher();
    await notifyDraftStartPushes(makeDb([]), publisher, {
      draftId: 3,
      leagueId: null,
    });
    expect(publishToMany).not.toHaveBeenCalled();

    mockGetCurrentDraftPickInfo.mockRejectedValue(new Error('boom'));
    await expect(
      notifyDraftStartPushes(makeDb([]), publisher, {
        draftId: 3,
        leagueId: 9,
      }),
    ).resolves.toBeUndefined();
    expect(mockLoggerWarn).toHaveBeenCalled();
  });
});
