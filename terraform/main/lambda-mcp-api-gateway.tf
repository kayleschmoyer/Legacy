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
# Cloud agents (Copilot Coding Agent) reach the same API Gateway endpoints with
# a Cognito machine-grant bearer minted in copilot-setup-steps.yml from the
# client_credentials secret — the legacy AWS_IAM Lambda Function URL / SigV4
# path and the mcp_invoke IAM policy were retired in LS-5093 (RFC AC-A6/A7,
# GAP-9). One auth path everywhere.
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
  # `openid` plus all resource-server scopes so VS Code Agent mode can
  # request `mcp/github`, `mcp/jira`, and `mcp/ci` — VS Code reads the
  # server's OAuth metadata and requests the scope the server advertises.
  # The `email` and `profile` scopes were tried initially but caused
  # Cognito's /oauth2/authorize endpoint to redirect to
  # /error?error=Required+parameters+missing — empirically `scope=openid`
  # alone returns the expected 302 to /login. If we ever need profile
  # claims in tokens, revisit and add the necessary read_attributes /
  # standard-attribute schema entries to make those scopes acceptable.
  allowed_oauth_scopes = concat(
    ["openid"],
    aws_cognito_resource_server.mcp.scope_identifiers,
  )

  # Cognito matches redirect URIs by EXACT string — it does NOT apply the
  # RFC 8252 §7.3 loopback rule that ignores the port, so every callback must
  # be registered verbatim (scheme + host + port + path, including any
  # trailing slash):
  #   - Claude Code CLI listens on fixed loopback port 57329 (no trailing slash).
  #   - VS Code Agent mode listens on fixed loopback port 33418 and sends a
  #     trailing-slash redirect_uri: http://127.0.0.1:33418/
  # If VS Code's loopback port ever changes, update the entry below to the
  # exact redirect_uri shown in the /oauth2/authorize URL.
  callback_urls = ["http://localhost:57329", "http://127.0.0.1:33418/"]
  logout_urls   = ["http://localhost:57329", "http://127.0.0.1:33418/"]

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

# ── Machine (client_credentials) grant — headless MCP auth (LS-5090) ─────────
#
# mcp_cli above is a *public* client driving the interactive
# authorization-code + PKCE flow for human developers. It cannot serve
# headless / non-SSO environments (cloud agents, lapsed-SSO worktrees) because
# there is no machine-to-machine grant — RFC failure F2 / GAP-1
# (docs/rfcs/draft-seamless-mcp-auth.md, Track A step 1).
#
# This resource server + confidential client add that grant:
#   * a resource server "mcp" exposing one scope per hosted MCP server, so a
#     minted token can be scoped to exactly the server(s) a context needs
#     (least privilege, RFC OQ-4) — a token bearing only `mcp/jira` is useless
#     against the GitHub or CI Lambda once they enforce scope (LS-5092);
#   * a confidential client (generate_secret = true) restricted to the
#     `client_credentials` flow, which exchanges the machine secret for a
#     short-lived access token with no human in the loop.
#
# The client-side minting command (headersHelper, LS-5091) and the Lambda-side
# scope enforcement (LS-5092) are out of scope here. This story only provisions
# the Cognito grant and publishes its identifiers (SSM + Secrets Manager below).

resource "aws_cognito_resource_server" "mcp" {
  user_pool_id = aws_cognito_user_pool.mcp_dev.id
  identifier   = "mcp"
  name         = "${local.name_prefix}-mcp"

  # The full scope string a client requests is "<identifier>/<scope_name>" →
  # "mcp/jira", "mcp/github", "mcp/ci".
  scope {
    scope_name        = "jira"
    scope_description = "Invoke the Jira MCP server"
  }
  scope {
    scope_name        = "github"
    scope_description = "Invoke the GitHub MCP server"
  }
  scope {
    scope_name        = "ci"
    scope_description = "Invoke the CI MCP server"
  }
}

# Confidential client for the headless machine-to-machine grant. Separate from
# mcp_cli (which stays public/interactive — do not fold these together).
resource "aws_cognito_user_pool_client" "mcp_machine" {
  name         = "${local.name_prefix}-mcp-machine"
  user_pool_id = aws_cognito_user_pool.mcp_dev.id

  # Confidential client — the generated secret is the long-lived machine
  # credential. It is exchanged for a short-lived access token via
  # client_credentials and (per RFC Track A) never transits the MCP wire.
  generate_secret = true

  allowed_oauth_flows                  = ["client_credentials"]
  allowed_oauth_flows_user_pool_client = true

  # Only the custom resource-server scopes — client_credentials cannot request
  # openid/email/profile. Referencing scope_identifiers also orders the
  # resource server before this client on apply.
  allowed_oauth_scopes = aws_cognito_resource_server.mcp.scope_identifiers

  # No callback/logout URLs and no explicit_auth_flows: client_credentials is a
  # back-channel token exchange with no browser redirect and no user auth flow.
  # No supported_identity_providers: the grant authenticates the client itself
  # (COGNITO), not a federated user.

  # client_credentials issues only an access token (no id/refresh token), so
  # only access_token_validity applies. The headersHelper (LS-5091) re-mints
  # per connect, but a single long-lived connection must outlive its token to
  # satisfy RFC AC-G1 (>24h session survives without re-auth). 24h is Cognito's
  # per-token maximum; LS-5091 verification owns any further tuning.
  access_token_validity = 24
  token_validity_units {
    access_token = "hours"
  }
}

# ── Connector (authorization_code) client — claude.ai custom remote MCP (LS-5151) ──
#
# claude.ai's custom remote MCP connector UI requires a *pre-registered* OAuth
# client_id: Cognito does not support OAuth Dynamic Client Registration
# (RFC 7591), so the connector cannot self-register one. None of the existing
# clients fit — mcp_cli is public/PKCE but only has the localhost CLI callback
# and the bare `openid` scope; mcp_machine is client_credentials only (no
# browser flow). This public client drives the authorization-code + PKCE flow
# from the claude.ai connector and requests the resource-server `mcp/*` scopes
# so the issued *access token* (which claude.ai sends as the bearer, not the ID
# token) carries them and passes each server's bearer-auth scope check
# (lib/mcp-bearer-auth). The owner pastes this client's id into the connector
# dialog (LS-5152).
resource "aws_cognito_user_pool_client" "mcp_connector" {
  name         = "${local.name_prefix}-mcp-connector"
  user_pool_id = aws_cognito_user_pool.mcp_dev.id

  # Public client — claude.ai uses PKCE, no client secret.
  generate_secret = false

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true

  # `openid` (so a standard OIDC code flow works) plus every resource-server
  # scope, so the issued access token carries `mcp/jira`, `mcp/github`, and
  # `mcp/ci`. Each per-server connector advertises only its own scope via the
  # Lambda's MCP_OAUTH_SCOPES (see lambda-mcp-<server>.tf), but the client must
  # be *allowed* all of them so any one server's consent flow succeeds.
  allowed_oauth_scopes = concat(
    ["openid"],
    aws_cognito_resource_server.mcp.scope_identifiers,
  )

  # The redirect URI claude.ai uses for custom remote MCP connectors.
  # ⚠ Cognito matches callback URLs EXACTLY. This value must be confirmed
  # against the claude.ai connector dialog before the owner registers the
  # connector (LS-5152) — it may be a claude.com variant. If consent fails with
  # redirect_mismatch, correct this URL and re-apply.
  callback_urls = ["https://claude.ai/api/mcp/auth_callback"]

  # Static "COGNITO" when no SAML metadata URL is configured; appends the SAML
  # provider name when set. See locals.mcp_supported_identity_providers.
  supported_identity_providers = local.mcp_supported_identity_providers

  # Wait for the SAML identity provider (when enabled) so the provider_name in
  # supported_identity_providers resolves on the first apply — mirrors mcp_cli.
  depends_on = [aws_cognito_identity_provider.mcp_ic]

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]

  # 24h id/access = Cognito's maximum; covers any realistic single workday
  # without re-consent. Claude Code does not auto-refresh OAuth tokens
  # mid-session (anthropics/claude-code#58607), so a longer TTL is the only
  # client-side mitigation until upstream ships a fix.
  # 30d refresh (the connector survives without re-consent across days).
  access_token_validity  = 24
  id_token_validity      = 24
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

# Machine (client_credentials) client id — non-sensitive, published to SSM
# alongside the interactive client id above. Its secret is sensitive and goes
# to Secrets Manager (below). The headersHelper minting command (LS-5091) reads
# both to perform the client_credentials exchange.
resource "aws_ssm_parameter" "mcp_cognito_machine_client_id" {
  name  = "/${local.name_prefix}/mcp/cognito/machine-client-id"
  type  = "String"
  value = aws_cognito_user_pool_client.mcp_machine.id
  tags  = local.common_tags
}

# Connector (authorization_code) public client id — non-sensitive (no secret,
# PKCE). Published alongside the other client ids so the owner can read it from
# SSM rather than the Terraform output when registering the claude.ai connector
# (LS-5152).
resource "aws_ssm_parameter" "mcp_cognito_connector_client_id" {
  name  = "/${local.name_prefix}/mcp/cognito/connector-client-id"
  type  = "String"
  value = aws_cognito_user_pool_client.mcp_connector.id
  tags  = local.common_tags
}

resource "aws_ssm_parameter" "mcp_cognito_domain" {
  name  = "/${local.name_prefix}/mcp/cognito/domain"
  type  = "String"
  value = local.mcp_cognito_hosted_ui
  tags  = local.common_tags
}

# ── Secrets Manager — machine client secret ──────────────────────────────────
# The confidential client's generated secret is the long-lived machine
# credential. It is co-located here (rather than secrets.tf) with the client
# that generates it, per LS-5090. Terraform sources the value directly from the
# Cognito client, so — unlike the externally-provided secrets in secrets.tf —
# this needs no manual `put-secret-value` bootstrap. NOTE: the value therefore
# lives in Terraform state; protect the state backend accordingly (same posture
# as database_password / rollbar_access_token in secrets.tf).
resource "aws_secretsmanager_secret" "mcp_machine_client_secret" {
  name        = "${var.environment}/mcp-machine-client-secret"
  description = "Cognito client_credentials secret for headless MCP server auth (LS-5090)"
  tags        = local.common_tags
}

resource "aws_secretsmanager_secret_version" "mcp_machine_client_secret" {
  secret_id     = aws_secretsmanager_secret.mcp_machine_client_secret.id
  secret_string = aws_cognito_user_pool_client.mcp_machine.client_secret
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

output "mcp_cognito_machine_client_id" {
  description = "Cognito client_credentials (machine) app client id — used by the headless MCP minting command (LS-5091). The secret lives in Secrets Manager at <env>/mcp-machine-client-secret."
  value       = aws_cognito_user_pool_client.mcp_machine.id
}

output "mcp_cognito_connector_client_id" {
  description = "Cognito authorization-code (public, PKCE) app client id for the claude.ai custom remote MCP connector (LS-5151). Paste into the claude.ai connector dialog as the OAuth client_id (LS-5152). No secret — public client. Also published to SSM at /<name_prefix>/mcp/cognito/connector-client-id."
  value       = aws_cognito_user_pool_client.mcp_connector.id
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
