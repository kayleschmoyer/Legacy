# MCP HTTP API Gateway — developer access via IAM Identity Center OIDC
#
# Replaces the local signing proxy (tools/mcp/signing-proxy) for developer
# machines. Each MCP server gets its own HTTP API so Claude Code can point
# directly at the invoke URL with no path-prefix stripping required.
#
# Setup order (one-time per environment, run once by any admin):
#   1. terraform apply  (creates the Customer managed OIDC app + JWT authorizers)
#   2. node scripts/mcp-auth.mjs --setup
#        → reads app ARN from SSM, configures OAuth grants, does authorization
#          code flow via browser, writes idToken + URLs to .env.local
#
# Per-developer token refresh (after initial setup):
#   node scripts/mcp-auth.mjs
#
# Cloud agents (GitHub Actions) continue to call Lambda Function URLs directly
# via AWS_IAM / SigV4 — the mcp_invoke policy on the github_actions role is
# unchanged.

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

  # IAM Identity Center OIDC issuer — the 'iss' claim in idTokens issued by
  # create-token-with-iam. Matches the regional OIDC endpoint for this project.
  # Update if the IAM Identity Center instance moves to a different region.
  mcp_oidc_region = "us-east-1"
  mcp_oidc_issuer = "https://oidc.${local.mcp_oidc_region}.amazonaws.com"
}

# ── IAM Identity Center — Customer managed OIDC application ──────────────────
# Provides an application ARN that mcp-auth.mjs uses as the client_id for
# create-token-with-iam. The authorization code + PKCE flow returns an idToken
# that the API Gateway JWT authorizers below will validate.

data "aws_ssoadmin_instances" "main" {}

resource "aws_ssoadmin_application" "mcp_dev" {
  name                     = "${local.name_prefix}-mcp-dev"
  application_provider_arn = "arn:aws:sso::aws:applicationProvider/custom"
  instance_arn             = tolist(data.aws_ssoadmin_instances.main.arns)[0]

  portal_options {
    sign_in_options {
      application_url = "https://legacy-fantasy.com"
      origin          = "APPLICATION"
    }
    visibility = "DISABLED"
  }

  status = "ENABLED"
  tags   = local.common_tags
}

# Enable the openid scope so create-token-with-iam returns an idToken.
resource "aws_ssoadmin_application_access_scope" "mcp_dev_openid" {
  application_arn = aws_ssoadmin_application.mcp_dev.application_arn
  scope           = "openid"
}

# Publish the application ARN to SSM so mcp-auth.mjs can read it without
# requiring terraform.tfvars values. The authorization_code and refresh_token
# grant types are configured by 'node scripts/mcp-auth.mjs --setup' (Terraform
# has no aws_ssoadmin_application_grant resource as of provider v6).
resource "aws_ssm_parameter" "mcp_oidc_app_arn" {
  name  = "/${local.name_prefix}/mcp/oidc/app-arn"
  type  = "String"
  value = aws_ssoadmin_application.mcp_dev.application_arn
  tags  = local.common_tags
}

# ── HTTP APIs (one per server) ────────────────────────────────────────────────

resource "aws_apigatewayv2_api" "mcp" {
  for_each      = local.mcp_servers_map
  name          = "${local.name_prefix}-mcp-${each.key}"
  protocol_type = "HTTP"
  description   = "MCP ${each.key} server — developer access via IAM IC OIDC JWT"
  tags          = local.common_tags
}

# ── JWT authoriser — IAM Identity Center OIDC ─────────────────────────────────
# API Gateway fetches <issuer>/.well-known/jwks.json automatically to validate
# incoming ID tokens. The audience is the Customer managed application ARN,
# which matches the 'aud' claim in idTokens issued by create-token-with-iam.

resource "aws_apigatewayv2_authorizer" "mcp_oidc" {
  for_each         = local.mcp_servers_map
  api_id           = aws_apigatewayv2_api.mcp[each.key].id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "iam-ic-oidc"

  jwt_configuration {
    audience = [aws_ssoadmin_application.mcp_dev.application_arn]
    issuer   = local.mcp_oidc_issuer
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
# Always JWT-protected; the app ARN is known after the first terraform apply.

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
