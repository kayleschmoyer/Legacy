# ── EventBridge rules for scheduled GraphQL operations ──────────────────────
#
# Pattern: EventBridge invokes the GraphQL Lambda directly (not via API Gateway)
# with a GraphQL mutation payload. This lets us use the same endpoint for both
# manual (UI) and automatic (cron) triggers.

# ── Waiver Claim Processing ─────────────────────────────────────────────────
# Processes pending waiver claims every hour

resource "aws_cloudwatch_event_rule" "process_waiver_claims" {
  name                = "${local.name_prefix}-process-waiver-claims"
  description         = "Trigger waiver claim processing every hour"
  schedule_expression = "rate(1 hour)"

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "process_waiver_claims" {
  rule      = aws_cloudwatch_event_rule.process_waiver_claims.name
  target_id = "process-waiver-claims"
  arn       = aws_lambda_function.graphql.arn

  input = jsonencode({
    httpMethod = "POST"
    body = jsonencode({
      query = "mutation { processWaiverClaims { processed succeeded failed } }"
    })
    headers = {
      "content-type" = "application/json"
    }
    requestContext = {
      http = {
        method = "POST"
      }
    }
  })
}

resource "aws_lambda_permission" "process_waiver_claims_eventbridge" {
  statement_id  = "AllowEventBridgeProcessWaiverClaims"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.graphql.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.process_waiver_claims.arn
}
