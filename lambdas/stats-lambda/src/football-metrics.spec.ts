// ── Mocks ───────────────────────────────────────────────────────────────────

const mockSend = jest.fn();
const mockPutMetricDataCommand = jest.fn((input: unknown) => ({ input }));
const mockLoggerWarn = jest.fn();

jest.mock('@aws-sdk/client-cloudwatch', () => ({
  CloudWatchClient: jest.fn(() => ({ send: mockSend })),
  PutMetricDataCommand: mockPutMetricDataCommand,
  StandardUnit: { Count: 'Count', Milliseconds: 'Milliseconds' },
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { warn: mockLoggerWarn },
}));

// ── Import under test ───────────────────────────────────────────────────────

import {
  emitFootballFailure,
  emitFootballSuccess,
  emitPfrFetchLatency,
} from './football-metrics';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('football-metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({});
  });

  describe('emitFootballSuccess', () => {
    it('sends PutMetricDataCommand with success metric name', async () => {
      await emitFootballSuccess('game_load');

      expect(mockPutMetricDataCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Namespace: 'LegacySports/FootballIngest',
          MetricData: expect.arrayContaining([
            expect.objectContaining({
              MetricName: 'football.game_load.success',
              Value: 1,
              Unit: 'Count',
            }),
          ]) as unknown,
        }),
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('emits correct metric for each handler type', async () => {
      for (const handler of [
        'season_load',
        'matchup_score',
        'pfr_fetch',
      ] as const) {
        jest.clearAllMocks();
        mockSend.mockResolvedValue({});

        await emitFootballSuccess(handler);

        expect(mockPutMetricDataCommand).toHaveBeenCalledWith(
          expect.objectContaining({
            MetricData: expect.arrayContaining([
              expect.objectContaining({
                MetricName: `football.${handler}.success`,
              }),
            ]) as unknown,
          }),
        );
      }
    });
  });

  describe('emitFootballFailure', () => {
    it('sends PutMetricDataCommand with failure metric name', async () => {
      await emitFootballFailure('game_load');

      expect(mockPutMetricDataCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          MetricData: expect.arrayContaining([
            expect.objectContaining({
              MetricName: 'football.game_load.failure',
              Value: 1,
              Unit: 'Count',
            }),
          ]) as unknown,
        }),
      );
    });
  });

  describe('emitPfrFetchLatency', () => {
    it('sends latency metric with Milliseconds unit', async () => {
      await emitPfrFetchLatency(1500);

      expect(mockPutMetricDataCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          MetricData: expect.arrayContaining([
            expect.objectContaining({
              MetricName: 'football.pfr_fetch.latency_ms',
              Value: 1500,
              Unit: 'Milliseconds',
            }),
          ]) as unknown,
        }),
      );
    });
  });

  describe('error handling', () => {
    it('does not throw when CloudWatch send fails', async () => {
      mockSend.mockRejectedValue(new Error('network error'));

      await expect(emitFootballSuccess('game_load')).resolves.toBeUndefined();
    });

    it('logs a warning when CloudWatch send fails', async () => {
      const err = new Error('throttled');
      mockSend.mockRejectedValue(err);

      await emitFootballSuccess('game_load');

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Failed to emit CloudWatch metric',
        err,
        expect.objectContaining({ metricName: 'football.game_load.success' }),
      );
    });
  });
});
