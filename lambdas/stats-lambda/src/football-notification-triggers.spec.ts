// ── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const PublicSchema = {
  matchups: { __name: 'matchups' },
  matchupPlayers: { __name: 'matchupPlayers' },
  notificationPreferences: { __name: 'notificationPreferences' },
  notificationHistory: { __name: 'notificationHistory' },
  leagueMembers: { __name: 'leagueMembers' },
};

const InternalSchema = {
  usersInAppInternal: { __name: 'usersInAppInternal' },
};

const mockGetMatchupFootballPlayerGameStats = jest.fn();

jest.mock('@legacy-sports/db-client', () => ({
  PublicSchema,
  InternalSchema,
  getMatchupFootballPlayerGameStats: (...args: unknown[]): unknown =>
    mockGetMatchupFootballPlayerGameStats(...args),
}));

// ── Import under test ───────────────────────────────────────────────────────

import type { PushNotificationEvent } from '@legacy-sports/aws-utils';
import { publishFootballGameAlerts } from './football-notification-triggers';

// ── Fake db ─────────────────────────────────────────────────────────────────

/** Wraps rows so both `await chain` and `await chain.limit(n)` resolve to them. */
function chainable<T>(rows: T[]): Promise<T[]> & { limit: () => Promise<T[]> } {
  const promise = Promise.resolve(rows) as Promise<T[]> & {
    limit: () => Promise<T[]>;
  };
  promise.limit = () => Promise.resolve(rows);
  return promise;
}

/**
 * FIFO queue per table: each `.select().from(table).where(...)` call shifts
 * the next configured row-set for that table. Tests push queue entries in
 * the exact order football-notification-triggers.ts queries each table.
 */
function makeFakeDb(queues: Map<object, unknown[][]>) {
  return {
    select: () => ({
      from: (table: object) => ({
        where: () => {
          const queue = queues.get(table);
          const rows = queue?.shift() ?? [];
          return chainable(rows);
        },
      }),
    }),
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('publishFootballGameAlerts', () => {
  const publisher = {
    publish: jest.fn<Promise<void>, [PushNotificationEvent]>(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is a no-op when notificationPublisher is null', async () => {
    const db = makeFakeDb(new Map());
    await publishFootballGameAlerts(db as never, null, 1);
    expect(mockGetMatchupFootballPlayerGameStats).not.toHaveBeenCalled();
  });

  it('sends a TD_ALERT to a premium owner with the preference enabled', async () => {
    mockGetMatchupFootballPlayerGameStats.mockResolvedValueOnce([
      {
        playerId: 55,
        matchupPlayerId: 900,
        gameNum: 1,
        gameIdentifier: 'g1',
        offense: { passTd: 1, rushTd: 0, recTd: 0 },
        defense: null,
        idpDefense: null,
      },
    ]);

    const queues = new Map<object, unknown[][]>([
      [
        PublicSchema.matchups,
        [
          [
            {
              leagueId: 10,
              team1Id: 1,
              team2Id: 2,
              team1Score: null,
              team2Score: null,
            },
          ],
        ],
      ],
      [PublicSchema.matchupPlayers, [[{ matchupPlayerId: 900, teamId: 1 }]]],
      [PublicSchema.leagueMembers, [[{ userId: 42 }]]],
      [InternalSchema.usersInAppInternal, [[{ tier: 'premium' }]]],
      [
        PublicSchema.notificationPreferences,
        [
          [
            {
              pushEnabled: true,
              touchdownAlertEnabled: true,
              matchupCloseGameEnabled: true,
              closeGameThreshold: 5,
            },
          ],
        ],
      ],
      [PublicSchema.notificationHistory, [[]]],
    ]);
    const db = makeFakeDb(queues);

    await publishFootballGameAlerts(db as never, publisher as never, 7);

    expect(publisher.publish).toHaveBeenCalledTimes(1);
    const [event] = publisher.publish.mock.calls[0];
    expect(event.userId).toBe(42);
    expect(event.notificationType).toBe('TD_ALERT');
    expect(event.data).toMatchObject({ matchupPlayerId: 900, touchdowns: 1 });
  });

  it('does not send a TD_ALERT when no touchdown was scored', async () => {
    mockGetMatchupFootballPlayerGameStats.mockResolvedValueOnce([
      {
        playerId: 55,
        matchupPlayerId: 900,
        gameNum: 1,
        gameIdentifier: 'g1',
        offense: { passTd: 0, rushTd: 0, recTd: 0 },
        defense: null,
        idpDefense: null,
      },
    ]);

    const queues = new Map<object, unknown[][]>([
      [
        PublicSchema.matchups,
        [
          [
            {
              leagueId: 10,
              team1Id: 1,
              team2Id: 2,
              team1Score: null,
              team2Score: null,
            },
          ],
        ],
      ],
      [PublicSchema.matchupPlayers, [[{ matchupPlayerId: 900, teamId: 1 }]]],
    ]);
    const db = makeFakeDb(queues);

    await publishFootballGameAlerts(db as never, publisher as never, 7);

    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('does not send a TD_ALERT to a free-tier owner', async () => {
    mockGetMatchupFootballPlayerGameStats.mockResolvedValueOnce([
      {
        playerId: 55,
        matchupPlayerId: 900,
        gameNum: 1,
        gameIdentifier: 'g1',
        offense: { passTd: 1, rushTd: 0, recTd: 0 },
        defense: null,
        idpDefense: null,
      },
    ]);

    const queues = new Map<object, unknown[][]>([
      [
        PublicSchema.matchups,
        [
          [
            {
              leagueId: 10,
              team1Id: 1,
              team2Id: 2,
              team1Score: null,
              team2Score: null,
            },
          ],
        ],
      ],
      [PublicSchema.matchupPlayers, [[{ matchupPlayerId: 900, teamId: 1 }]]],
      [PublicSchema.leagueMembers, [[{ userId: 42 }]]],
      [InternalSchema.usersInAppInternal, [[{ tier: 'free' }]]],
    ]);
    const db = makeFakeDb(queues);

    await publishFootballGameAlerts(db as never, publisher as never, 7);

    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('does not send a TD_ALERT when the preference is disabled', async () => {
    mockGetMatchupFootballPlayerGameStats.mockResolvedValueOnce([
      {
        playerId: 55,
        matchupPlayerId: 900,
        gameNum: 1,
        gameIdentifier: 'g1',
        offense: { passTd: 1, rushTd: 0, recTd: 0 },
        defense: null,
        idpDefense: null,
      },
    ]);

    const queues = new Map<object, unknown[][]>([
      [
        PublicSchema.matchups,
        [
          [
            {
              leagueId: 10,
              team1Id: 1,
              team2Id: 2,
              team1Score: null,
              team2Score: null,
            },
          ],
        ],
      ],
      [PublicSchema.matchupPlayers, [[{ matchupPlayerId: 900, teamId: 1 }]]],
      [PublicSchema.leagueMembers, [[{ userId: 42 }]]],
      [InternalSchema.usersInAppInternal, [[{ tier: 'premium' }]]],
      [
        PublicSchema.notificationPreferences,
        [
          [
            {
              pushEnabled: true,
              touchdownAlertEnabled: false,
              matchupCloseGameEnabled: true,
              closeGameThreshold: 5,
            },
          ],
        ],
      ],
    ]);
    const db = makeFakeDb(queues);

    await publishFootballGameAlerts(db as never, publisher as never, 7);

    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('does not send a TD_ALERT for a premium owner with no notification_preferences row (touchdownAlertEnabled defaults false)', async () => {
    mockGetMatchupFootballPlayerGameStats.mockResolvedValueOnce([
      {
        playerId: 55,
        matchupPlayerId: 900,
        gameNum: 1,
        gameIdentifier: 'g1',
        offense: { passTd: 1, rushTd: 0, recTd: 0 },
        defense: null,
        idpDefense: null,
      },
    ]);

    const queues = new Map<object, unknown[][]>([
      [
        PublicSchema.matchups,
        [
          [
            {
              leagueId: 10,
              team1Id: 1,
              team2Id: 2,
              team1Score: null,
              team2Score: null,
            },
          ],
        ],
      ],
      [PublicSchema.matchupPlayers, [[{ matchupPlayerId: 900, teamId: 1 }]]],
      [PublicSchema.leagueMembers, [[{ userId: 42 }]]],
      [InternalSchema.usersInAppInternal, [[{ tier: 'premium' }]]],
      // No notificationPreferences queue entry — simulates no row for this user.
    ]);
    const db = makeFakeDb(queues);

    await publishFootballGameAlerts(db as never, publisher as never, 7);

    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('sends a MATCHUP_CLOSE_GAME alert for a premium owner with no notification_preferences row (matchupCloseGameEnabled defaults true)', async () => {
    mockGetMatchupFootballPlayerGameStats.mockResolvedValueOnce([]);

    const queues = new Map<object, unknown[][]>([
      [
        PublicSchema.matchups,
        [
          [
            {
              leagueId: 10,
              team1Id: 1,
              team2Id: 2,
              team1Score: '100',
              team2Score: '97',
            },
          ],
        ],
      ],
      [PublicSchema.matchupPlayers, [[]]],
      [PublicSchema.leagueMembers, [[{ userId: 42 }], [{ userId: 43 }]]],
      [
        InternalSchema.usersInAppInternal,
        [[{ tier: 'premium' }], [{ tier: 'premium' }]],
      ],
      // No notificationPreferences or notificationHistory queue entries —
      // simulates neither user having touched notification settings.
    ]);
    const db = makeFakeDb(queues);

    await publishFootballGameAlerts(db as never, publisher as never, 7);

    expect(publisher.publish).toHaveBeenCalledTimes(2);
    const [event] = publisher.publish.mock.calls[0];
    expect(event.notificationType).toBe('MATCHUP_CLOSE_GAME');
    expect(event.data).toMatchObject({ matchupId: 7, margin: 3 });
  });

  it('does not re-send a TD_ALERT already logged for this matchupPlayerId', async () => {
    mockGetMatchupFootballPlayerGameStats.mockResolvedValueOnce([
      {
        playerId: 55,
        matchupPlayerId: 900,
        gameNum: 1,
        gameIdentifier: 'g1',
        offense: { passTd: 1, rushTd: 0, recTd: 0 },
        defense: null,
        idpDefense: null,
      },
    ]);

    const queues = new Map<object, unknown[][]>([
      [
        PublicSchema.matchups,
        [
          [
            {
              leagueId: 10,
              team1Id: 1,
              team2Id: 2,
              team1Score: null,
              team2Score: null,
            },
          ],
        ],
      ],
      [PublicSchema.matchupPlayers, [[{ matchupPlayerId: 900, teamId: 1 }]]],
      [PublicSchema.leagueMembers, [[{ userId: 42 }]]],
      [InternalSchema.usersInAppInternal, [[{ tier: 'premium' }]]],
      [
        PublicSchema.notificationPreferences,
        [
          [
            {
              pushEnabled: true,
              touchdownAlertEnabled: true,
              matchupCloseGameEnabled: true,
              closeGameThreshold: 5,
            },
          ],
        ],
      ],
      [PublicSchema.notificationHistory, [[{ id: 1 }]]],
    ]);
    const db = makeFakeDb(queues);

    await publishFootballGameAlerts(db as never, publisher as never, 7);

    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('sends a MATCHUP_CLOSE_GAME alert when the margin is under the threshold', async () => {
    mockGetMatchupFootballPlayerGameStats.mockResolvedValueOnce([]);

    const queues = new Map<object, unknown[][]>([
      [
        PublicSchema.matchups,
        [
          [
            {
              leagueId: 10,
              team1Id: 1,
              team2Id: 2,
              team1Score: '100',
              team2Score: '97',
            },
          ],
        ],
      ],
      [PublicSchema.matchupPlayers, [[]]],
      // team1 owner
      [PublicSchema.leagueMembers, [[{ userId: 42 }], [{ userId: 43 }]]],
      [
        InternalSchema.usersInAppInternal,
        [[{ tier: 'premium' }], [{ tier: 'premium' }]],
      ],
      [
        PublicSchema.notificationPreferences,
        [
          [
            {
              pushEnabled: true,
              touchdownAlertEnabled: true,
              matchupCloseGameEnabled: true,
              closeGameThreshold: 5,
            },
          ],
          [
            {
              pushEnabled: true,
              touchdownAlertEnabled: true,
              matchupCloseGameEnabled: true,
              closeGameThreshold: 5,
            },
          ],
        ],
      ],
      [PublicSchema.notificationHistory, [[], []]],
    ]);
    const db = makeFakeDb(queues);

    await publishFootballGameAlerts(db as never, publisher as never, 7);

    expect(publisher.publish).toHaveBeenCalledTimes(2);
    const [event] = publisher.publish.mock.calls[0];
    expect(event.userId).toBe(42);
    expect(event.notificationType).toBe('MATCHUP_CLOSE_GAME');
    expect(event.data).toMatchObject({ matchupId: 7, margin: 3 });
  });

  it('does not send a MATCHUP_CLOSE_GAME alert when the margin is at or over the threshold', async () => {
    mockGetMatchupFootballPlayerGameStats.mockResolvedValueOnce([]);

    const queues = new Map<object, unknown[][]>([
      [
        PublicSchema.matchups,
        [
          [
            {
              leagueId: 10,
              team1Id: 1,
              team2Id: 2,
              team1Score: '100',
              team2Score: '95',
            },
          ],
        ],
      ],
      [PublicSchema.matchupPlayers, [[]]],
      [PublicSchema.leagueMembers, [[{ userId: 42 }], [{ userId: 43 }]]],
      [
        InternalSchema.usersInAppInternal,
        [[{ tier: 'premium' }], [{ tier: 'premium' }]],
      ],
      [
        PublicSchema.notificationPreferences,
        [
          [
            {
              pushEnabled: true,
              touchdownAlertEnabled: true,
              matchupCloseGameEnabled: true,
              closeGameThreshold: 5,
            },
          ],
          [
            {
              pushEnabled: true,
              touchdownAlertEnabled: true,
              matchupCloseGameEnabled: true,
              closeGameThreshold: 5,
            },
          ],
        ],
      ],
    ]);
    const db = makeFakeDb(queues);

    await publishFootballGameAlerts(db as never, publisher as never, 7);

    // margin is exactly 5, which is not < threshold of 5
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('swallows errors and never throws (non-fatal)', async () => {
    mockGetMatchupFootballPlayerGameStats.mockRejectedValueOnce(
      new Error('boom'),
    );

    const queues = new Map<object, unknown[][]>([
      [
        PublicSchema.matchups,
        [
          [
            {
              leagueId: 10,
              team1Id: 1,
              team2Id: 2,
              team1Score: null,
              team2Score: null,
            },
          ],
        ],
      ],
      [PublicSchema.matchupPlayers, [[]]],
    ]);
    const db = makeFakeDb(queues);

    await expect(
      publishFootballGameAlerts(db as never, publisher as never, 7),
    ).resolves.toBeUndefined();
  });
});
