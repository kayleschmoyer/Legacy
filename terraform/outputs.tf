output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets for Lambda"
  value       = aws_subnet.private_lambda[*].id
}

output "database_subnet_ids" {
  description = "IDs of the private subnets for database"
  value       = aws_subnet.private_database[*].id
}

output "security_group_lambda_id" {
  description = "ID of the Lambda security group"
  value       = aws_security_group.lambda.id
}

output "security_group_rds_id" {
  description = "ID of the RDS security group"
  value       = aws_security_group.rds.id
}

output "rds_instance_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.postgres.endpoint
  sensitive   = true
}

output "rds_proxy_endpoint" {
  description = "RDS proxy endpoint (if enabled)"
  value       = var.enable_rds_proxy ? aws_db_proxy.main[0].endpoint : null
}

output "database_credentials_secret_arn" {
  description = "ARN of the database credentials secret"
  value       = aws_secretsmanager_secret.database_credentials.arn
}

output "jwt_secret_arn" {
  description = "ARN of the JWT secret"
  value       = aws_secretsmanager_secret.jwt_secret.arn
}

output "google_oauth_client_secret_arn" {
  description = "ARN of the Google OAuth client secret"
  value       = aws_secretsmanager_secret.google_oauth_client_secret.arn
}

output "oauth_proxy_cookie_secret_arn" {
  description = "ARN of the OAuth proxy cookie secret"
  value       = aws_secretsmanager_secret.oauth_proxy_cookie_secret.arn
}

output "sqs_load_season_stats_arn" {
  description = "ARN of the load season stats SQS queue"
  value       = aws_sqs_queue.load_season_stats.arn
}

output "sqs_load_season_stats_url" {
  description = "URL of the load season stats SQS queue"
  value       = aws_sqs_queue.load_season_stats.url
}

output "lambda_deployment_bucket" {
  description = "S3 bucket for Lambda deployment packages"
  value       = aws_s3_bucket.lambda_deployments.bucket
}

# API Gateway outputs
output "api_gateway_url" {
  description = "Base URL of the API Gateway"
  value       = "https://${aws_api_gateway_rest_api.main.id}.execute-api.${local.region}.amazonaws.com/${aws_api_gateway_stage.main.stage_name}"
}

output "graphql_endpoint" {
  description = "GraphQL endpoint URL"
  value       = "https://${aws_api_gateway_rest_api.main.id}.execute-api.${local.region}.amazonaws.com/${aws_api_gateway_stage.main.stage_name}/graphql"
}

output "oauth_proxy_endpoint" {
  description = "OAuth Proxy endpoint URL"
  value       = "https://${aws_api_gateway_rest_api.main.id}.execute-api.${local.region}.amazonaws.com/${aws_api_gateway_stage.main.stage_name}/oauth"
}

output "stats_endpoint" {
  description = "Stats Lambda endpoint URL"
  value       = "https://${aws_api_gateway_rest_api.main.id}.execute-api.${local.region}.amazonaws.com/${aws_api_gateway_stage.main.stage_name}/stats"
}

output "game_selection_endpoint" {
  description = "Game Selection endpoint URL"
  value       = "https://${aws_api_gateway_rest_api.main.id}.execute-api.${local.region}.amazonaws.com/${aws_api_gateway_stage.main.stage_name}/games"
}

# Lambda function outputs
output "graphql_lambda_function_name" {
  description = "Name of the GraphQL Lambda function"
  value       = aws_lambda_function.graphql.function_name
}

output "graphql_lambda_function_arn" {
  description = "ARN of the GraphQL Lambda function"
  value       = aws_lambda_function.graphql.arn
}

output "oauth_proxy_lambda_function_name" {
  description = "Name of the OAuth Proxy Lambda function"
  value       = aws_lambda_function.oauth_proxy.function_name
}

output "oauth_proxy_lambda_function_arn" {
  description = "ARN of the OAuth Proxy Lambda function"
  value       = aws_lambda_function.oauth_proxy.arn
}

output "stats_lambda_function_name" {
  description = "Name of the Stats Lambda function"
  value       = aws_lambda_function.stats.function_name
}

output "stats_lambda_function_arn" {
  description = "ARN of the Stats Lambda function"
  value       = aws_lambda_function.stats.arn
}

output "game_selection_lambda_function_name" {
  description = "Name of the Game Selection Lambda function"
  value       = aws_lambda_function.game_selection.function_name
}

output "game_selection_lambda_function_arn" {
  description = "ARN of the Game Selection Lambda function"
  value       = aws_lambda_function.game_selection.arn
}

output "environment_variables_summary" {
  description = "Summary of key environment variables for application configuration"
  value = {
    aws_region                   = var.aws_region
    environment                 = var.environment
    db_host                     = var.enable_rds_proxy ? aws_db_proxy.main[0].endpoint : aws_db_instance.postgres.endpoint
    db_creds_secret_name        = aws_secretsmanager_secret.database_credentials.name
    jwt_secret_name             = aws_secretsmanager_secret.jwt_secret.name
    google_oauth_client_secret_name = aws_secretsmanager_secret.google_oauth_client_secret.name
    oauth_proxy_cookie_secret_name = aws_secretsmanager_secret.oauth_proxy_cookie_secret.name
    sqs_queue_url               = aws_sqs_queue.load_season_stats.url
    google_oauth_client_id      = var.google_oauth_client_id
  }
}
