# MCP HTTP API Gateway — developer access via Cognito-issued JWTs
#
# This is the developer-machine auth path for the hosted MCP servers
# (historically a local SigV4 signing proxy at tools/mcp/signing-proxy
# filled that role; that package was removed in LS-4472). Each MCP server
# gets its own HTTP API so Claude Code can point directly at the invoke URL
# with no path-prefix stripping required.
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
# IC → Cognito SAML federation (LS-4473) is opt-in via the
# `mcp_ic_saml_metadata_url` Terraform variable. When set, a Cognito SAML
# identity provider is created and added to the user pool client so the
# hosted UI exposes a "Sign in with IAM Identity Center" button alongside
# the existing Cognito password form. The IC SAML application itself is
# registered manually one-time via the AWS console because Terraform
# (aws provider v6) has no resource that creates an IAM Identity Center
# customer-managed SAML 2.0 application — aws_ssoadmin_application only
# supports OAuth2/OIDC applications and 3rd-party SAML apps from the IC
# application catalog. See variables.tf (mcp_ic_saml_metadata_url) for
# the bootstrap procedure. Existing admin-invited Cognito users coexist
# with SAML-federated users so the rollout is non-disruptive; once all
# developers have signed in via IC they can be removed from the pool via
# the console and "COGNITO" dropped from supported_identity_providers in
# a follow-up.

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

  # SAML 2.0 Service Provider identifiers Cognito exposes for federated IdPs.
  # The IC SAML application registered manually in the AWS console must use
  # these exact values for its audience / ACS URL.
  mcp_cognito_saml_entity_id = "urn:amazon:cognito:sp:${aws_cognito_user_pool.mcp_dev.id}"
  mcp_cognito_saml_acs_url   = "${local.mcp_cognito_hosted_ui}/saml2/idpresponse"

  # When the IC SAML metadata URL is supplied, fold the SAML provider into
  # the user pool client's supported_identity_providers list (alongside
  # COGNITO so admin-invited users continue to work during the rollout).
  mcp_saml_provider_name = "IAMIdentityCenter"
  mcp_supported_identity_providers = (
    var.mcp_ic_saml_metadata_url != ""
    ? ["COGNITO", local.mcp_saml_provider_name]
    : ["COGNITO"]
  )
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

# ── IAM Identity Center SAML identity provider (LS-4473) ─────────────────────
#
# Federates the IAM Identity Center customer-managed SAML application (created
# manually in the AWS console — see header comment + variables.tf) into this
# Cognito user pool. When mcp_ic_saml_metadata_url is unset, no provider is
# created and the hosted UI continues to show only the Cognito password form.
#
# attribute_mapping maps SAML assertion claims to Cognito user attributes.
# IC issues an emailaddress claim using the SAML 2.0 attribute name, plus
# name/given_name/family_name on the standard schema URIs. Email is the only
# attribute Cognito strictly needs (the pool uses email as the username
# attribute), but mapping name fields too lets future auth UIs render the
# developer's name without an extra IC API call.
resource "aws_cognito_identity_provider" "mcp_ic" {
  count = var.mcp_ic_saml_metadata_url != "" ? 1 : 0

  user_pool_id  = aws_cognito_user_pool.mcp_dev.id
  provider_name = local.mcp_saml_provider_name
  provider_type = "SAML"

  provider_details = {
    MetadataURL             = var.mcp_ic_saml_metadata_url
    RequestSigningAlgorithm = "rsa-sha256"
    EncryptedResponses      = "false"
    IDPSignout              = "false"
    IDPInit                 = "false"
  }

  attribute_mapping = {
    email       = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
    name        = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
    given_name  = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"
    family_name = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"
  }
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

  # Static "COGNITO" when no SAML metadata URL is configured; when set,
  # appends the SAML provider name so the hosted UI shows both options.
  # See locals.mcp_supported_identity_providers.
  supported_identity_providers = local.mcp_supported_identity_providers

  # Force the client update to wait for the identity provider so the
  # provider_name reference resolves on the first apply where SAML is
  # enabled. depends_on accepts a (possibly empty) list of resources.
  depends_on = [aws_cognito_identity_provider.mcp_ic]

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

# ── Auth note ─────────────────────────────────────────────────────────────────
# Each Lambda validates the Cognito-issued bearer token itself (see
# tools/mcp/<server>/src/mcp-bearer-auth.ts). API Gateway used to enforce auth
# via a JWT authorizer here, but its 401 response body
# (`{"message":"Unauthorized"}`) is not a JSON-RPC envelope; Claude Code's MCP
# transport surfaces it as `ZodError: expected string, received undefined`
# instead of an actionable token-expired hint (LS-4941, follow-up to LS-4874).
# Moving validation into the Lambda lets us return a JSON-RPC error the
# client surfaces verbatim — at the cost of one extra invoke per unauth call,
# which we accept since unauth requests are rare and short-circuit before
# any tool runs. The Cognito issuer + audience are passed to each Lambda via
# MCP_COGNITO_ISSUER / MCP_COGNITO_AUDIENCE env vars.

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

  # Auth happens inside the Lambda (see the "Auth note" comment above).
  authorization_type = "NONE"
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

# ── SAML SP details — paste into the IC SAML application registration ────────
# When bootstrapping the IAM Identity Center customer-managed SAML application
# in the AWS console (one-time per environment, see header comment + LS-4473),
# use these two values as the SAML SP audience / ACS URL. They are derived
# from the existing user pool and never change after the pool is created.

output "mcp_cognito_saml_entity_id" {
  description = "SAML SP entity ID (audience) for the Cognito MCP user pool — paste into the IC SAML application's 'Application ACS URL audience' field"
  value       = local.mcp_cognito_saml_entity_id
}

output "mcp_cognito_saml_acs_url" {
  description = "SAML ACS (consumer) URL for the Cognito MCP user pool — paste into the IC SAML application's 'Application ACS URL' field"
  value       = local.mcp_cognito_saml_acs_url
}

output "mcp_cognito_saml_provider_name" {
  description = "Cognito SAML provider name — appears as the 'Sign in with …' button label on the hosted UI when mcp_ic_saml_metadata_url is configured. null when SAML federation is disabled."
  value       = var.mcp_ic_saml_metadata_url != "" ? local.mcp_saml_provider_name : null
}
