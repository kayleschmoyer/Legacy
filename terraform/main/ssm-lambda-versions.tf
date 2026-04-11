# SSM Parameters for Lambda Versioning
# These parameters store the current version of each Lambda function
# and are updated by CI/CD pipeline when new versions are deployed

# SSM parameter to store S3 bucket name for easy access by CI/CD
resource "aws_ssm_parameter" "lambda_deployments_bucket" {
  name        = "/legacy-sports/${var.environment}/s3/lambda-deployments-bucket"
  description = "S3 bucket name for Lambda deployment packages"
  type        = "String"
  value       = aws_s3_bucket.lambda_deployments.bucket

  tags = merge(local.common_tags, {
    Component = "lambda-deployment"
  })
}

resource "aws_ssm_parameter" "graphql_lambda_version" {
  name        = "/legacy-sports/${var.environment}/lambda/graphql/version"
  description = "Current version of the GraphQL Lambda function"
  type        = "String"
  value       = "initial"

  lifecycle {
    ignore_changes = [value]
  }

  tags = merge(local.common_tags, {
    Component = "lambda-versioning"
    Function  = "graphql"
  })
}

resource "aws_ssm_parameter" "stats_lambda_version" {
  name        = "/legacy-sports/${var.environment}/lambda/stats/version"
  description = "Current version of the Stats Lambda function"
  type        = "String"
  value       = "initial"

  lifecycle {
    ignore_changes = [value]
  }

  tags = merge(local.common_tags, {
    Component = "lambda-versioning"
    Function  = "stats"
  })
}

resource "aws_ssm_parameter" "oauth_proxy_lambda_version" {
  name        = "/legacy-sports/${var.environment}/lambda/oauth-proxy/version"
  description = "Current version of the OAuth Proxy Lambda function"
  type        = "String"
  value       = "initial"

  lifecycle {
    ignore_changes = [value]
  }

  tags = merge(local.common_tags, {
    Component = "lambda-versioning"
    Function  = "oauth-proxy"
  })
}

resource "aws_ssm_parameter" "game_selection_lambda_version" {
  name        = "/legacy-sports/${var.environment}/lambda/game-selection/version"
  description = "Current version of the Game Selection Lambda function"
  type        = "String"
  value       = "initial"

  lifecycle {
    ignore_changes = [value]
  }

  tags = merge(local.common_tags, {
    Component = "lambda-versioning"
    Function  = "game-selection"
  })
}

resource "aws_ssm_parameter" "jira_proxy_lambda_version" {
  name        = "/legacy-sports/${var.environment}/lambda/jira-proxy/version"
  description = "Current version of the Jira Proxy Lambda function"
  type        = "String"
  value       = "initial"

  lifecycle {
    ignore_changes = [value]
  }

  tags = merge(local.common_tags, {
    Component = "lambda-versioning"
    Function  = "jira-proxy"
  })
}

resource "aws_ssm_parameter" "stripe_webhook_lambda_version" {
  name        = "/legacy-sports/${var.environment}/lambda/stripe-webhook/version"
  description = "Current version of the Stripe Webhook Lambda function"
  type        = "String"
  value       = "initial"

  lifecycle {
    ignore_changes = [value]
  }

  tags = merge(local.common_tags, {
    Component = "lambda-versioning"
    Function  = "stripe-webhook"
  })
}

resource "aws_ssm_parameter" "rollbar_discord_lambda_version" {
  name        = "/legacy-sports/${var.environment}/lambda/rollbar-discord/version"
  description = "Current version of the Rollbar Discord Lambda function"
  type        = "String"
  value       = "initial"

  lifecycle {
    ignore_changes = [value]
  }

  tags = merge(local.common_tags, {
    Component = "lambda-versioning"
    Function  = "rollbar-discord"
  })
}

resource "aws_ssm_parameter" "image_upload_lambda_version" {
  name        = "/legacy-sports/${var.environment}/lambda/image-upload/version"
  description = "Current version of the Image Upload Lambda function"
  type        = "String"
  value       = "initial"

  lifecycle {
    ignore_changes = [value]
  }

  tags = merge(local.common_tags, {
    Component = "lambda-versioning"
    Function  = "image-upload"
  })
}

# =============================================================================
# CI INFRASTRUCTURE PARAMETERS
# =============================================================================
# Parameters read by GitHub Actions CI without needing to run terraform output.

# RDS security group ID – CI uses this to temporarily open port 5432 for the
# migration-state check workflow and then immediately revokes the rule.
resource "aws_ssm_parameter" "rds_security_group_id" {
  name        = "/legacy-sports/${var.environment}/rds/security-group-id"
  description = "ID of the RDS security group (used by CI for temporary ingress)"
  type        = "String"
  value       = aws_security_group.rds.id

  tags = merge(local.common_tags, {
    Component = "ci"
  })
}

# Secret name for the ci_readonly PostgreSQL user credentials.
# CI fetches this parameter first, then calls secretsmanager:GetSecretValue
# to get the actual host, port, username, and password.
resource "aws_ssm_parameter" "ci_readonly_db_creds_secret_name" {
  name        = "/legacy-sports/${var.environment}/ci/readonly-db-creds-secret-name"
  description = "Secrets Manager secret name holding ci_readonly DB credentials"
  type        = "String"
  value       = aws_secretsmanager_secret.ci_readonly_db_credentials.name

  tags = merge(local.common_tags, {
    Component = "ci"
    Purpose   = "migration-check"
  })
}

# Outputs for easy access to parameter names
output "lambda_version_parameters" {
  description = "SSM parameter names for Lambda versions"
  value = {
    bucket_name     = aws_ssm_parameter.lambda_deployments_bucket.name
    graphql         = aws_ssm_parameter.graphql_lambda_version.name
    stats           = aws_ssm_parameter.stats_lambda_version.name
    oauth_proxy     = aws_ssm_parameter.oauth_proxy_lambda_version.name
    game_selection  = aws_ssm_parameter.game_selection_lambda_version.name
    websocket       = aws_ssm_parameter.websocket_lambda_version.name
    jira_proxy      = aws_ssm_parameter.jira_proxy_lambda_version.name
    rollbar_discord = aws_ssm_parameter.rollbar_discord_lambda_version.name
    github_webhook  = aws_ssm_parameter.github_webhook_lambda_version.name
  }
}
