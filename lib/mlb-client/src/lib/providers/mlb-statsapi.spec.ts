/**
 * Unit tests for MlbStatsApiProvider (LS-3800, LS-2737, LS-2735).
 *
 * Covers:
 * - status normalisation so "In Progress" maps to "Live"
 *   (the root cause of the game ticker not reporting live data).
 * - getPlayerGameStats season passthrough (LS-2737).
 * - getPlayerGameStats returning null when the requested gamePk is absent
 *   from the player's game log (LS-2735).
 */

import axios from 'axios';
import { mapMlbStatus, MlbStatsApiProvider } from './mlb-statsapi';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('mapMlbStatus', () => {
  it('maps "In Progress" → "Live"', () => {
    expect(mapMlbStatus('In Progress')).toBe('Live');
  });

  it('maps "Manager Challenge" → "Live"', () => {
    expect(mapMlbStatus('Manager Challenge')).toBe('Live');
  });

  it('maps "Final" → "Final"', () => {
    expect(mapMlbStatus('Final')).toBe('Final');
  });

  it('maps "Game Over" → "Final"', () => {
    expect(mapMlbStatus('Game Over')).toBe('Final');
  });

  it('maps "Completed Early" → "Final"', () => {
    expect(mapMlbStatus('Completed Early')).toBe('Final');
  });

  it('maps "Postponed" → "Postponed"', () => {
    expect(mapMlbStatus('Postponed')).toBe('Postponed');
  });

  it('maps "Cancelled" → "Postponed"', () => {
    expect(mapMlbStatus('Cancelled')).toBe('Postponed');
  });

  it('maps "Suspended" → "Suspended"', () => {
    expect(mapMlbStatus('Suspended')).toBe('Suspended');
  });

  it.each(['Scheduled', 'Pre-Game', 'Warmup', 'Delayed', 'Delayed: Rain'])(
    'maps "%s" → "Preview"',
    (state) => {
      expect(mapMlbStatus(state)).toBe('Preview');
    },
  );

  it('maps undefined → "Preview"', () => {
    expect(mapMlbStatus(undefined)).toBe('Preview');
  });
});

describe('MlbStatsApiProvider.getPlayerGameStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.isAxiosError = jest.fn().mockReturnValue(false) as never;
    // Default to an empty splits response so each test can override only the
    // shape it cares about.
    mockedAxios.get.mockResolvedValue({
      data: {
        stats: [
          {
            group: { displayName: 'hitting' },
            splits: [{ game: { gamePk: 999 }, stat: {} }],
          },
        ],
      },
    });
  });

  // ── LS-2737: season parameter ───────────────────────────────────────────

  it('forwards the season param when provided so prior-season games are found', async () => {
    const provider = new MlbStatsApiProvider();
    await provider.getPlayerGameStats(12345, 999, 2024);

    const calls = mockedAxios.get.mock.calls;
    expect(calls).toHaveLength(1);
    const params = calls[0][1]?.params as Record<string, unknown>;
    expect(params).toMatchObject({
      stats: 'gameLog',
      sportId: 1,
      season: 2024,
    });
  });

  it('omits the season param when not provided (current-season default)', async () => {
    const provider = new MlbStatsApiProvider();
    await provider.getPlayerGameStats(12345, 999);

    const calls = mockedAxios.get.mock.calls;
    expect(calls).toHaveLength(1);
    const params = calls[0][1]?.params as Record<string, unknown>;
    expect(params).toEqual({ stats: 'gameLog', sportId: 1 });
    expect(params).not.toHaveProperty('season');
  });

  // ── LS-2735: null when gamePk not in splits ─────────────────────────────

  it('returns null when the requested gamePk is absent from the splits', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        stats: [
          {
            group: { displayName: 'hitting' },
            splits: [
              { game: { gamePk: 111 }, stat: { hits: 2, atBats: 4 } },
              { game: { gamePk: 222 }, stat: { hits: 0, atBats: 3 } },
            ],
          },
        ],
      },
    });

    const provider = new MlbStatsApiProvider();
    const result = await provider.getPlayerGameStats(545361, 999);

    expect(result).toBeNull();
  });

  it('returns null when splits is empty (player has no game log)', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { stats: [{ group: { displayName: 'hitting' }, splits: [] }] },
    });

    const provider = new MlbStatsApiProvider();
    const result = await provider.getPlayerGameStats(545361, 123);

    expect(result).toBeNull();
  });

  it('returns mapped stats when the gamePk is present', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        stats: [
          {
            group: { displayName: 'hitting' },
            splits: [
              {
                game: { gamePk: 123 },
                stat: { hits: 2, atBats: 4, homeRuns: 1, rbi: 3 },
              },
            ],
          },
        ],
      },
    });

    const provider = new MlbStatsApiProvider();
    const result = await provider.getPlayerGameStats(545361, 123);

    expect(result).toEqual({
      playerId: 545361,
      gamePk: 123,
      group: 'hitting',
      hits: 2,
      atBats: 4,
      homeRuns: 1,
      rbi: 3,
    });
  });
});

// ── LS-8597: getPlayerInfo (team affiliation + jersey number) ───────────────

describe('MlbStatsApiProvider.getPlayerInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.isAxiosError = jest.fn().mockReturnValue(false) as never;
  });

  it('maps currentTeam.abbreviation and primaryNumber', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        people: [
          {
            id: 592450,
            currentTeam: { id: 147, abbreviation: 'NYY' },
            primaryNumber: '99',
          },
        ],
      },
    });

    const provider = new MlbStatsApiProvider();
    const result = await provider.getPlayerInfo(592450);

    expect(result).toEqual({
      playerId: 592450,
      mlbTeamAbbreviation: 'NYY',
      jerseyNumber: 99,
    });
  });

  it('returns nulls when the person has no currentTeam or primaryNumber', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { people: [{ id: 592450 }] },
    });

    const provider = new MlbStatsApiProvider();
    const result = await provider.getPlayerInfo(592450);

    expect(result).toEqual({
      playerId: 592450,
      mlbTeamAbbreviation: null,
      jerseyNumber: null,
    });
  });

  it('returns nulls when the people array is empty (unknown player)', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { people: [] } });

    const provider = new MlbStatsApiProvider();
    const result = await provider.getPlayerInfo(1);

    expect(result).toEqual({
      playerId: 1,
      mlbTeamAbbreviation: null,
      jerseyNumber: null,
    });
  });

  it('requests /v1/people/{id}', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { people: [] } });

    const provider = new MlbStatsApiProvider();
    await provider.getPlayerInfo(592450);

    const calls = mockedAxios.get.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toContain('/v1/people/592450');
  });
});
