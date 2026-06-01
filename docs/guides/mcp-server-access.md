# Hosted MCP Server Access

The Jira, GitHub, and CI MCP servers are hosted on AWS Lambda behind an
HTTP API Gateway with a **JWT authorizer** wired to a Cognito user pool.
Every HTTP request must include `Authorization: Bearer <idToken>` where
`<idToken>` is an OIDC ID token issued by the Cognito hosted UI.

This means:

- No long-lived shared tokens — ID tokens are short-lived (~8h) and refreshable for ~30 days
- Each invocation is logged on the Lambda side with the Cognito `sub` claim
- Developers sign in once via the hosted UI; the helper script refreshes silently

> **Cloud agents (Copilot Coding Agent)** reach the same API Gateway endpoints
> with a short-lived Cognito machine-grant bearer minted in
> `.github/workflows/copilot-setup-steps.yml` from the `client_credentials`
> secret (LS-5093). The legacy SigV4/OIDC Function-URL path and the `mcp_invoke`
> IAM policy were retired. Only interactive developer machines use the Cognito
> ID-token flow described here.

---

## Prerequisites

- A Cognito user account in the `legacy-sports-dev` user pool — ask an admin
  to invite you via the AWS Console (Cognito → user pool → Users → "Create user").
  Cognito sends a temporary password by email; you set a real password on first
  sign-in via the hosted UI.
- AWS CLI v2 with SSO configured for reading the SSM parameters that hold the
  Cognito client ID and hosted UI domain (`aws configure sso`).

---

## 1. Run First-Time Setup

```bash
node scripts/mcp-auth.mjs --setup
```

The script:

1. Reads the Cognito client ID and hosted UI domain from SSM.
2. Opens the hosted UI in your browser to run the OAuth authorization code +
   PKCE flow.
3. Writes the machine credential and API Gateway URLs to `.env.local`:
   - `MCP_AUTH_TOKEN`, `MCP_AUTH_EXPIRES_AT`
   - `MCP_JIRA_URL`, `MCP_GITHUB_URL`, `MCP_CI_URL`

After setup, MCP clients can call the API Gateways directly with the bearer
token — no local proxy is required.

---

## 2. Refresh the Token

ID tokens expire after ~8h. Run:

```bash
node scripts/mcp-auth.mjs
```

This uses the stored machine credential to mint a fresh token and updates `.env.local`.

---

## 3. Configure Your MCP Client

`.mcp.json` (checked into the repo) already references the env-var URLs:

```jsonc
{
  "mcpServers": {
    "legacy-sports-jira": {
      "url": "${MCP_JIRA_URL}",
      "headers": { "Authorization": "Bearer ${MCP_AUTH_TOKEN}" },
    },
    "legacy-sports-github": {
      "url": "${MCP_GITHUB_URL}",
      "headers": { "Authorization": "Bearer ${MCP_AUTH_TOKEN}" },
    },
    "legacy-sports-ci": {
      "url": "${MCP_CI_URL}",
      "headers": { "Authorization": "Bearer ${MCP_AUTH_TOKEN}" },
    },
  },
}
```

(Consult the live `.mcp.json` for the canonical config.)

---

## Cloud Agents (GitHub Actions)

Cloud agents do not run `mcp-auth.mjs`. The Copilot Coding Agent mints a
short-lived Cognito machine-grant bearer per server scope in
`.github/workflows/copilot-setup-steps.yml` (from the `client_credentials`
secret) and sends it in the `Authorization` header to the same API Gateway
endpoints developers use. The earlier SigV4/OIDC Function-URL path — and the
`mcp_invoke` IAM policy that backed it — was retired in LS-5093 (RFC AC-A6/A7,
GAP-9).

---

## Troubleshooting

**`401 Unauthorized` from the API Gateway**

- Your `MCP_AUTH_TOKEN` is expired or missing. Run `node scripts/mcp-auth.mjs`.
- If that fails with "refresh token expired", run `node scripts/mcp-auth.mjs --force`
  to re-auth from scratch.

**`scripts/mcp-auth.mjs` cannot read SSM parameters**

- Confirm your AWS SSO session is active: `aws sts get-caller-identity`.
- Run `aws sso login --profile <profile>` if needed.

**MCP client reports the server is offline**

- Confirm `.env.local` has non-placeholder values for `MCP_JIRA_URL`,
  `MCP_GITHUB_URL`, `MCP_CI_URL`, and `MCP_AUTH_TOKEN`.
- Confirm the token has not expired: `MCP_AUTH_EXPIRES_AT` must be in the future.

See also: `terraform/main/lambda-mcp-api-gateway.tf` for the API Gateway +
Cognito setup, and `scripts/mcp-auth.mjs` for the helper-script source.
