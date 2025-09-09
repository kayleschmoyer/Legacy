# Random password for database
resource "random_password" "database_password" {
  length  = 32
  special = true
}

# AWS Secrets Manager secrets
resource "aws_secretsmanager_secret" "database_credentials" {
  name_prefix = "${local.name_prefix}-db-creds-"
  description = "Database credentials for Legacy Sports"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "database_credentials" {
  secret_id = aws_secretsmanager_secret.database_credentials.id
  secret_string = jsonencode({
    username = var.database_username
    password = random_password.database_password.result
  })
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name        = "${var.environment}/jwt-secret-key"
  description = "JWT secret key for Legacy Sports"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "google_oauth_client_secret" {
  name        = "${var.environment}/google-oauth-client-secret"
  description = "Google OAuth client secret for Legacy Sports"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "google_oauth_client_secret" {
  secret_id = aws_secretsmanager_secret.google_oauth_client_secret.id
  secret_string = "REPLACE_WITH_ACTUAL_GOOGLE_OAUTH_CLIENT_SECRET"
}

resource "aws_secretsmanager_secret" "oauth_proxy_cookie_secret" {
  name        = "${var.environment}/oauth-proxy/cookie-secret"
  description = "OAuth proxy cookie secret for Legacy Sports"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "oauth_proxy_cookie_secret" {
  secret_id = aws_secretsmanager_secret.oauth_proxy_cookie_secret.id
  secret_string = random_password.oauth_proxy_cookie_secret.result
}

resource "random_password" "oauth_proxy_cookie_secret" {
  length  = 32
  special = false
}
