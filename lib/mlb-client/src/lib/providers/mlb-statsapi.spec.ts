/**
 * Unit tests for MlbStatsApiProvider (LS-3800).
 *
 * Covers: status normalisation so "In Progress" maps to "Live"
 * (the root cause of the game ticker not reporting live data).
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

describe('MlbStatsApiProvider.getPlayerGameStats (LS-2737)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.isAxiosError = jest.fn().mockReturnValue(false) as never;
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
});
