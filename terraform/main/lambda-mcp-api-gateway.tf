# MCP HTTP API Gateway — developer access via IAM Identity Center OIDC
#
# Replaces the local signing proxy (tools/mcp/signing-proxy) for developer
# machines. Each MCP server gets its own HTTP API so Claude Code can point
# directly at the invoke URL with no path-prefix stripping required.
#
# Setup order (one-time per developer, per environment):
#   1. terraform apply  (deploys APIs without auth — mcp_oidc_client_id is "")
#   2. node scripts/mcp-auth.mjs --setup
#        → registers OIDC client, does device flow, writes .env.local,
#          prints mcp_oidc_issuer_url + mcp_oidc_client_id for terraform.tfvars
#   3. Add those two values to terraform/main/terraform.tfvars, re-apply
#        → JWT authorizer activates on all three APIs
#   4. Subsequent token refreshes: node scripts/mcp-auth.mjs
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
# Created only after mcp_oidc_client_id is known (step 2 above).
# API Gateway fetches <issuer>/.well-known/jwks.json automatically to validate
# incoming ID tokens.

resource "aws_apigatewayv2_authorizer" "mcp_oidc" {
  for_each         = var.mcp_oidc_client_id != "" ? local.mcp_servers_map : {}
  api_id           = aws_apigatewayv2_api.mcp[each.key].id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "iam-ic-oidc"

  jwt_configuration {
    audience = [var.mcp_oidc_client_id]
    issuer   = var.mcp_oidc_issuer_url
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
# Only created after mcp_oidc_client_id is known so the APIs are never publicly
# reachable without JWT auth. Run 'node scripts/mcp-auth.mjs --setup' first,
# then add mcp_oidc_client_id to terraform.tfvars and re-apply.

resource "aws_apigatewayv2_route" "mcp_default" {
  for_each = var.mcp_oidc_client_id != "" ? local.mcp_servers_map : {}
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
