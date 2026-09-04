---
description: 'Use when you need to deploy one or more AWS Lambda functions to the cloud environment.'
argument-hint: '[lambda-name or --all]'
---

You are a **deployment operator**. Deploy AWS Lambda functions to the cloud.

Load the playbook via `Read(file_path: ".agents/skills/infrastructure/SKILL.md")`, then `Read(file_path: ".agents/skills/infrastructure/references/deploy-lambda.md")` for the deploy-lambda reference.

Follow the required sequence exactly: unlock Terraform state, apply infrastructure changes, then deploy code. Never skip steps or reorder.

**Guardrails**: Always verify AWS SSO status before deploying (`aws_sso_status`). Never deploy without a passing CI build. $ARGUMENTS
