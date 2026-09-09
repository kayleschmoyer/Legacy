# OAuth Proxy Lambda Configuration
resource "aws_iam_role" "oauth_proxy_lambda" {
  name        = "${local.name_prefix}-oauth-proxy-lambda-role"
  description = "Execution role for the OAuth Proxy Lambda function"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "oauth_proxy_lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.oauth_proxy_lambda.name
}

# OAuth Lambda now requires VPC access for private subnet deployment
resource "aws_iam_role_policy_attachment" "oauth_proxy_lambda_vpc" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
  role       = aws_iam_role.oauth_proxy_lambda.name
}

# OAuth Lambda secrets - OAuth + Database secrets for secure user management
resource "aws_iam_policy" "oauth_proxy_lambda_secrets" {
  # name_prefix, not name: `description` (like `name` itself) is ForceNew on
  # aws_iam_policy -- IAM has no update API for either -- so editing the
  # description replaces the policy. With a fixed name the create-before-destroy
  # replacement collides with the policy it is replacing and the whole
  # `terraform apply` aborts on `409 EntityAlreadyExists` (LS-9876, and
  # LS-6675 before it). A generated name makes the replacement always safe.
  name_prefix = "${local.name_prefix}-oauth-proxy-lambda-secrets-"
  description = "IAM policy for OAuth Lambda to access OAuth and database secrets securely"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = concat(
          [
            # OAuth secrets
            aws_secretsmanager_secret.google_oauth_client_secret.arn,
            aws_secretsmanager_secret.jwt_secret.arn,
            aws_secretsmanager_secret.oauth_proxy_cookie_secret.arn,
            # Database secrets for private user management
            aws_secretsmanager_secret.database_credentials.arn,
            # Discord new-user signup webhook URL
            aws_secretsmanager_secret.discord_user_signup_webhook_url.arn,
            # Rollbar access token for error tracking
            aws_secretsmanager_secret.rollbar_access_token.arn,
            # Stripe secret key — mint live entitlements into the JWT (LS-8647/LS-8644)
            aws_secretsmanager_secret.stripe_secret_key.arn,
          ],
          # Discord OAuth secret (only when configured)
          var.discord_client_secret != "" ? [aws_secretsmanager_secret.discord_client_secret[0].arn] : []
        )
      }
    ]
  })

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_iam_role_policy_attachment" "oauth_proxy_lambda_secrets" {
  policy_arn = aws_iam_policy.oauth_proxy_lambda_secrets.arn
  role       = aws_iam_role.oauth_proxy_lambda.name

  # Paired with create_before_destroy on the policy above: the new attachment
  # is made before the old one is removed, so the role is never left without
  # this policy mid-apply.
  lifecycle {
    create_before_destroy = true
  }
}

# OAuth Lambda RDS access for secure user management operations
resource "aws_iam_policy" "oauth_proxy_lambda_rds" {
  # name_prefix, not name: `description` (like `name` itself) is ForceNew on
  # aws_iam_policy -- IAM has no update API for either -- so editing the
  # description replaces the policy. With a fixed name the create-before-destroy
  # replacement collides with the policy it is replacing and the whole
  # `terraform apply` aborts on `409 EntityAlreadyExists` (LS-9876, and
  # LS-6675 before it). A generated name makes the replacement always safe.
  name_prefix = "${local.name_prefix}-oauth-proxy-lambda-rds-v2-"
  description = "IAM policy for OAuth Lambda to access RDS for secure user management"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "rds-db:connect"
        ]
        Resource = [
          "arn:aws:rds-db:${local.region}:${local.account_id}:dbuser:${var.enable_rds_proxy ? aws_db_proxy.main[0].id : aws_db_instance.postgres.identifier}/${var.database_username}"
        ]
      }
    ]
  })

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_iam_role_policy_attachment" "oauth_proxy_lambda_rds" {
  policy_arn = aws_iam_policy.oauth_proxy_lambda_rds.arn
  role       = aws_iam_role.oauth_proxy_lambda.name

  # Paired with create_before_destroy on the policy above: the new attachment
  # is made before the old one is removed, so the role is never left without
  # this policy mid-apply.
  lifecycle {
    create_before_destroy = true
  }
}

# Read access to the signed Android APKs (LS-9454, bucket in app-downloads.tf).
# Needed so the presigned URLs this Lambda mints for the gated download route
# (LS-9455) actually resolve — a presigned URL carries the signer's authority,
# so without GetObject here every download 403s at fetch time rather than at
# signing time.
resource "aws_iam_policy" "oauth_proxy_lambda_app_downloads" {
  # name_prefix, not name: `description` (like `name` itself) is ForceNew on
  # aws_iam_policy -- IAM has no update API for either -- so editing the
  # description replaces the policy. With a fixed name the create-before-destroy
  # replacement collides with the policy it is replacing and the whole
  # `terraform apply` aborts on `409 EntityAlreadyExists` (LS-9876, and
  # LS-6675 before it). A generated name makes the replacement always safe.
  name_prefix = "${local.name_prefix}-oauth-proxy-lambda-app-downloads-"
  description = "IAM policy for OAuth Lambda to presign reads of the Android APK"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject"
        ]
        Resource = [
          "${aws_s3_bucket.app_downloads.arn}/android/*"
        ]
      }
    ]
  })

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_iam_role_policy_attachment" "oauth_proxy_lambda_app_downloads" {
  policy_arn = aws_iam_policy.oauth_proxy_lambda_app_downloads.arn
  role       = aws_iam_role.oauth_proxy_lambda.name

  # Paired with create_before_destroy on the policy above: the new attachment
  # is made before the old one is removed, so the role is never left without
  # this policy mid-apply.
  lifecycle {
    create_before_destroy = true
  }
}

# DynamoDB table for persisting OAuth device-flow codes
resource "aws_dynamodb_table" "oauth_device_flows" {
  name         = "${local.name_prefix}-oauth-device-flows"
  billing_mode = "PAY_PER_REQUEST"

  hash_key = "deviceCode"

  attribute {
    name = "deviceCode"
    type = "S"
  }

  attribute {
    name = "userCode"
    type = "S"
  }

  global_secondary_index {
    name            = "userCode-index"
    projection_type = "KEYS_ONLY"

    key_schema {
      attribute_name = "userCode"
      key_type       = "HASH"
    }
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = local.common_tags
}

# DynamoDB table for per-email failed-login throttling (LGN-020 / LS-6675).
# The in-Lambda IP limiter is per-instance and per-IP only; this table tracks
# failed attempts by target email shared across all warm containers, so a
# credential-stuffing campaign against a single email is locked out regardless
# of source IP. Rows self-expire via TTL.
resource "aws_dynamodb_table" "oauth_login_throttle" {
  name         = "${local.name_prefix}-oauth-login-throttle"
  billing_mode = "PAY_PER_REQUEST"

  hash_key = "emailHash"

  attribute {
    name = "emailHash"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = local.common_tags
}

# IAM policy granting the OAuth Lambda read/write access to the device-flow and
# login-throttle tables
resource "aws_iam_policy" "oauth_proxy_lambda_dynamodb" {
  # name_prefix, not name: `description` (like `name` itself) is ForceNew on
  # aws_iam_policy -- IAM has no update API for either -- so editing the
  # description replaces the policy. With a fixed name the create-before-destroy
  # replacement collides with the policy it is replacing and the whole
  # `terraform apply` aborts on `409 EntityAlreadyExists` (LS-9876, and
  # LS-6675 before it). A generated name makes the replacement always safe.
  name_prefix = "${local.name_prefix}-oauth-proxy-lambda-dynamodb-"
  # NOTE: An IAM policy `description` is immutable in AWS (no update API), so the
  # provider treats any change as ForceNew. Editing this string triggers a
  # destroy+recreate of a same-named global IAM policy, which races into a 409
  # EntityAlreadyExists and aborts every Lambda apply (see LS-6675 regression).
  # The grants below are updated in-place via new policy versions; keep this
  # description text frozen at the original value. Document new tables in the
  # comment above the resource, not here.
  description = "IAM policy for OAuth Lambda to access the device-flow DynamoDB table"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query"
        ]
        Resource = [
          aws_dynamodb_table.oauth_device_flows.arn,
          "${aws_dynamodb_table.oauth_device_flows.arn}/index/*",
          aws_dynamodb_table.oauth_login_throttle.arn
        ]
      }
    ]
  })

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_iam_role_policy_attachment" "oauth_proxy_lambda_dynamodb" {
  policy_arn = aws_iam_policy.oauth_proxy_lambda_dynamodb.arn
  role       = aws_iam_role.oauth_proxy_lambda.name

  # Paired with create_before_destroy on the policy above: the new attachment
  # is made before the old one is removed, so the role is never left without
  # this policy mid-apply.
  lifecycle {
    create_before_destroy = true
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "oauth_proxy_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-oauth-proxy"
  retention_in_days = local.log_retention_days[var.environment]

  tags = local.common_tags
}

# Data source to get the current OAuth Proxy Lambda version from SSM
data "aws_ssm_parameter" "oauth_proxy_lambda_version" {
  name = "/legacy-sports/${var.environment}/lambda/oauth-proxy/version"
}

# Lambda Function
resource "aws_lambda_function" "oauth_proxy" {
  s3_bucket     = aws_s3_bucket.lambda_deployments.bucket
  s3_key        = "oauth-proxy/oauth-proxy-${data.aws_ssm_parameter.oauth_proxy_lambda_version.value}.zip"
  function_name = "${local.name_prefix}-oauth-proxy"
  role          = aws_iam_role.oauth_proxy_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = var.lambda_timeout
  # Lambda CPU scales with memory, and this function's cost is dominated by
  # CPU-bound work (JSON marshalling, drizzle query building, JWT signing)
  # rather than heap — Max Memory Used sits at ~140 MB against 512 MB. At
  # 512 MB the container gets roughly a third of a vCPU, which stretched that
  # work out enough that billed duration more than paid for the higher rate.
  # Raised to 1024 MB so dev matches prod; measured before/after in LS-9530.
  memory_size = 1024

  source_code_hash = data.aws_ssm_parameter.oauth_proxy_lambda_version.value
  # Deployed version marker read by the drift-check auditor (LS-8434)
  description = data.aws_ssm_parameter.oauth_proxy_lambda_version.value

  # OAuth Lambda in PRIVATE subnets with VPC endpoints for secure internet access
  vpc_config {
    subnet_ids         = aws_subnet.private_lambda[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      # Google OAuth configuration
      CLIENT_ID                       = var.google_oauth_client_id
      GOOGLE_OAUTH_CLIENT_SECRET_PATH = aws_secretsmanager_secret.google_oauth_client_secret.name
      JWT_SECRET_KEY_PATH             = aws_secretsmanager_secret.jwt_secret.name
      COOKIE_SECRET_KEY_PATH          = aws_secretsmanager_secret.oauth_proxy_cookie_secret.name

      # Database configuration for direct user management (secure, private)
      DB_SECRET_NAME        = aws_secretsmanager_secret.database_credentials.name
      DB_HOST               = var.enable_rds_proxy ? aws_db_proxy.main[0].endpoint : aws_db_instance.postgres.endpoint
      USE_LOCAL_CREDENTIALS = "false"

      # Gated Android APK download (LS-9454 / LS-9455). The route presigns
      # APP_DOWNLOAD_ANDROID_CURRENT_KEY out of APP_DOWNLOAD_BUCKET; CI writes
      # both that pointer and the versioned keys under android/.
      APP_DOWNLOAD_BUCKET              = aws_s3_bucket.app_downloads.bucket
      APP_DOWNLOAD_ANDROID_CURRENT_KEY = "android/current/legacy-sports-latest.apk"

      # Runtime configuration
      NODE_ENV                            = var.environment
      LOG_LEVEL                           = "debug"
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"

      # Rollbar error tracking (token fetched from Secrets Manager at cold-start)
      ROLLBAR_ACCESS_TOKEN_SECRET_NAME = aws_secretsmanager_secret.rollbar_access_token.name

      # Stripe secret key name — read at cold start to mint live entitlements
      # into the JWT (LS-8647 reachability; consumed by LS-8644). The lambda
      # already runs in the same private subnets + security group as the
      # stripe-webhook lambda, so it shares the existing NAT egress path to the
      # Stripe API — no additional networking is required.
      STRIPE_SECRET_KEY_SECRET_NAME = aws_secretsmanager_secret.stripe_secret_key.name

      # CORS — comma-separated origins allowed to make credentialed requests.
      # The Lambda code defaults to https://legacy-fantasy.com when not set,
      # but we make it explicit here so staging/PR environments can override it.
      # In dev, also allow localhost dev-server origins (web app on :4200,
      # storybook on :4280) so developers can hit dev OAuth endpoints from a
      # local frontend (LS-4546).
      CORS_ALLOWED_ORIGINS = join(",", concat(
        ["https://${var.domain_name}", "https://www.${var.domain_name}"],
        var.environment == "dev" ? ["http://localhost:4200", "http://localhost:4280"] : []
      ))

      # Cookie domain — scopes ls_jwt and ls_csrf to all subdomains so that
      # the WebSocket Lambda (ws.<domain>) receives the auth cookie.
      COOKIE_DOMAIN = var.domain_name != "" ? var.domain_name : ""

      # Device-flow DynamoDB table
      DEVICE_FLOW_TABLE_NAME = aws_dynamodb_table.oauth_device_flows.name

      # Per-email login-throttle DynamoDB table (LGN-020 / LS-6675)
      LOGIN_THROTTLE_TABLE_NAME = aws_dynamodb_table.oauth_login_throttle.name

      # Discord new-user signup notification webhook (fetched from Secrets Manager at cold start)
      DISCORD_USER_SIGNUP_WEBHOOK_URL_SECRET_NAME = aws_secretsmanager_secret.discord_user_signup_webhook_url.name

      # Discord OAuth configuration (optional — omit to disable Discord login)
      DISCORD_CLIENT_ID          = var.discord_client_id
      DISCORD_CLIENT_SECRET_PATH = var.discord_client_secret != "" ? aws_secretsmanager_secret.discord_client_secret[0].name : ""
      DISCORD_REDIRECT_URI       = var.discord_redirect_uri

      # Native (mobile) Discord PKCE flow — comma-separated allow-list of custom-scheme
      # redirect URIs the device may supply on the native code exchange. Validated by
      # handleDiscordAuthNative before forwarding to Discord's token endpoint; unset means
      # no native redirect URI is permitted (native exchange returns 400 Invalid redirect_uri).
      DISCORD_NATIVE_REDIRECT_URIS = var.discord_native_redirect_uris
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.oauth_proxy_lambda_basic,
    aws_iam_role_policy_attachment.oauth_proxy_lambda_vpc,
    aws_iam_role_policy_attachment.oauth_proxy_lambda_secrets,
    aws_iam_role_policy_attachment.oauth_proxy_lambda_rds,
    aws_iam_role_policy_attachment.oauth_proxy_lambda_dynamodb,
    aws_iam_role_policy_attachment.oauth_proxy_lambda_app_downloads,
    aws_cloudwatch_log_group.oauth_proxy_lambda
  ]

  tags = local.common_tags
}

# API Gateway Integration for OAuth Proxy
resource "aws_api_gateway_resource" "oauth_proxy" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_rest_api.main.root_resource_id
  path_part   = "oauth"
}

# OPTIONS method for CORS on root oauth resource
resource "aws_api_gateway_method" "oauth_proxy_root_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.oauth_proxy.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "oauth_proxy_root_options" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.oauth_proxy.id
  http_method             = aws_api_gateway_method.oauth_proxy_root_options.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.oauth_proxy.invoke_arn
}

resource "aws_api_gateway_method_response" "oauth_proxy_root_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.oauth_proxy.id
  http_method = aws_api_gateway_method.oauth_proxy_root_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers"     = true
    "method.response.header.Access-Control-Allow-Methods"     = true
    "method.response.header.Access-Control-Allow-Origin"      = true
    "method.response.header.Access-Control-Allow-Credentials" = true
  }
}

# ANY method for root oauth resource
resource "aws_api_gateway_method" "oauth_proxy_root_any" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.oauth_proxy.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "oauth_proxy_root_any" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.oauth_proxy.id
  http_method             = aws_api_gateway_method.oauth_proxy_root_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.oauth_proxy.invoke_arn
}

# Catch-all resource for OAuth proxy paths
resource "aws_api_gateway_resource" "oauth_proxy_paths" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  parent_id   = aws_api_gateway_resource.oauth_proxy.id
  path_part   = "{proxy+}"
}

# OPTIONS method for CORS
resource "aws_api_gateway_method" "oauth_proxy_options" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.oauth_proxy_paths.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "oauth_proxy_options" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.oauth_proxy_paths.id
  http_method             = aws_api_gateway_method.oauth_proxy_options.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.oauth_proxy.invoke_arn
}

resource "aws_api_gateway_method_response" "oauth_proxy_options" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  resource_id = aws_api_gateway_resource.oauth_proxy_paths.id
  http_method = aws_api_gateway_method.oauth_proxy_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers"     = true
    "method.response.header.Access-Control-Allow-Methods"     = true
    "method.response.header.Access-Control-Allow-Origin"      = true
    "method.response.header.Access-Control-Allow-Credentials" = true
  }
}

# ANY method for OAuth proxy
resource "aws_api_gateway_method" "oauth_proxy_any" {
  rest_api_id   = aws_api_gateway_rest_api.main.id
  resource_id   = aws_api_gateway_resource.oauth_proxy_paths.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "oauth_proxy_any" {
  rest_api_id             = aws_api_gateway_rest_api.main.id
  resource_id             = aws_api_gateway_resource.oauth_proxy_paths.id
  http_method             = aws_api_gateway_method.oauth_proxy_any.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.oauth_proxy.invoke_arn
}

# Lambda permission for API Gateway (root oauth path)
resource "aws_lambda_permission" "oauth_proxy_api_gateway_root" {
  statement_id  = "AllowExecutionFromAPIGatewayRoot"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.oauth_proxy.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/oauth"
}

# Lambda permission for API Gateway (proxy paths)
resource "aws_lambda_permission" "oauth_proxy_api_gateway_paths" {
  statement_id  = "AllowExecutionFromAPIGatewayPaths"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.oauth_proxy.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.main.execution_arn}/*/oauth/*"
}
