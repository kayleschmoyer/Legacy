# ── EventBridge rules for scheduled GraphQL operations ──────────────────────
#
# Pattern: EventBridge invokes the GraphQL Lambda directly (not via API Gateway)
# with a GraphQL mutation payload. This lets us use the same endpoint for both
# manual (UI) and automatic (cron) triggers.

# ── Waiver Claim Processing ─────────────────────────────────────────────────
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

# ── Nightly Game Selection ──────────────────────────────────────────────────
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

# ── Weekly Matchup Advancement ──────────────────────────────────────────────
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

# ── Draft Pick Deadline Processing ──────────────────────────────────────────
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

# ── Discord Score Alerts ───────────────────────────────────────────────────
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

# ── Discord Lineup Lock Reminders ──────────────────────────────────────────
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

# ── Discord Weekly Recaps ──────────────────────────────────────────────────
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
