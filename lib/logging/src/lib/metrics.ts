/**
 * CloudWatch Embedded Metric Format (EMF) emission.
 *
 * EMF needs no SDK, no extra IAM permissions, and no network call: writing a
 * specially-shaped JSON object to stdout is enough for the CloudWatch Logs
 * agent that already ships every Lambda's stdout to build the metric from the
 * log line asynchronously. See:
 * https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html
 *
 * Emission is gated on running inside Lambda (`AWS_LAMBDA_FUNCTION_NAME` is
 * set by the Lambda runtime) so unit tests and local/CLI runs never emit
 * metric lines into their console output (LS-10129 AC3).
 */

/** CloudWatch EMF unit names actually used by this repo; extend as needed. */
export type MetricUnit =
  | 'Count'
  | 'Milliseconds'
  | 'Seconds'
  | 'Bytes'
  | 'Percent'
  | 'None';

export type MetricDimensions = Record<string, string>;

export interface EmitMetricOptions {
  /** Metric name, e.g. `missing_stats`. */
  name: string;
  /** Numeric metric value. */
  value: number;
  /** CloudWatch unit. Defaults to `Count`. */
  unit?: MetricUnit;
  /** Namespace metrics are grouped under. Defaults to `LegacySports`. */
  namespace?: string;
  /**
   * Dimensions attached to the metric (and included as top-level EMF log
   * fields, so they stay greppable in CloudWatch Logs Insights same as any
   * other structured log field). Keep dimension sets small — CloudWatch
   * bills each unique dimension combination as a distinct metric stream.
   */
  dimensions?: MetricDimensions;
}

const DEFAULT_NAMESPACE = 'LegacySports';

/** True only inside an actual Lambda invocation (set by the Lambda runtime). */
function isLambdaRuntime(): boolean {
  return (
    typeof process !== 'undefined' && !!process.env['AWS_LAMBDA_FUNCTION_NAME']
  );
}

/**
 * Emit a CloudWatch EMF metric line to stdout.
 *
 * No-op outside Lambda (unit tests, local dev, CLI runs) so metric emission
 * never pollutes non-Lambda console output or test snapshots.
 */
export function emitMetric(options: EmitMetricOptions): void {
  if (!isLambdaRuntime()) return;

  const {
    name,
    value,
    unit = 'Count',
    namespace = DEFAULT_NAMESPACE,
    dimensions = {},
  } = options;
  const dimensionKeys = Object.keys(dimensions);

  const emfPayload = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: namespace,
          Dimensions: [dimensionKeys],
          Metrics: [{ Name: name, Unit: unit }],
        },
      ],
    },
    ...dimensions,
    [name]: value,
  };

  process.stdout.write(`${JSON.stringify(emfPayload)}\n`);
}
