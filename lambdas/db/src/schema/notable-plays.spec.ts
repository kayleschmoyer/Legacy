/**
 * Tests for the notable-play cache refresh mutation (LS-9095):
 *   - resolveRefreshNotablePlays
 *   - filmRoomUrlForPlayId
 *
 * Covers:
 *   - UNAUTHENTICATED guard: unauthenticated requests are rejected
 *   - Graceful no-op when the provider cannot be constructed (production
 *     guard for mlb-statsapi) or lacks play-level feed support
 *   - Happy path: final games scanned, best play per player kept, cache
 *     rows upserted only for players known to the players table
 *   - Per-game errors are collected without aborting the run
 */

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/rollbar', () => ({
  getRollbarConfigFromEnv: jest.fn(),
  initRollbar: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureError: jest.fn(),
  withRollbar: jest.fn((fn) => fn),
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  createNotificationService: jest.fn(),
  retrieveSecretParameterValue: jest.fn(),
}));

const mockFilterKnownMlbPlayerIds = jest.fn();
const mockUpsertNotablePlays = jest.fn();
const mockGetNotablePlaysByMlbIds = jest.fn();

jest.mock('@legacy-sports/db-client', () => ({
  createDatabaseService: jest.fn(() => ({
    players: {
      filterKnownMlbPlayerIds: mockFilterKnownMlbPlayerIds,
      upsertNotablePlays: mockUpsertNotablePlays,
      getNotablePlaysByMlbIds: mockGetNotablePlaysByMlbIds,
    },
  })),
  PublicSchema: {
    leagueMembers: {
      leagueId: 'league_members.league_id',
      userId: 'league_members.user_id',
      permissionLevel: 'league_members.permission_level',
    },
  },
}));

jest.mock('./scoreboard', () => ({
  getMlbDataProvider: jest.fn(),
}));

import type { MlbDataProvider, NotablePlay } from '@legacy-sports/mlb-client';

import {
  filmRoomUrlForPlayId,
  resolveRefreshNotablePlays,
} from './notable-plays';
import { getMlbDataProvider } from './scoreboard';
import { type Context } from './builder';

const mockGetMlbDataProvider = getMlbDataProvider as jest.MockedFunction<
  typeof getMlbDataProvider
>;

function makeContext(
  partial: Pick<Context, 'isSystemRequest' | 'user'>,
): Context {
  return partial as unknown as Context;
}

const systemContext = makeContext({ isSystemRequest: true, user: null });

function makePlay(overrides: Partial<NotablePlay> = {}): NotablePlay {
  return {
    mlbPlayerId: 592450,
    playerRole: 'batter',
    gamePk: 777,
    gameDate: '2026-08-05',
    playId: 'abc-123',
    eventType: 'home_run',
    description: 'Aaron Judge homers (40) on a fly ball.',
    exitVelocity: 112.4,
    launchAngle: 28,
    hitDistance: 441,
    pitchSpeed: null,
    pitchType: null,
    notabilityScore: 150,
    ...overrides,
  };
}

describe('filmRoomUrlForPlayId', () => {
  it('builds an encoded Film Room search link', () => {
    expect(filmRoomUrlForPlayId('abc-123')).toBe(
      'https://www.mlb.com/video/search?q=playid=%22abc-123%22',
    );
  });
});

describe('resolveRefreshNotablePlays', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unauthenticated requests with UNAUTHENTICATED error', async () => {
    const context = makeContext({ isSystemRequest: false, user: null });
    await expect(
      resolveRefreshNotablePlays(context, null),
    ).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
  });

  it('returns triggered:false when the provider cannot be constructed (production guard)', async () => {
    mockGetMlbDataProvider.mockRejectedValue(
      new Error('Cannot use mlb-statsapi in production'),
    );

    const result = await resolveRefreshNotablePlays(systemContext, null);

    expect(result.triggered).toBe(false);
    expect(result.reason).toContain('MLB data provider unavailable');
    expect(result.gamesScanned).toBe(0);
    expect(mockUpsertNotablePlays).not.toHaveBeenCalled();
  });

  it('returns triggered:false when the provider has no play-level feed support', async () => {
    // A provider without the optional getNotablePlays method (e.g. balldontlie).
    mockGetMlbDataProvider.mockResolvedValue({
      getSchedule: jest.fn(),
    } as unknown as MlbDataProvider);

    const result = await resolveRefreshNotablePlays(systemContext, null);

    expect(result.triggered).toBe(false);
    expect(result.reason).toContain(
      'does not support play-level Statcast feeds',
    );
    expect(mockUpsertNotablePlays).not.toHaveBeenCalled();
  });

  it('scans final games, keeps the best play per player, and upserts only known players', async () => {
    const judgeGame1 = makePlay({ notabilityScore: 120, gamePk: 111 });
    const judgeGame2 = makePlay({ notabilityScore: 150, gamePk: 222 });
    const unknownPlayer = makePlay({
      mlbPlayerId: 999999,
      notabilityScore: 90,
      gamePk: 111,
    });

    mockGetMlbDataProvider.mockResolvedValue({
      getSchedule: jest.fn().mockResolvedValue({
        date: '2026-08-05',
        games: [
          { gamePk: 111, status: 'Final' },
          { gamePk: 222, status: 'Final' },
          { gamePk: 333, status: 'Live' },
        ],
      }),
      getNotablePlays: jest
        .fn()
        .mockResolvedValueOnce([judgeGame1, unknownPlayer])
        .mockResolvedValueOnce([judgeGame2]),
    } as unknown as MlbDataProvider);
    mockFilterKnownMlbPlayerIds.mockResolvedValue([592450]);
    mockUpsertNotablePlays.mockResolvedValue(1);

    const result = await resolveRefreshNotablePlays(systemContext, 1);

    expect(result.triggered).toBe(true);
    // The Live game (333) is skipped.
    expect(result.gamesScanned).toBe(2);
    expect(result.playersUpdated).toBe(1);
    expect(result.errors).toHaveLength(0);

    // Only the higher-scored play for the known player is upserted.
    expect(mockUpsertNotablePlays).toHaveBeenCalledWith([
      expect.objectContaining({ mlbPlayerId: 592450, gamePk: 222 }),
    ]);
  });

  it('collects per-game errors without aborting the run', async () => {
    mockGetMlbDataProvider.mockResolvedValue({
      getSchedule: jest.fn().mockResolvedValue({
        date: '2026-08-05',
        games: [
          { gamePk: 111, status: 'Final' },
          { gamePk: 222, status: 'Final' },
        ],
      }),
      getNotablePlays: jest
        .fn()
        .mockRejectedValueOnce(new Error('feed 500'))
        .mockResolvedValueOnce([makePlay({ gamePk: 222 })]),
    } as unknown as MlbDataProvider);
    mockFilterKnownMlbPlayerIds.mockResolvedValue([592450]);
    mockUpsertNotablePlays.mockResolvedValue(1);

    const result = await resolveRefreshNotablePlays(systemContext, 1);

    expect(result.triggered).toBe(true);
    expect(result.gamesScanned).toBe(1);
    expect(result.errors).toEqual(['game 111: feed 500']);
    expect(result.playersUpdated).toBe(1);
  });
});
