# =============================================================================
# Runner Secret Rotation Reminder (LS-1656)
# =============================================================================
# Quarterly EventBridge rule that fires on the 1st of Jan/Apr/Jul/Oct at 9am ET
# and publishes a rotation reminder to the ops_alerts SNS topic (defined in
# terraform/main/, accessed via terraform_remote_state).
#
# Why quarterly: GitHub recommends rotating App private keys and webhook secrets
# at least annually; quarterly gives a comfortable margin and aligns with common
# security review cycles.
#
# To action the reminder: run `make runner-secrets-rotate` and follow the
# printed steps (the script updates AWS SSM automatically and prints the new
# webhook secret value to paste into GitHub App settings; private key rotation
# requires the GitHub App admin page).
# =============================================================================

resource "aws_cloudwatch_event_rule" "runner_secret_rotation_reminder" {
  name                = "${local.name_prefix}-runner-secret-rotation-reminder"
  description         = "Quarterly reminder to rotate GitHub App webhook secret and private key for the self-hosted runner fleet."
  schedule_expression = "cron(0 14 1 1,4,7,10 ? *)" # 9am EST / 10am EDT on Jan/Apr/Jul/Oct 1st

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "runner_secret_rotation_reminder" {
  rule = aws_cloudwatch_event_rule.runner_secret_rotation_reminder.name
  arn  = local.ops_alerts_topic_arn

  input = jsonencode({
    AlarmName        = "${local.name_prefix}-runner-secret-rotation-reminder"
    AlarmDescription = "Quarterly reminder to rotate GitHub App webhook secret and private key for the self-hosted runner fleet."
    NewStateValue    = "ALARM"
    NewStateReason   = "Quarterly reminder: rotate GitHub App webhook secret and private key for the self-hosted runner fleet. Run: make runner-secrets-rotate — it updates AWS SSM automatically and prints the webhook secret to paste into GitHub App settings. Private key rotation requires the GitHub App admin page."
  })
}
