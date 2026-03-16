# MCP AWS Server

Exposes AWS CloudWatch logs and SSO authentication health as structured MCP tools for AI agents.

## Tools

- **aws_logs_tail** — Fetch recent CloudWatch logs for a Legacy Sports Lambda function. Supports time range (`since`), filter patterns, and dev/prod environments. Automatically sets `AWS_PAGER=""` and `PYTHONIOENCODING=utf-8` to avoid common encoding and pagination issues.
- **aws_sso_status** — Check AWS SSO authentication health by running `aws sts get-caller-identity`. Returns caller identity on success or a clear error with remedy instructions on failure.

## How It Works

The server wraps the AWS CLI (`aws logs tail`, `aws sts get-caller-identity`) using Node's `execFile` with environment overrides that prevent the two most common AWS agent pitfalls:

1. **Pager blocking** — `AWS_PAGER=""` disables the interactive `---more---` prompt
2. **Unicode encoding errors** — `PYTHONIOENCODING=utf-8` prevents emoji/Unicode crashes in PowerShell

SSO errors are detected by pattern-matching error messages and return a structured remedy (`aws sso login`) rather than a raw stack trace.

## Usage

```
# Check auth before any AWS work
aws_sso_status()

# Tail logs for the GraphQL Lambda (last hour)
aws_logs_tail(function="graphql", since="1h")

# Search stats Lambda for errors in the last 30 minutes (production)
aws_logs_tail(function="stats", since="30m", filter="ERROR", environment="prod")
```

## Available Functions

`graphql`, `db`, `oauth-proxy`, `notifications`, `stats`, `stats-lambda`, `game-selection`, `draft-processor`, `websocket`, `apple-iap`, `stripe-webhook`
