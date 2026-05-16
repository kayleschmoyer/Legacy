# MCP HTTP API Gateway — developer access via Cognito-issued JWTs
#
# Replaces the local signing proxy (tools/mcp/signing-proxy) for developer
# machines. Each MCP server gets its own HTTP API so Claude Code can point
# directly at the invoke URL with no path-prefix stripping required.
#
# Setup order (one-time per environment, run once by any admin):
#   1. terraform apply  (creates Cognito user pool + JWT authorizers)
#   2. AWS Console → Cognito → user pool → Users → "Create user"
#        invite each developer by email (5 total). Cognito sends a
#        temporary password; user sets a real password on first sign-in.
#   3. node scripts/mcp-auth.mjs --setup
#        → reads Cognito client ID + domain from SSM, runs OAuth
#          authorization code + PKCE flow via the Cognito hosted UI,
#          writes idToken + API URLs to .env.local
#
# Per-developer token refresh (after initial setup):
#   node scripts/mcp-auth.mjs
#
# Cloud agents (GitHub Actions) continue to call Lambda Function URLs directly
# via AWS_IAM / SigV4 — the mcp_invoke policy on the github_actions role is
# unchanged.
#
# Why Cognito and not IAM Identity Center direct?
#   The earlier LS-4466 implementation used an IC Customer-managed OIDC
#   application as the JWT issuer. That design hits a hard wall: IC's
#   idToken `aud` claim is AWS-internal (not the application ARN), and
#   API Gateway's JWT authorizer strictly enforces aud — so the token
#   was always rejected even with the right signature/issuer. Cognito
#   issues a proper OIDC token where `aud` = the user pool client ID,
#   which the authorizer accepts.
#
# IC → Cognito SAML federation is intentionally NOT in this PR. With 5
# developers, admin-invited Cognito users are acceptable. A follow-up
# ticket will federate IC as a SAML identity provider into this Cognito
# user pool so developers can SSO through their IC credentials.

locals {
  mcp_servers_map = {
    jira   = "${local.name_prefix}-mcp-jira"
    github = "${local.name_prefix}-mcp-github"
    ci     = "${local.name_prefix}-mcp-ci"
  }

  # Maps each MCP server key to its Lambda invoke ARN and function name.
  # Using explicit resource references (not constructed strings) creates implicit
  # dependencies so API Gateway is not configured before the Lambdas exist.
  mcp_lambda_invoke_arns = {
    jira   = aws_lambda_function.mcp_jira.invoke_arn
    github = aws_lambda_function.mcp_github.invoke_arn
    ci     = aws_lambda_function.mcp_ci.invoke_arn
  }
  mcp_lambda_function_names = {
    jira   = aws_lambda_function.mcp_jira.function_name
    github = aws_lambda_function.mcp_github.function_name
    ci     = aws_lambda_function.mcp_ci.function_name
  }

  # Cognito OIDC issuer URL (well-known shape — JWKS lives at /.well-known/jwks.json).
  mcp_cognito_issuer = "https://cognito-idp.${local.region}.amazonaws.com/${aws_cognito_user_pool.mcp_dev.id}"

  # Hosted UI base URL — Cognito's default *.auth.<region>.amazoncognito.com
  # domain (free, no CloudFront). Custom domain not configured for dev tooling.
  mcp_cognito_hosted_ui = "https://${aws_cognito_user_pool_domain.mcp_dev.domain}.auth.${local.region}.amazoncognito.com"
}

# ── Cognito user pool — JWT issuer for API Gateway ───────────────────────────

resource "aws_cognito_user_pool" "mcp_dev" {
  name = "${local.name_prefix}-mcp-dev"

  # Admin-invited only (no self-service signup). Each developer gets a
  # temporary-password invitation email from Cognito; they set a real
  # password on first sign-in via the hosted UI.
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Block deletion via Terraform — re-creating the pool rotates the user
  # store and invalidates every developer's tokens. Manual delete via
  # the console only.
  deletion_protection = "ACTIVE"

  tags = local.common_tags
}

# Hosted UI domain — Cognito's default *.auth.<region>.amazoncognito.com.
# The `domain` value must be globally unique within the region.
#
# managed_login_version = 1 pins this domain to Cognito's classic hosted UI.
# The default (v2 "Managed Login") requires a companion
# aws_cognito_managed_login_branding resource per app client before any
# authorize request will render — without it, /oauth2/authorize redirects
# straight to /error?error=Required+parameters+missing. For an internal
# dev tool used by ~5 engineers, the classic UI is fine and we skip the
# extra branding plumbing.
resource "aws_cognito_user_pool_domain" "mcp_dev" {
  domain                = "${local.name_prefix}-mcp"
  user_pool_id          = aws_cognito_user_pool.mcp_dev.id
  managed_login_version = 1
}

# OAuth client used by scripts/mcp-auth.mjs. Public client (no secret) —
# authentication relies on PKCE. callback_urls must include the localhost
# redirect the CLI listens on; logout_urls match for the optional
# /oauth2/logout endpoint.
resource "aws_cognito_user_pool_client" "mcp_cli" {
  name         = "${local.name_prefix}-mcp-cli"
  user_pool_id = aws_cognito_user_pool.mcp_dev.id

  generate_secret = false

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  # Just `openid` — the JWT idToken is all API Gateway's JWT authorizer
  # needs (it validates iss/aud/exp/sig, not custom claims). The `email`
  # and `profile` scopes were tried initially but caused Cognito's
  # /oauth2/authorize endpoint to redirect to
  # /error?error=Required+parameters+missing — empirically `scope=openid`
  # alone returns the expected 302 to /login. If we ever need profile
  # claims in tokens, revisit and add the necessary read_attributes /
  # standard-attribute schema entries to make those scopes acceptable.
  allowed_oauth_scopes = ["openid"]

  callback_urls = ["http://localhost:57329"]
  logout_urls   = ["http://localhost:57329"]

  supported_identity_providers = ["COGNITO"]

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]

  # Token TTLs:
  #   - id/access: 8h (matches the original IC design — short enough that
  #     a leaked token expires within a workday)
  #   - refresh: 30d (so developers don't have to re-auth daily)
  access_token_validity  = 8
  id_token_validity      = 8
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
}

# ── SSM — publish Cognito identifiers for scripts/mcp-auth.mjs ────────────────

resource "aws_ssm_parameter" "mcp_cognito_user_pool_id" {
  name  = "/${local.name_prefix}/mcp/cognito/user-pool-id"
  type  = "String"
  value = aws_cognito_user_pool.mcp_dev.id
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "mcp_cognito_client_id" {
  name  = "/${local.name_prefix}/mcp/cognito/client-id"
  type  = "String"
  value = aws_cognito_user_pool_client.mcp_cli.id
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "mcp_cognito_domain" {
  name  = "/${local.name_prefix}/mcp/cognito/domain"
  type  = "String"
  value = local.mcp_cognito_hosted_ui
  tags  = local.common_tags
}

# ── HTTP APIs (one per server) ────────────────────────────────────────────────

resource "aws_apigatewayv2_api" "mcp" {
  for_each      = local.mcp_servers_map
  name          = "${local.name_prefix}-mcp-${each.key}"
  protocol_type = "HTTP"
  description   = "MCP ${each.key} server — developer access via Cognito JWT"
  tags          = local.common_tags
}

# ── JWT authoriser — Cognito-issued OIDC tokens ───────────────────────────────
# API Gateway fetches <issuer>/.well-known/jwks.json automatically to validate
# incoming ID tokens. The audience is the Cognito user-pool client ID, which
# matches the `aud` claim Cognito puts in id tokens.

resource "aws_apigatewayv2_authorizer" "mcp_oidc" {
  for_each         = local.mcp_servers_map
  api_id           = aws_apigatewayv2_api.mcp[each.key].id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-oidc"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.mcp_cli.id]
    issuer   = local.mcp_cognito_issuer
  }
}

# ── Lambda integrations ───────────────────────────────────────────────────────

resource "aws_apigatewayv2_integration" "mcp" {
  for_each               = local.mcp_servers_map
  api_id                 = aws_apigatewayv2_api.mcp[each.key].id
  integration_type       = "AWS_PROXY"
  integration_uri        = local.mcp_lambda_invoke_arns[each.key]
  payload_format_version = "2.0"
}

# ── $default route — catches every method + path ──────────────────────────────

resource "aws_apigatewayv2_route" "mcp_default" {
  for_each = local.mcp_servers_map
  api_id   = aws_apigatewayv2_api.mcp[each.key].id

  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.mcp[each.key].id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.mcp_oidc[each.key].id
}

# ── Stage (auto-deploy) ───────────────────────────────────────────────────────

resource "aws_apigatewayv2_stage" "mcp" {
  for_each    = local.mcp_servers_map
  api_id      = aws_apigatewayv2_api.mcp[each.key].id
  name        = "$default"
  auto_deploy = true
  tags        = local.common_tags
}

# ── Lambda resource-policy permissions ───────────────────────────────────────
# Grants each API Gateway the right to invoke its Lambda.

resource "aws_lambda_permission" "mcp_api_gateway" {
  for_each      = local.mcp_servers_map
  statement_id  = "AllowMcpApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = local.mcp_lambda_function_names[each.key]
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.mcp[each.key].execution_arn}/*"
}

# ── SSM — publish invoke URLs for scripts/mcp-auth.mjs ───────────────────────

resource "aws_ssm_parameter" "mcp_api_url" {
  for_each = local.mcp_servers_map
  name     = "/${local.name_prefix}/mcp/${each.key}/api-url"
  type     = "String"
  value    = "https://${aws_apigatewayv2_api.mcp[each.key].id}.execute-api.${local.region}.amazonaws.com"
  tags     = local.common_tags
}

# ── Outputs ───────────────────────────────────────────────────────────────────

output "mcp_api_gateway_urls" {
  description = "API Gateway invoke URLs for MCP servers — run 'node scripts/mcp-auth.mjs' to populate .env.local"
  value = {
    for k, v in aws_apigatewayv2_api.mcp :
    k => "https://${v.id}.execute-api.${local.region}.amazonaws.com"
  }
}

output "mcp_cognito_hosted_ui" {
  description = "Cognito hosted UI base URL — use this to invite users via the AWS console"
  value       = local.mcp_cognito_hosted_ui
}
