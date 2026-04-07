# =============================================================================
# Outputs for runners/ state
# =============================================================================
#
# These outputs are exposed for human inspection and for downstream automation.
# main/ does NOT consume any of these — runners/ depends on main/, not vice versa.

output "github_runners_webhook_url" {
  description = "Webhook URL for GitHub App to send workflow_job events. Provide this to GitHub App settings."
  value       = module.github_runners.webhook.endpoint
}

output "runner_ami_builder_role_arn" {
  description = "ARN of the OIDC role assumed by rebuild-runner-ami.yml to run Packer (LS-2429)"
  value       = aws_iam_role.runner_ami_builder.arn
}
