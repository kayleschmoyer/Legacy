import { emitMetric } from './metrics';

interface ParsedEmfPayload {
  _aws: {
    Timestamp: number;
    CloudWatchMetrics: Array<{
      Namespace: string;
      Dimensions: string[][];
      Metrics: Array<{ Name: string; Unit: string }>;
    }>;
  };
  [dimensionOrMetricName: string]: unknown;
}

function parseEmittedLine(writeSpy: jest.SpyInstance): ParsedEmfPayload {
  const [line] = writeSpy.mock.calls[0] as [string];
  return JSON.parse(line.trimEnd()) as ParsedEmfPayload;
}

describe('emitMetric', () => {
  const originalLambdaFunctionName = process.env['AWS_LAMBDA_FUNCTION_NAME'];
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
    if (originalLambdaFunctionName === undefined) {
      delete process.env['AWS_LAMBDA_FUNCTION_NAME'];
    } else {
      process.env['AWS_LAMBDA_FUNCTION_NAME'] = originalLambdaFunctionName;
    }
  });

  it('is a no-op outside Lambda', () => {
    delete process.env['AWS_LAMBDA_FUNCTION_NAME'];

    emitMetric({ name: 'missing_stats', value: 1 });

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('writes a CloudWatch EMF JSON line when running in Lambda', () => {
    process.env['AWS_LAMBDA_FUNCTION_NAME'] = 'db-graphql';

    emitMetric({
      name: 'missing_stats',
      value: 1,
      unit: 'Count',
      dimensions: { dataQuality: 'missing', sport: 'football' },
    });

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const payload = parseEmittedLine(writeSpy);

    expect(payload['missing_stats']).toBe(1);
    expect(payload.dataQuality).toBe('missing');
    expect(payload.sport).toBe('football');
    expect(payload._aws.CloudWatchMetrics).toEqual([
      {
        Namespace: 'LegacySports',
        Dimensions: [['dataQuality', 'sport']],
        Metrics: [{ Name: 'missing_stats', Unit: 'Count' }],
      },
    ]);
    expect(typeof payload._aws.Timestamp).toBe('number');
  });

  it('defaults unit to Count and namespace to LegacySports with no dimensions', () => {
    process.env['AWS_LAMBDA_FUNCTION_NAME'] = 'db-graphql';

    emitMetric({ name: 'requests', value: 5 });

    const payload = parseEmittedLine(writeSpy);

    expect(payload._aws.CloudWatchMetrics[0].Namespace).toBe('LegacySports');
    expect(payload._aws.CloudWatchMetrics[0].Metrics).toEqual([
      { Name: 'requests', Unit: 'Count' },
    ]);
    expect(payload._aws.CloudWatchMetrics[0].Dimensions).toEqual([[]]);
    expect(payload['requests']).toBe(5);
  });

  it('respects a custom namespace', () => {
    process.env['AWS_LAMBDA_FUNCTION_NAME'] = 'db-graphql';

    emitMetric({ name: 'requests', value: 1, namespace: 'Custom/Namespace' });

    const payload = parseEmittedLine(writeSpy);

    expect(payload._aws.CloudWatchMetrics[0].Namespace).toBe(
      'Custom/Namespace',
    );
  });
});
