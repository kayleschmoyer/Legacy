/**
 * Unit tests for offloadNextPickIfAutoPick (LS-8107, shared with
 * commissionerPick in LS-10593).
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
      drafts: { id: 'id', currentPickDeadline: 'currentPickDeadline' },
    },
  }),
);

const mockGetSeatById = jest.fn();
jest.mock('./participants', () => ({
  getSeatById: (...args: unknown[]) => mockGetSeatById(...args),
}));

const mockTrigger = jest.fn();
jest.mock('./trigger-auto-process', () => ({
  triggerAutoProcessDraftPicks: (...args: unknown[]) => mockTrigger(...args),
}));

import { LOGGER } from '@legacy-sports/logging';
import type { PublicDb } from '@legacy-sports/db-client';

import { offloadNextPickIfAutoPick } from './offload-auto-pick';

const mockLoggerWarn = (LOGGER as unknown as { warn: jest.Mock }).warn;

function makeDb() {
  const set = jest.fn().mockReturnThis();
  const where = jest.fn().mockResolvedValue(undefined);
  const update = jest.fn(() => ({ set, where }));
  return { db: { update } as unknown as PublicDb, update, set };
}

const params = { draftId: 1, leagueId: 10, nextParticipantId: 77 };

describe('offloadNextPickIfAutoPick', () => {
  beforeEach(() => jest.clearAllMocks());

  it('expires the deadline and nudges autoProcessDraftPicks for an auto-pick seat', async () => {
    mockGetSeatById.mockResolvedValue({ autoPick: true });
    const { db, update, set } = makeDb();

    await offloadNextPickIfAutoPick(db, params);
    // Already expired: strictly earlier than any instant after the call
    // (comparing to a pre-call timestamp races the millisecond tick).
    const after = Date.now();

    expect(update).toHaveBeenCalledTimes(1);
    const { currentPickDeadline } = set.mock.calls[0][0] as {
      currentPickDeadline: Date;
    };
    expect(currentPickDeadline.getTime()).toBeLessThan(after);
    expect(mockTrigger).toHaveBeenCalledWith({ leagueId: 10, draftId: 1 });
  });

  it('does nothing for a human seat', async () => {
    mockGetSeatById.mockResolvedValue({ autoPick: false });
    const { db, update } = makeDb();

    await offloadNextPickIfAutoPick(db, params);

    expect(update).not.toHaveBeenCalled();
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('never throws', async () => {
    mockGetSeatById.mockRejectedValue(new Error('db down'));
    const { db } = makeDb();

    await expect(
      offloadNextPickIfAutoPick(db, params),
    ).resolves.toBeUndefined();
    expect(mockLoggerWarn).toHaveBeenCalled();
  });
});
