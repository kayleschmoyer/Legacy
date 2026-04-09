# Hosted MCP Server Access

The Jira, GitHub, and CI MCP servers are hosted as AWS Lambda Function URLs
with `authorization_type = "AWS_IAM"`. Every HTTP request must be signed with
[AWS SigV4](https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html)
using credentials that have the `mcp_invoke` IAM policy attached.

This means:

- No shared tokens to rotate or distribute
- Each invocation is logged in CloudTrail with your IAM principal ARN
- GitHub Actions cloud agents get access automatically via the existing OIDC role

---

## Prerequisites

- AWS IAM Identity Center (SSO) access to the `legacy-sports-dev` account
- AWS CLI v2 with SSO configured (`aws configure sso`)

---

## 1. Attach the `mcp_invoke` Policy to Your SSO Role

Ask an admin to attach the `legacy-sports-dev-mcp-invoke` IAM policy to your
SSO permission set. Once attached, any session you start with that permission
set will have access to invoke the MCP servers.

To verify your access:

```bash
# Get the policy ARN from Terraform outputs
terraform -chdir=terraform/main output mcp_invoke_policy_arn

# Confirm your current AWS identity (SSO sessions show an assumed-role ARN)
aws sts get-caller-identity
```

---

## 2. Get the MCP Server URLs

After LS-2852/2853/2854 are deployed, retrieve the Lambda Function URLs:

```bash
terraform -chdir=terraform/main output mcp_jira_url
terraform -chdir=terraform/main output mcp_github_url
terraform -chdir=terraform/main output mcp_ci_url
```

Add these to your `.env.local`:

```
MCP_JIRA_URL=https://<id>.lambda-url.us-east-1.on.aws
MCP_GITHUB_URL=https://<id>.lambda-url.us-east-1.on.aws
MCP_CI_URL=https://<id>.lambda-url.us-east-1.on.aws

# Optional: AWS profile to use for signing (defaults to credential chain)
MCP_AWS_PROFILE=legacy-sports-dev
```

---

## 3. Run the Local Signing Proxy

MCP clients (Claude Desktop, VS Code MCP extension, etc.) speak plain HTTP —
they cannot sign requests with SigV4. The signing proxy bridges this gap: it
listens locally on plain HTTP, signs each request, and forwards it to the
Lambda URL.

```bash
# Start the signing proxy (reads MCP_*_URL from .env.local)
pnpm exec nx run mcp-signing-proxy:start
```

Ports:

| Server | Local port |
| ------ | ---------- |
| Jira   | 4195       |
| GitHub | 4196       |
| CI     | 4197       |

---

## 4. Configure Your MCP Client

Point your MCP client at the local proxy ports instead of the Lambda URLs
directly. Example Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`
on macOS or `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "legacy-sports-jira": {
      "url": "http://localhost:4195"
    },
    "legacy-sports-github": {
      "url": "http://localhost:4196"
    },
    "legacy-sports-ci": {
      "url": "http://localhost:4197"
    }
  }
}
```

---

## Cloud Agents (GitHub Actions)

Cloud agents running in GitHub Actions do not need the signing proxy. The
`github_actions` OIDC role already has the `mcp_invoke` policy attached
(via `aws_iam_role_policy_attachment.github_actions_mcp_invoke` in
`terraform/main/lambda-mcp-shared.tf`).

The agent just needs the Lambda Function URLs injected as environment
variables. These are added to the workflow environment after LS-2852/2853/2854
are merged.

---

## Troubleshooting

**`403 Forbidden` from the Lambda URL**

- Your credentials do not have the `mcp_invoke` policy. Confirm the policy is
  attached to your SSO permission set, then refresh your SSO session:
  `aws sso login --profile <profile>`.

**`SignatureDoesNotMatch`**

- Clock skew: AWS rejects signatures more than 5 minutes from the server time.
  Sync your system clock.
- Wrong region: `AWS_REGION` in `.env.local` must match the Lambda's region
  (`us-east-1`).

**Signing proxy starts but MCP client times out**

- Confirm the proxy is running: `curl http://localhost:4195/`
- Check that `MCP_JIRA_URL` (etc.) are set in `.env.local` and the proxy
  printed "listening" for that server.

**`MCP_JIRA_URL not set — skipping port 4195`**

- Copy `.env.example` → `.env.local` and fill in the URL values from
  `terraform output`.
