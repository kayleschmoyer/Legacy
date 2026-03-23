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

## RECOMMENDED: Use the Wrapper Script (Easiest for AI Agents)

**ALWAYS USE THIS SCRIPT FIRST** - It handles all encoding and pagination issues automatically:

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

**Why use this script?**

- Automatically sets `AWS_PAGER=""` (no pagination issues)
- Automatically sets `PYTHONIOENCODING=utf-8` (no emoji/Unicode errors)
- Simpler syntax (no need to remember full log group paths)
- Built-in validation and helpful error messages
- Works reliably for AI agents without manual environment setup

## Lambda Function Log Groups

| Environment | Pattern                            | Example                                  |
| ----------- | ---------------------------------- | ---------------------------------------- |
| Dev         | `/aws/lambda/legacy-sports-dev-*`  | `/aws/lambda/legacy-sports-dev-graphql`  |
| Prod        | `/aws/lambda/legacy-sports-prod-*` | `/aws/lambda/legacy-sports-prod-graphql` |

**Functions**: `graphql`, `db`, `oauth-proxy`, `websocket`, `stats-lambda`, `game-selection`, `draft-processor`

## Related Skills

- [AWS SSO Login](aws-sso-login.md) - AWS authentication setup
- [Deploy Lambda](deploy-lambda.md) - Deploying Lambda functions
