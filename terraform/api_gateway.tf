# API Gateway REST API
resource "aws_api_gateway_rest_api" "main" {
  name        = "${local.name_prefix}-api"
  description = "Legacy Sports API Gateway"

  # binary_media_types allows API Gateway to pass image bytes through to Lambda
  # without treating them as UTF-8 text. Lambda receives isBase64Encoded=true.
  binary_media_types = ["image/png", "image/jpeg", "image/webp", "image/*"]

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = local.common_tags
}

# API Gateway Deployment
resource "aws_api_gateway_deployment" "main" {
  rest_api_id = aws_api_gateway_rest_api.main.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.graphql.id,
      aws_api_gateway_method.graphql_get.id,
      aws_api_gateway_method.graphql_post.id,
      aws_api_gateway_method.graphql_options.id,
      aws_api_gateway_integration.graphql_get.id,
      aws_api_gateway_integration.graphql_post.id,
      aws_api_gateway_integration.graphql_options.id,
      # OAuth Proxy resources
      aws_api_gateway_resource.oauth_proxy.id,
      aws_api_gateway_resource.oauth_proxy_paths.id,
      aws_api_gateway_method.oauth_proxy_root_any.id,
      aws_api_gateway_method.oauth_proxy_root_options.id,
      aws_api_gateway_method.oauth_proxy_any.id,
      aws_api_gateway_method.oauth_proxy_options.id,
      aws_api_gateway_integration.oauth_proxy_root_any.id,
      aws_api_gateway_integration.oauth_proxy_root_options.id,
      aws_api_gateway_integration.oauth_proxy_any.id,
      aws_api_gateway_integration.oauth_proxy_options.id,
      # Stats resources
      aws_api_gateway_resource.stats.id,
      aws_api_gateway_resource.stats_paths.id,
      aws_api_gateway_method.stats_post.id,
      aws_api_gateway_method.stats_options.id,
      aws_api_gateway_integration.stats_post.id,
      aws_api_gateway_integration.stats_options.id,
      # Game Selection resources
      aws_api_gateway_resource.game_selection.id,
      aws_api_gateway_resource.game_selection_paths.id,
      aws_api_gateway_method.game_selection_any.id,
      aws_api_gateway_method.game_selection_options.id,
      aws_api_gateway_integration.game_selection_any.id,
      aws_api_gateway_integration.game_selection_options.id,
      # Badge resource (shields.io health badges)
      aws_api_gateway_resource.badge.id,
      aws_api_gateway_method.badge_get.id,
      aws_api_gateway_integration.badge_get.id,
      # Jira Proxy resources
      aws_api_gateway_resource.jira_proxy.id,
      aws_api_gateway_resource.jira_proxy_paths.id,
      aws_api_gateway_method.jira_proxy_root_options.id,
      aws_api_gateway_method.jira_proxy_root_any.id,
      aws_api_gateway_method.jira_proxy_options.id,
      aws_api_gateway_method.jira_proxy_any.id,
      aws_api_gateway_integration.jira_proxy_root_options.id,
      aws_api_gateway_integration.jira_proxy_root_any.id,
      aws_api_gateway_integration.jira_proxy_options.id,
      aws_api_gateway_integration.jira_proxy_any.id,
      # Rollbar Discord resources
      aws_api_gateway_resource.rollbar_discord.id,
      aws_api_gateway_resource.rollbar_discord_paths.id,
      aws_api_gateway_method.rollbar_discord_root_any.id,
      aws_api_gateway_method.rollbar_discord_any.id,
      aws_api_gateway_integration.rollbar_discord_root_any.id,
      aws_api_gateway_integration.rollbar_discord_any.id,
      # Image Upload resources
      aws_api_gateway_resource.image_upload.id,
      aws_api_gateway_resource.image_upload_paths.id,
      aws_api_gateway_method.image_upload_root_options.id,
      aws_api_gateway_method.image_upload_root_post.id,
      aws_api_gateway_method.image_upload_options.id,
      aws_api_gateway_method.image_upload_post.id,
      aws_api_gateway_integration.image_upload_root_options.id,
      aws_api_gateway_integration.image_upload_root_post.id,
      aws_api_gateway_integration.image_upload_options.id,
      aws_api_gateway_integration.image_upload_post.id,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_api_gateway_method.graphql_get,
    aws_api_gateway_method.graphql_post,
    aws_api_gateway_method.graphql_options,
    aws_api_gateway_integration.graphql_get,
    aws_api_gateway_integration.graphql_post,
    aws_api_gateway_integration.graphql_options,
    aws_api_gateway_method.jira_proxy_root_options,
    aws_api_gateway_method.jira_proxy_root_any,
    aws_api_gateway_method.jira_proxy_options,
    aws_api_gateway_method.jira_proxy_any,
    aws_api_gateway_integration.jira_proxy_root_options,
    aws_api_gateway_integration.jira_proxy_root_any,
    aws_api_gateway_integration.jira_proxy_options,
    aws_api_gateway_integration.jira_proxy_any,
    aws_api_gateway_method.rollbar_discord_root_any,
    aws_api_gateway_method.rollbar_discord_any,
    aws_api_gateway_integration.rollbar_discord_root_any,
    aws_api_gateway_integration.rollbar_discord_any,
    aws_api_gateway_method.image_upload_root_options,
    aws_api_gateway_method.image_upload_root_post,
    aws_api_gateway_method.image_upload_options,
    aws_api_gateway_method.image_upload_post,
    aws_api_gateway_integration.image_upload_root_options,
    aws_api_gateway_integration.image_upload_root_post,
    aws_api_gateway_integration.image_upload_options,
    aws_api_gateway_integration.image_upload_post,
  ]
}

# CloudWatch log group for API Gateway access logs
resource "aws_cloudwatch_log_group" "api_gateway_access_logs" {
  name              = "/aws/apigateway/${local.name_prefix}-api/access-logs"
  retention_in_days = var.environment == "prod" ? 90 : 30

  tags = local.common_tags
}

# IAM role for API Gateway to write CloudWatch logs
resource "aws_iam_role" "api_gateway_cloudwatch" {
  name = "${local.name_prefix}-api-gateway-cloudwatch"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "apigateway.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "api_gateway_cloudwatch" {
  role       = aws_iam_role.api_gateway_cloudwatch.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

# API Gateway account-level CloudWatch role (required for access logging)
resource "aws_api_gateway_account" "main" {
  cloudwatch_role_arn = aws_iam_role.api_gateway_cloudwatch.arn
}

# API Gateway Stage
resource "aws_api_gateway_stage" "main" {
  deployment_id = aws_api_gateway_deployment.main.id
  rest_api_id   = aws_api_gateway_rest_api.main.id
  stage_name    = var.environment

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway_access_logs.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      caller         = "$context.identity.caller"
      user           = "$context.identity.user"
      userAgent      = "$context.identity.userAgent"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      resourcePath   = "$context.resourcePath"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
      errorMessage   = "$context.error.message"
      integrationErr = "$context.integrationErrorMessage"
    })
  }

  depends_on = [aws_api_gateway_account.main]

  tags = local.common_tags
}

# Stage-level throttle defaults — applied to all REST endpoints (GraphQL, OAuth,
# Stats, Game Selection, /badge, etc).  Similar approach to websocket.tf but with
# lower limits (REST 50 rps / 200 burst vs WS 100 rps / 500 burst).
# For per-IP rate limiting, pair this with an AWS WAF Web ACL (see LS-789).
# Note: throttling_burst_limit is the token-bucket burst capacity (how many requests
# can temporarily exceed the steady rate), not a Lambda concurrency limit.
resource "aws_api_gateway_method_settings" "main" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  stage_name  = aws_api_gateway_stage.main.stage_name
  # */* applies the settings as defaults for every method/resource in the stage
  method_path = "*/*"

  settings {
    throttling_rate_limit  = var.api_gateway_throttle_rate_limit
    throttling_burst_limit = var.api_gateway_throttle_burst_limit
  }
}

# Badge resource — GET /badge routes to GraphQL lambda and returns a shields.io health badge
resource "aws_api_gateway_resource" "badge" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "badge"
}

resource "aws_api_gateway_method" "badge_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.badge.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "badge_get" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.badge.id
  http_method             = aws_api_gateway_method.badge_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.graphql.invoke_arn
}

# GraphQL resource
resource "aws_api_gateway_resource" "graphql" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "graphql"
}

# GraphQL POST method
resource "aws_api_gateway_method" "graphql_post" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.graphql.id
  http_method   = "POST"
  authorization = "NONE"
}

# GraphQL GET method for Explorer/Playground
resource "aws_api_gateway_method" "graphql_get" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.graphql.id
  http_method   = "GET"
  authorization = "NONE"
}

# GraphQL OPTIONS method for CORS
resource "aws_api_gateway_method" "graphql_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.graphql.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

# GraphQL POST integration
resource "aws_api_gateway_integration" "graphql_post" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.graphql.id
  http_method = aws_api_gateway_method.graphql_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.graphql.invoke_arn
}

# GraphQL GET integration for Explorer/Playground
resource "aws_api_gateway_integration" "graphql_get" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.graphql.id
  http_method = aws_api_gateway_method.graphql_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.graphql.invoke_arn
}

# GraphQL OPTIONS integration for CORS — routed through the Lambda so it can
# reflect the validated origin (MOCK integration returned Access-Control-Allow-Origin: *
# which is incompatible with credentials: 'include').
resource "aws_api_gateway_integration" "graphql_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.graphql.id
  http_method = aws_api_gateway_method.graphql_options.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.graphql.invoke_arn
}

# GraphQL POST method response
resource "aws_api_gateway_method_response" "graphql_post" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.graphql.id
  http_method = aws_api_gateway_method.graphql_post.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# GraphQL GET method response for Explorer/Playground
resource "aws_api_gateway_method_response" "graphql_get" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.graphql.id
  http_method = aws_api_gateway_method.graphql_get.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# GraphQL OPTIONS method response for CORS
resource "aws_api_gateway_method_response" "graphql_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.graphql.id
  http_method = aws_api_gateway_method.graphql_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

# NOTE: With AWS_PROXY integrations the Lambda controls its own response headers
# (including CORS). Integration response blocks are not needed — the Lambda in
# lambdas/db/src/server/handler.ts reflects the validated origin via getCorsHeaders().

# ─── Gateway-level CORS error responses ────────────────────────────────────────
#
# When API Gateway itself rejects a request before reaching the Lambda (e.g. 429
# throttle, 502 bad gateway, 503 unavailable, 504 timeout) the Lambda never runs
# and therefore cannot set CORS headers. Without these gateway_response resources
# the browser receives a no-CORS response and shows:
#   "No 'Access-Control-Allow-Origin' header is present on the requested resource."
#
# We reflect the origin wildcard here because we cannot validate the origin at the
# gateway level (no Lambda context). The Lambda still validates origins for all
# requests it handles; these responses only fire for gateway-level errors.
#
# Referenced by deploy.ps1 and deploy.sh as aws_api_gateway_gateway_response.cors
# (used when targeting the api-gateway group specifically).

locals {
  # HTTP status codes for which API Gateway may return its own error response
  # before the Lambda is invoked — each needs CORS headers so the browser can
  # read the error body.
  gateway_error_types = toset([
    "DEFAULT_4XX",
    "DEFAULT_5XX",
    "THROTTLED",
    "QUOTA_EXCEEDED",
    "ACCESS_DENIED",
    "AUTHORIZER_FAILURE",
    "AUTHORIZER_CONFIGURATION_ERROR",
    "BAD_REQUEST_PARAMETERS",
    "BAD_REQUEST_BODY",
    "INVALID_API_KEY",
    "INVALID_SIGNATURE",
    "MISSING_AUTHENTICATION_TOKEN",
    "REQUEST_TOO_LARGE",
    "RESOURCE_NOT_FOUND",
    "INTEGRATION_FAILURE",
    "INTEGRATION_TIMEOUT",
    "UNSUPPORTED_MEDIA_TYPE",
    "WAF_FILTERED",
  ])
}

resource "aws_api_gateway_gateway_response" "cors" {
  for_each = local.gateway_error_types

  rest_api_id   = aws_api_gateway_rest_api.main.id
  response_type = each.key

  response_parameters = {
    # Use the configured domain name as the allowed origin. When the Lambda is
    # not invoked (gateway-level errors), we cannot reflect the validated origin,
    # so we use the production domain directly. Falls back to the default domain
    # when domain_name is empty. Note: Allow-Credentials=true requires a specific
    # origin (not '*').
    "gatewayresponse.header.Access-Control-Allow-Origin"      = "'https://${var.domain_name != "" ? var.domain_name : "legacy-fantasy.com"}'"
    "gatewayresponse.header.Access-Control-Allow-Headers"     = "'Content-Type,Authorization,X-Requested-With,apollo-require-preflight,X-CSRF-Token'"
    "gatewayresponse.header.Access-Control-Allow-Methods"     = "'GET,POST,OPTIONS'"
    "gatewayresponse.header.Access-Control-Allow-Credentials" = "'true'"
  }

  # Return the API Gateway error message so clients can diagnose failures.
  response_templates = {
    "application/json" = "{\"message\":$context.error.messageString}"
  }

  lifecycle {
    # status_code is managed by AWS defaults per response type and is not set in
    # this config. The provider reads it back on refresh causing a phantom diff.
    ignore_changes = [status_code]
  }
}

# ─── Custom domain: api.<domain> ───────────────────────────────────────────────

# ACM certificate for api.<domain>
resource "aws_acm_certificate" "api" {
  count = var.domain_name != "" ? 1 : 0

  domain_name       = "api.${var.domain_name}"
  validation_method = "DNS"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-api-cert"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# DNS validation records for the ACM certificate
resource "aws_route53_record" "api_cert_validation" {
  for_each = var.domain_name != "" ? {
    for dvo in aws_acm_certificate.api[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  zone_id         = aws_route53_zone.main[0].zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
  allow_overwrite = true
}

# Wait for ACM certificate validation to complete
resource "aws_acm_certificate_validation" "api" {
  count = var.domain_name != "" ? 1 : 0

  certificate_arn         = aws_acm_certificate.api[0].arn
  validation_record_fqdns = [for r in aws_route53_record.api_cert_validation : r.fqdn]
}

# API Gateway custom domain name
resource "aws_api_gateway_domain_name" "api" {
  count = var.domain_name != "" ? 1 : 0

  domain_name              = "api.${var.domain_name}"
  regional_certificate_arn = aws_acm_certificate_validation.api[0].certificate_arn

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-api-domain"
  })
}

# Map the custom domain to the API Gateway stage
resource "aws_api_gateway_base_path_mapping" "api" {
  count = var.domain_name != "" ? 1 : 0

  api_id      = aws_api_gateway_rest_api.main.id
  stage_name  = aws_api_gateway_stage.main.stage_name
  domain_name = aws_api_gateway_domain_name.api[0].domain_name
}
