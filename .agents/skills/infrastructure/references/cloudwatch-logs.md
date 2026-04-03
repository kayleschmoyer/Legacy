---
name: cloudwatch-logs
description: 'Query and stream AWS CloudWatch logs for Lambda functions to debug production issues. Use when troubleshooting Lambda failures, tailing live logs, or investigating production errors.'
---

# Skill: Reading CloudWatch Logs

## Overview

Query and stream AWS CloudWatch logs for Lambda functions and other AWS services to debug production issues and monitor application behavior.

> **Local only** — This skill requires AWS credentials and is unavailable in cloud agent environments (Claude Code on the web, Copilot Coding Agent). If you need to debug production logs, inform the user that CloudWatch log access requires a local development session with active AWS SSO credentials.

## When to Use

- Debugging production errors in Lambda functions
- Investigating API failures or timeouts
- Monitoring application behavior in AWS
- Tracing requests through the system
- Analyzing error patterns or frequency
- Checking deployment success

## MCP Tool (Preferred)

Use `aws_logs_tail` for Lambda log groups — it handles pagination automatically:

```
aws_logs_tail(logGroup: "/aws/lambda/legacy-sports-dev-graphql", since: "1h")
aws_logs_tail(logGroup: "/aws/lambda/legacy-sports-dev-graphql", since: "30m", filter: "ERROR")
```

> **Known issue (LS-2340):** `aws_logs_tail` crashes with a `charmap` encoding error on Windows when log output contains emoji. Fall back to the wrapper script below if you hit this.

## Shell Fallback: Wrapper Script

The PowerShell wrapper handles encoding and pagination automatically:

```powershell
# Basic usage - view last hour of logs
.\scripts\aws-logs.ps1 -Function graphql -Since 1h

# View recent logs for specific Lambda
.\scripts\aws-logs.ps1 -Function game-selection -Since 30m

# Search for errors
.\scripts\aws-logs.ps1 -Function db -Since 2h -Filter "ERROR"

# Follow logs in real-time
.\scripts\aws-logs.ps1 -Function stats -Follow

# Production environment
.\scripts\aws-logs.ps1 -Function graphql -Since 1h -Environment prod
```

**Available Functions**: `graphql`, `db`, `oauth-proxy`, `notifications`, `stats`, `game-selection`, `draft-processor`

## Log Group Reference

### Application Lambdas

| Environment | Pattern                            | Example                                  |
| ----------- | ---------------------------------- | ---------------------------------------- |
| Dev         | `/aws/lambda/legacy-sports-dev-*`  | `/aws/lambda/legacy-sports-dev-graphql`  |
| Prod        | `/aws/lambda/legacy-sports-prod-*` | `/aws/lambda/legacy-sports-prod-graphql` |

**Functions**: `graphql`, `db`, `oauth-proxy`, `websocket`, `stats-lambda`, `game-selection`, `draft-processor`

### Runner Infrastructure Lambdas

| Log group                                                 | Purpose                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------- |
| `/aws/lambda/legacy-sports-dev-runner-scale-up`           | Scale-up Lambda — processes `workflow_job` webhook events, launches EC2   |
| `/aws/lambda/legacy-sports-dev-runner-scale-down`         | Scale-down Lambda — terminates idle runner instances                      |
| `/aws/lambda/legacy-sports-dev-runner-webhook`            | Webhook receiver — receives GitHub `workflow_job` events from API Gateway |
| `/aws/lambda/legacy-sports-dev-runner-syncer`             | Binary syncer — downloads runner binary from GitHub, uploads to S3        |
| `/aws/lambda/legacy-sports-dev-runner-dispatch-to-runner` | Dispatch Lambda — routes queued jobs to available runners                 |
| `/github-runners/legacy-sports-dev-runner/cloud-init`     | EC2 instance boot logs — use to diagnose runner registration failures     |

> Use `MSYS_NO_PATHCONV=1` prefix when passing log group paths to `aws` CLI on Windows (Git Bash converts leading `/` to a Windows path).

## Related Skills

- [AWS SSO Login](aws-sso-login.md) - AWS authentication setup
- [Deploy Lambda](deploy-lambda.md) - Deploying Lambda functions
- [AMI Build](ami-build.md) - If runner boot logs show tool-missing errors, rebuild the AMI
