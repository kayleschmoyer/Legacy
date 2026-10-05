/**
 * Unit tests for executePickEffects' on-the-clock push (LS-10593).
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
    createBadgeService: jest.fn(() => ({
      evaluateDraftBadges: jest.fn().mockResolvedValue([]),
    })),
  }),
);

jest.mock('@legacy-sports/utils/node', () => ({
  getDbOptions: jest.fn(() => ({})),
}));

jest.mock('../matchups/mutations', () => ({
  createAllMatchupsForLeague: jest.fn().mockResolvedValue({ matchupCount: 0 }),
}));

jest.mock('../../services/activity-log', () => ({
  logDraftPickActivity: jest.fn().mockResolvedValue(undefined),
}));

const mockNotifyOnTheClock = jest.fn().mockResolvedValue([]);
jest.mock('./on-the-clock-push', () => ({
  notifyOnTheClock: (...args: unknown[]) => mockNotifyOnTheClock(...args),
}));

import type { PublicDb } from '@legacy-sports/db-client';

import {
  executePickEffects,
  type PickEffectsParams,
} from './draft-pick-effects';

const db = {} as PublicDb;
const publisher = { publishToMany: jest.fn() };

function makeParams(
  overrides: Partial<PickEffectsParams['pickResult']> = {},
  extra: Partial<PickEffectsParams> = {},
): PickEffectsParams {
  return {
    db,
    notificationService: null,
    notificationPublisher: publisher as never,
    draftLeagueId: 10,
    draftId: 1,
    selectionMethod: 'standard',
    pickResult: {
      draftPick: { id: 100 },
      autoPlayerId: 42,
      autoPickReason: 'timeout',
      isDraftComplete: false,
      currentPickInfo: {
        teamId: 5,
        participantId: 55,
        round: 1,
        pickNumber: 1,
        overallPick: 1,
      },
      nextPickInfo: {
        teamId: 6,
        participantId: 66,
        round: 1,
        pickNumber: 2,
        overallPick: 2,
      },
      nextDeadline: new Date(Date.now() + 60_000),
      ...overrides,
    },
    ...extra,
  };
}

describe('executePickEffects — on-the-clock push (LS-10593)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pushes the seat now on the clock after an auto-pick', async () => {
    await executePickEffects(makeParams());

    expect(mockNotifyOnTheClock).toHaveBeenCalledWith(db, publisher, {
      draftId: 1,
      leagueId: 10,
      participantId: 66,
      round: 1,
      pickNumber: 2,
    });
  });

  it('skips the push when the chained deadline already expired (seat is auto-picked next)', async () => {
    await executePickEffects(
      makeParams({ nextDeadline: new Date(Date.now() - 1_000) }),
    );

    expect(mockNotifyOnTheClock).not.toHaveBeenCalled();
  });

  it('skips the push when the draft is complete', async () => {
    await executePickEffects(
      makeParams({
        isDraftComplete: true,
        nextPickInfo: null,
        nextDeadline: null,
      }),
    );

    expect(mockNotifyOnTheClock).not.toHaveBeenCalled();
  });

  it('skips the push for mock drafts', async () => {
    await executePickEffects(
      makeParams({}, { isMock: true, draftLeagueId: null }),
    );

    expect(mockNotifyOnTheClock).not.toHaveBeenCalled();
  });
});
