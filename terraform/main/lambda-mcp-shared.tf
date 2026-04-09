locals {
  mcp_server_function_names = [
    "${local.name_prefix}-mcp-jira",
    "${local.name_prefix}-mcp-github",
    "${local.name_prefix}-mcp-ci",
  ]
}

# IAM policy granting lambda:InvokeFunctionUrl on all three MCP servers.
# Attach this to developer SSO permission sets so they can call the hosted
# MCP endpoints using their existing IAM credentials (SigV4-signed requests).
# GitHub Actions already has this policy attached via the OIDC role below.
resource "aws_iam_policy" "mcp_invoke" {
  name        = "${local.name_prefix}-mcp-invoke"
  description = "Allows invoking the hosted MCP server Lambda Function URLs (jira, github, ci) using AWS_IAM auth"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "InvokeMcpFunctionUrls"
        Effect = "Allow"
        Action = "lambda:InvokeFunctionUrl"
        Resource = [
          for name in local.mcp_server_function_names :
          "arn:aws:lambda:${local.region}:${local.account_id}:function:${name}"
        ]
        Condition = {
          StringEquals = {
            "lambda:FunctionUrlAuthType" = "AWS_IAM"
          }
        }
      }
    ]
  })

  tags = local.common_tags
}

# Give the GitHub Actions OIDC role access to the MCP servers so cloud agents
# can call them without any additional GitHub secrets.
resource "aws_iam_role_policy_attachment" "github_actions_mcp_invoke" {
  policy_arn = aws_iam_policy.mcp_invoke.arn
  role       = aws_iam_role.github_actions.name
}

output "mcp_invoke_policy_arn" {
  description = "ARN of the mcp_invoke IAM policy — attach to developer SSO permission sets to grant MCP server access"
  value       = aws_iam_policy.mcp_invoke.arn
}
