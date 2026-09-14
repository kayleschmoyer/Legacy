# logging

Structured logging utilities shared across apps and lambdas. A Tier 1 dependency.

## Metrics (CloudWatch EMF)

`@legacy-sports/logging/server` exports `emitMetric` (see
[`src/lib/metrics.ts`](src/lib/metrics.ts)) — the shared metric-emission path
for lambdas (LS-10129). It writes a
[CloudWatch Embedded Metric Format](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html)
JSON line to stdout, which CloudWatch Logs asynchronously turns into a real
metric (dimensions, aggregation, alarms) with **no SDK call, no extra IAM
permission, and no network round-trip** — it's just structured stdout, same
as `LOGGER`.

```ts
import { emitMetric } from '@legacy-sports/logging/server';

emitMetric({
  name: 'missing_stats',
  value: 1,
  unit: 'Count',
  dimensions: { dataQuality: 'missing', sport: 'football' },
  // namespace defaults to 'LegacySports'
});
```

It is a no-op outside an actual Lambda invocation (detected via the
runtime-set `AWS_LAMBDA_FUNCTION_NAME` env var), so unit tests, local runs,
and the CLI never emit metric lines.

### Alarming on an emitted metric

Once a metric has been emitted for a while and the right threshold is known,
define a `aws_cloudwatch_metric_alarm` against it in
`terraform/main/monitoring.tf`, following the existing
`LegacySports/FootballIngest` custom-metric alarms there as a template:

```hcl
resource "aws_cloudwatch_metric_alarm" "missing_stats_rate" {
  alarm_name          = "${local.name_prefix}-missing-stats-rate"
  alarm_description   = "missing_stats metric rate exceeded threshold — see matchupScores.ts warnMissingGameStats."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 10 # tune once real traffic volume is known
  evaluation_periods  = 3
  period              = 300

  namespace   = "LegacySports" # default namespace used by emitMetric()
  metric_name = "missing_stats"
  dimensions  = { dataQuality = "missing" } # must match an emitted dimension set exactly

  statistic = "Sum"

  alarm_actions = [aws_sns_topic.ops_alerts.arn]
  ok_actions    = [aws_sns_topic.ops_alerts.arn]

  treat_missing_data = "notBreaching"

  tags = local.common_tags
}
```

We are deliberately not adding this alarm yet (cost-optimization epic
LS-8893): an alarm with an unvalidated threshold either pages on noise or
never fires. Add it once the metric has run in production long enough to
pick a real threshold.
