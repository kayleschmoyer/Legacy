# Operator Runbook: legacy-sports-github Lambda Authentication

This runbook covers diagnosing and fixing `github_auth_status: configured: false` on the `legacy-sports-github` MCP Lambda. It is the server-side complement to the client-side [MCP diagnostics reference](../../.agents/skills/mcp-first/references/diagnostics.md).

## Symptoms

An agent session sees one of these responses when calling `github_auth_status`:

```json
{
  "configured": false,
  "source": null,
  "user": null,
  "fallback": "No GitHub token found in Lambda. AGENT_AUTHOR_APP_PRIVATE_KEY was not set — check that the GITHUB_TOKEN_SECRET_NAME Secrets Manager secret exists and contains a private_key field ..."
}
```

or, when the key is present but the exchange fails:

```json
{
  "configured": false,
  "source": null,
  "user": null,
  "fallback": "GitHub App token exchange failed: GitHub App token exchange failed (401): {\"message\":\"Bad credentials\"} ..."
}
```

Both indicate a server-side credential problem, **not** a client-side issue. The remedy is never `gh auth login` or setting `GH_TOKEN` locally.

## How the Lambda resolves credentials

At startup (`lambda.ts → ensureCredentials()`):

1. Reads the AWS Secrets Manager secret named by the `GITHUB_TOKEN_SECRET_NAME` env var on the Lambda function.
2. Parses the secret JSON and sets `AGENT_AUTHOR_APP_PRIVATE_KEY` (required), `GITHUB_APP_ID` (optional), and `GITHUB_INSTALLATION_ID` (optional) from it.
3. On the first `github_auth_status` call, `tryResolveToken()` uses `AGENT_AUTHOR_APP_PRIVATE_KEY` to mint a short-lived installation token via `POST /app/installations/{id}/access_tokens`.

Interactive sources (`.netrc`, `gh auth token`, OAuth device flow) are disabled in Lambda.

## Diagnostic steps

### Step 1 — Identify which Lambda env var names the secret

```bash
aws lambda get-function-configuration \
  --function-name legacy-sports-github-mcp \
  --query 'Environment.Variables.GITHUB_TOKEN_SECRET_NAME' \
  --output text
```

Note the secret name (e.g. `legacy-sports/github-mcp-credentials`).

### Step 2 — Verify the secret exists and has the correct shape

```bash
aws secretsmanager get-secret-value \
  --secret-id legacy-sports/github-mcp-credentials \
  --query SecretString \
  --output text | python3 -c "import sys,json; d=json.load(sys.stdin); print(list(d.keys()))"
```

Expected output: `['private_key', 'app_id', 'installation_id']` (at minimum `private_key`).

Failure modes:

- Secret does not exist → create it (see "Rotating the secret" below).
- `private_key` field is missing or empty → update the secret.
- Secret is not valid JSON → overwrite it with the correct structure.

### Step 3 — Verify the GitHub App installation is active

```bash
# Mint a JWT manually to test the App identity
pip install PyJWT cryptography
python3 - <<'EOF'
import jwt, time, os
private_key = open('private_key.pem').read()
app_id = "3158619"  # or GITHUB_APP_ID from the Lambda env
payload = {"iat": int(time.time()) - 60, "exp": int(time.time()) + 600, "iss": app_id}
print(jwt.encode(payload, private_key, algorithm="RS256"))
EOF
```

Then verify the installation:

```bash
curl -H "Authorization: Bearer <JWT>" \
     -H "Accept: application/vnd.github+json" \
     https://api.github.com/app/installations/118260223
```

A 200 response with `"account": {"login": "bkrupa"}` confirms the installation is active. A 401 means the JWT is invalid (wrong key or app_id). A 404 means the installation ID is wrong.

### Step 4 — Check CloudWatch logs for the exchange error

```
/aws/lambda/legacy-sports-github-mcp
```

Search for `GitHub App token exchange failed` or `AGENT_AUTHOR_APP_PRIVATE_KEY` to see the exact error the Lambda reported.

## Rotating the secret

```bash
# Generate a new private key (if replacing an expired one)
openssl genrsa -out new_key.pem 2048

# Upload to Secrets Manager
aws secretsmanager put-secret-value \
  --secret-id legacy-sports/github-mcp-credentials \
  --secret-string "$(python3 -c "
import json, sys
key = open('new_key.pem').read()
print(json.dumps({'private_key': key, 'app_id': '3158619', 'installation_id': '118260223'}))
")"
```

After rotating the key, upload the public key to the GitHub App settings at
`https://github.com/settings/apps/agent-author` and delete the old key.

> The Lambda caches credentials in memory across warm invocations
> (`credentialsInitialized = true` in `lambda.ts`). A key rotation requires a
> Lambda function update or a wait for the container to be recycled. Force a
> refresh by deploying a no-op config change:
>
> ```bash
> aws lambda update-function-configuration \
>   --function-name legacy-sports-github-mcp \
>   --description "force credential reload $(date -u +%Y%m%dT%H%M%SZ)"
> ```

## Reinstalling the GitHub App

If the installation was revoked or the repository was removed from the App's scope:

1. Go to `https://github.com/settings/installations/<installation_id>` (or the org's Apps settings).
2. Verify the App is installed and has access to `bkrupa/legacy-sports`.
3. If not, reinstall: `https://github.com/apps/agent-author` → Install → select the repository.
4. Note the new `installation_id` from the URL and update the Secrets Manager secret.

## Key infrastructure references

| Resource                | Location                                                  |
| ----------------------- | --------------------------------------------------------- |
| Lambda function config  | `terraform/main/lambda-mcp-github.tf`                     |
| Credential loading      | `tools/mcp/github-server/src/lambda.ts`                   |
| Token resolution        | `tools/mcp/github-server/src/auth.ts` (`tryResolveToken`) |
| Default App ID          | `3158619` (`auth.ts` `DEFAULT_APP_ID`)                    |
| Default installation ID | `118260223` (`auth.ts` `DEFAULT_INSTALLATION_ID`)         |
