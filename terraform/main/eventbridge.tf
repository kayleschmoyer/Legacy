# ── EventBridge rules for scheduled GraphQL operations ──────────────────────
#
# Pattern: EventBridge invokes the GraphQL Lambda directly (not via API Gateway)
# with a GraphQL mutation payload. This lets us use the same endpoint for both
# manual (UI) and automatic (cron) triggers.
#
# ── SYSTEM_API_KEY exposure trade-off (LS-2792) ─────────────────────────────
#
# Each target below embeds `x-system-api-key` in the `input` JSON so the
# GraphQL Lambda's system-request check (see lambdas/db/src/server/apollo.ts)
# accepts the invocation. The Lambda itself now fetches the key from Secrets
# Manager at cold-start, but the EventBridge side still carries the plaintext
# value because:
#
#   1. CloudWatch/EventBridge scheduled rules do not support dynamic secret
#      injection — target `input` is a static JSON literal, and there is no
#      input-transformer equivalent for Secrets Manager or SSM SecureString on
#      `aws_cloudwatch_event_target`.
#   2. Introducing an intermediate "scheduler-proxy" Lambda that fetches the
#      secret and forwards the request would eliminate the plaintext exposure
#      here but add an extra hop, a new deployable, and per-invocation latency
#      for every scheduled mutation.
#
# We therefore accept the residual EventBridge-side exposure with the
# following compensating controls:
#
#   • The value in target input is identical to the Secrets Manager secret
#     (both are driven by `random_password.system_api_key`), so rotating the
#     secret only requires regenerating `random_password` + `terraform apply`
#     — no out-of-band EventBridge edits.
#   • `events:DescribeRule` / `events:ListTargetsByRule` should be restricted
#     to the platform-admin role in IAM (they are not granted to application
#     roles).
#   • The Lambda's IAM policy grants `secretsmanager:GetSecretValue` only on
#     this specific secret ARN (see lambda-graphql.tf), so a compromised
#     Lambda role cannot pivot to other secrets.
#
# If CloudTrail ever surfaces unexpected access to this rule's target input
# or the secret, revisit the "intermediate proxy Lambda" option above.

# ── Waiver Claim Processing ─────────────────────────────────────────
# Processes pending waiver claims nightly at 2am EST.
# 2am EST = 07:00 UTC (standard time) / 06:00 UTC (daylight saving).
# Using 07:00 UTC (EST year-round); adjust if DST precision is needed.

resource "aws_cloudwatch_event_rule" "process_waiver_claims" {
  name                = "${local.name_prefix}-process-waiver-claims"
  description         = "Trigger nightly waiver claim processing at 2am EST"
  schedule_expression = "cron(0 7 * * ? *)"

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
      "content-type"     = "application/json"
      "x-system-api-key" = random_password.system_api_key.result
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

# ── Nightly Game Selection ──────────────────────────────────────────
# Selects the next game for all active leagues every night at midnight EST.
# Midnight EST = 05:00 UTC (standard time) / 04:00 UTC (daylight saving).
# Using 05:00 UTC (EST year-round); adjust if DST precision is needed.

resource "aws_cloudwatch_event_rule" "auto_select_games" {
  name                = "${local.name_prefix}-auto-select-games"
  description         = "Trigger nightly game selection at midnight EST for all active leagues"
  schedule_expression = "cron(0 5 * * ? *)"

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "auto_select_games" {
  rule      = aws_cloudwatch_event_rule.auto_select_games.name
  target_id = "auto-select-games"
  arn       = aws_lambda_function.graphql.arn

  input = jsonencode({
    httpMethod = "POST"
    body = jsonencode({
      query = "mutation { autoSelectGames { leaguesProcessed gamesTriggered errors } }"
    })
    headers = {
      "content-type"     = "application/json"
      "x-system-api-key" = random_password.system_api_key.result
    }
    requestContext = {
      http = {
        method = "POST"
      }
    }
  })
}

resource "aws_lambda_permission" "auto_select_games_eventbridge" {
  statement_id  = "AllowEventBridgeAutoSelectGames"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.graphql.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.auto_select_games.arn
}

# ── Weekly Matchup Advancement ──────────────────────────────────────
# Advances matchups for leagues where all games are complete.
# Runs every Sunday at 3am EST = 08:00 UTC (standard) / 07:00 UTC (DST).
# Using 08:00 UTC (EST year-round).

resource "aws_cloudwatch_event_rule" "auto_advance_matchups" {
  name                = "${local.name_prefix}-auto-advance-matchups"
  description         = "Advance matchups on Sundays at 3am EST for leagues with all games complete"
  schedule_expression = "cron(0 8 ? * SUN *)"

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "auto_advance_matchups" {
  rule      = aws_cloudwatch_event_rule.auto_advance_matchups.name
  target_id = "auto-advance-matchups"
  arn       = aws_lambda_function.graphql.arn

  input = jsonencode({
    httpMethod = "POST"
    body = jsonencode({
      query = "mutation { autoAdvanceMatchups { leaguesProcessed leaguesAdvanced leaguesSkipped errors } }"
    })
    headers = {
      "content-type"     = "application/json"
      "x-system-api-key" = random_password.system_api_key.result
    }
    requestContext = {
      http = {
        method = "POST"
      }
    }
  })
}

resource "aws_lambda_permission" "auto_advance_matchups_eventbridge" {
  statement_id  = "AllowEventBridgeAutoAdvanceMatchups"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.graphql.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.auto_advance_matchups.arn
}

# ── Draft Pick Deadline Processing ──────────────────────────────────
# Auto-picks for teams that exceed their pick deadline during live drafts.
# Runs every minute (the minimum EventBridge rate). The mutation contains an
# inner retry loop that chains through ALL consecutively-expired deadlines
# per draft, so short pick timers (e.g. 30s) are processed back-to-back in
# a single invocation without waiting for the next poll.
# Short-circuits immediately if no drafts have expired deadlines, so cost
# is negligible (~$0.04/month).

resource "aws_cloudwatch_event_rule" "auto_process_draft_picks" {
  name                = "${local.name_prefix}-auto-process-draft-picks"
  description         = "Process expired draft pick deadlines every minute"
  schedule_expression = "rate(1 minute)"

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "auto_process_draft_picks" {
  rule      = aws_cloudwatch_event_rule.auto_process_draft_picks.name
  target_id = "auto-process-draft-picks"
  arn       = aws_lambda_function.graphql.arn

  input = jsonencode({
    httpMethod = "POST"
    body = jsonencode({
      query = "mutation { autoProcessDraftPicks { draftsProcessed picksAutoMade draftsCompleted errors } }"
    })
    headers = {
      "content-type"     = "application/json"
      "x-system-api-key" = random_password.system_api_key.result
    }
    requestContext = {
      http = {
        method = "POST"
      }
    }
  })
}

resource "aws_lambda_permission" "auto_process_draft_picks_eventbridge" {
  statement_id  = "AllowEventBridgeAutoProcessDraftPicks"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.graphql.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.auto_process_draft_picks.arn
}

# ── Discord Score Alerts ───────────────────────────────────────────
# Posts matchup score summaries and close-game alerts to league Discord channels.
# Runs every 4 hours during active seasons. Short-circuits quickly when no
# leagues have active matchups with webhooks configured.

resource "aws_cloudwatch_event_rule" "discord_score_alerts" {
  name                = "${local.name_prefix}-discord-score-alerts"
  description         = "Post matchup score updates to Discord every 4 hours"
  schedule_expression = "rate(4 hours)"

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "discord_score_alerts" {
  rule      = aws_cloudwatch_event_rule.discord_score_alerts.name
  target_id = "discord-score-alerts"
  arn       = aws_lambda_function.graphql.arn

  input = jsonencode({
    httpMethod = "POST"
    body = jsonencode({
      query = "mutation { sendDiscordScoreAlerts { leaguesChecked alertsSent closeMatchupsFound errors } }"
    })
    headers = {
      "content-type"     = "application/json"
      "x-system-api-key" = random_password.system_api_key.result
    }
    requestContext = {
      http = {
        method = "POST"
      }
    }
  })
}

resource "aws_lambda_permission" "discord_score_alerts_eventbridge" {
  statement_id  = "AllowEventBridgeDiscordScoreAlerts"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.graphql.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.discord_score_alerts.arn
}

# ── Discord Lineup Lock Reminders ──────────────────────────────────
# Runs hourly. Checks all active leagues with Discord webhooks for
# upcoming matchup locks within their configured reminder window,
# and posts a reminder to the league's Discord channel.

resource "aws_cloudwatch_event_rule" "discord_lineup_reminders" {
  name                = "${local.name_prefix}-discord-lineup-reminders"
  description         = "Send Discord lineup lock reminders hourly"
  schedule_expression = "rate(1 hour)"

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "discord_lineup_reminders" {
  rule      = aws_cloudwatch_event_rule.discord_lineup_reminders.name
  target_id = "discord-lineup-reminders"
  arn       = aws_lambda_function.graphql.arn

  input = jsonencode({
    httpMethod = "POST"
    body = jsonencode({
      query = "mutation { sendDiscordLineupReminders { leaguesChecked remindersSent errors } }"
    })
    headers = {
      "content-type"     = "application/json"
      "x-system-api-key" = random_password.system_api_key.result
    }
    requestContext = {
      http = {
        method = "POST"
      }
    }
  })
}

resource "aws_lambda_permission" "discord_lineup_reminders_eventbridge" {
  statement_id  = "AllowEventBridgeDiscordLineupReminders"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.graphql.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.discord_lineup_reminders.arn
}

# ── Discord Weekly Recaps ──────────────────────────────────────────
# Posts weekly recap (results, standings, top scorer) to league Discord channels.
# Runs Sunday at 10am Eastern (15:00 UTC) — after autoAdvanceMatchups (8am UTC)
# has advanced the week, so currentWeek-1 contains the just-completed week.
# Note: 15:00 UTC = 10am EST / 11am EDT. EventBridge uses UTC; adjust if
# DST precision is needed (same pattern as other schedules in this file).

resource "aws_cloudwatch_event_rule" "discord_weekly_recaps" {
  name                = "${local.name_prefix}-discord-weekly-recaps"
  description         = "Post weekly Discord recaps every Sunday at 10am EST"
  schedule_expression = "cron(0 15 ? * SUN *)"

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "discord_weekly_recaps" {
  rule      = aws_cloudwatch_event_rule.discord_weekly_recaps.name
  target_id = "discord-weekly-recaps"
  arn       = aws_lambda_function.graphql.arn

  input = jsonencode({
    httpMethod = "POST"
    body = jsonencode({
      query = "mutation { sendDiscordWeeklyRecaps { leaguesChecked recapsSent errors } }"
    })
    headers = {
      "content-type"     = "application/json"
      "x-system-api-key" = random_password.system_api_key.result
    }
    requestContext = {
      http = {
        method = "POST"
      }
    }
  })
}

resource "aws_lambda_permission" "discord_weekly_recaps_eventbridge" {
  statement_id  = "AllowEventBridgeDiscordWeeklyRecaps"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.graphql.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.discord_weekly_recaps.arn
}

# ── Dues Reminders ───────────────────────────────────────────────────
# Checks all leagues with dues reminders enabled and posts a reminder
# to league chat (and Discord if configured) for unpaid members.
# Runs daily at 14:00 UTC (9am EST / 10am EDT). Only fires for leagues whose
# configured reminder day matches the current day of week. This uses a fixed UTC
# time, so the local execution time will shift by one hour during DST.

resource "aws_cloudwatch_event_rule" "dues_reminders" {
  name                = "${local.name_prefix}-dues-reminders"
  description         = "Send dues reminders to league chat daily at 14:00 UTC (9am EST / 10am EDT)"
  schedule_expression = "cron(0 14 * * ? *)"

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "dues_reminders" {
  rule      = aws_cloudwatch_event_rule.dues_reminders.name
  target_id = "dues-reminders"
  arn       = aws_lambda_function.graphql.arn

  input = jsonencode({
    httpMethod = "POST"
    body = jsonencode({
      query = "mutation { sendDuesReminders { leaguesChecked remindersSent errors } }"
    })
    headers = {
      "content-type"     = "application/json"
      "x-system-api-key" = random_password.system_api_key.result
    }
    requestContext = {
      http = {
        method = "POST"
      }
    }
  })
}

resource "aws_lambda_permission" "dues_reminders_eventbridge" {
  statement_id  = "AllowEventBridgeDuesReminders"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.graphql.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.dues_reminders.arn
}

# ── Subscription Grace-Period Expiry (LS-2614) ──────────────────────
# Downgrades premium users whose payment-failure grace period has passed.
# Stripe only fires `invoice.payment_failed` a limited number of times before
# giving up; if no event arrives past the 7-day grace period the Stripe webhook
# handler never sees a trigger to downgrade. This hourly sweep closes the gap.
# The mutation short-circuits quickly when no rows match, so cost is negligible.

resource "aws_cloudwatch_event_rule" "expire_subscription_grace_periods" {
  name                = "${local.name_prefix}-expire-subscription-grace-periods"
  description         = "Downgrade expired subscription grace periods hourly"
  schedule_expression = "rate(1 hour)"

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "expire_subscription_grace_periods" {
  rule      = aws_cloudwatch_event_rule.expire_subscription_grace_periods.name
  target_id = "expire-subscription-grace-periods"
  arn       = aws_lambda_function.graphql.arn

  input = jsonencode({
    httpMethod = "POST"
    body = jsonencode({
      query = "mutation { expireSubscriptionGracePeriods { expired errors } }"
    })
    headers = {
      "content-type"     = "application/json"
      "x-system-api-key" = random_password.system_api_key.result
    }
    requestContext = {
      http = {
        method = "POST"
      }
    }
  })
}

resource "aws_lambda_permission" "expire_subscription_grace_periods_eventbridge" {
  statement_id  = "AllowEventBridgeExpireSubscriptionGracePeriods"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.graphql.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.expire_subscription_grace_periods.arn
}

# ── Football: Weekly Season Stats Refresh ──────────────────────────────
# Pulls the latest PFR season-totals for players on active football leagues.
# Fires every Tuesday at 07:00 UTC (2am EST) — the day after Monday Night Football
# so all week's box scores are final.
#
# The NFL season runs Sept 1 – Feb 15; the lambda-side no-op guard in
# refreshFootballWeeklySeasonStats returns triggered:false outside that window
# so this rule can stay enabled year-round without wasting work.
# Season-window dates are documented in lib/utils/src/lib/season-constants.ts.

resource "aws_cloudwatch_event_rule" "football_weekly_season_refresh" {
  name                = "${local.name_prefix}-football-weekly-season-refresh"
  description         = "Refresh PFR season-totals for active football leagues every Tuesday at 2am EST (07:00 UTC); no-ops outside NFL season"
  schedule_expression = "cron(0 7 ? * TUE *)"

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "football_weekly_season_refresh" {
  rule      = aws_cloudwatch_event_rule.football_weekly_season_refresh.name
  target_id = "football-weekly-season-refresh"
  arn       = aws_lambda_function.graphql.arn

  input = jsonencode({
    httpMethod = "POST"
    body = jsonencode({
      query = "mutation { refreshFootballWeeklySeasonStats { triggered reason errors } }"
    })
    headers = {
      "content-type"     = "application/json"
      "x-system-api-key" = random_password.system_api_key.result
    }
    requestContext = {
      http = {
        method = "POST"
      }
    }
  })
}

resource "aws_lambda_permission" "football_weekly_season_refresh_eventbridge" {
  statement_id  = "AllowEventBridgeFootballWeeklySeasonRefresh"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.graphql.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.football_weekly_season_refresh.arn
}

# ── Football: Annual Career Stats Refresh ──────────────────────────────
# Refreshes PFR career stats for all football players after the NFL season ends.
# Fires once per year on March 1 at 06:00 UTC — always post-Super Bowl,
# so no season-window guard is needed at the lambda level.
# Season-window dates are documented in lib/utils/src/lib/season-constants.ts.

resource "aws_cloudwatch_event_rule" "football_career_refresh" {
  name                = "${local.name_prefix}-football-career-refresh"
  description         = "Refresh PFR career stats for all football players once per year on March 1 at 06:00 UTC (post-Super Bowl)"
  schedule_expression = "cron(0 6 1 3 ? *)"

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "football_career_refresh" {
  rule      = aws_cloudwatch_event_rule.football_career_refresh.name
  target_id = "football-career-refresh"
  arn       = aws_lambda_function.graphql.arn

  input = jsonencode({
    httpMethod = "POST"
    body = jsonencode({
      query = "mutation { refreshFootballCareerStats { triggered reason errors } }"
    })
    headers = {
      "content-type"     = "application/json"
      "x-system-api-key" = random_password.system_api_key.result
    }
    requestContext = {
      http = {
        method = "POST"
      }
    }
  })
}

resource "aws_lambda_permission" "football_career_refresh_eventbridge" {
  statement_id  = "AllowEventBridgeFootballCareerRefresh"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.graphql.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.football_career_refresh.arn
}
