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



# Outputs for easy access to parameter names
output "lambda_version_parameters" {
  description = "SSM parameter names for Lambda versions"
  value = {
    bucket_name    = aws_ssm_parameter.lambda_deployments_bucket.name
    graphql        = aws_ssm_parameter.graphql_lambda_version.name
    stats          = aws_ssm_parameter.stats_lambda_version.name
    oauth_proxy    = aws_ssm_parameter.oauth_proxy_lambda_version.name
    game_selection = aws_ssm_parameter.game_selection_lambda_version.name
    websocket      = aws_ssm_parameter.websocket_lambda_version.name
  }
}
