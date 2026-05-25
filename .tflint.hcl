# tflint configuration for the integration-safety terraform plan gate.
# Static IaC linting that runs on PRs touching terraform/main (see the paths
# filter in .github/workflows/terraform-plan.yml), with no AWS access required.
# The deep, AWS-aware checks (refresh, IAM AccessDenied, resource replacement)
# happen in the speculative `terraform plan` job that assumes the read-only
# github-actions-plan role.

config {
  call_module_type = "local"
  force            = false
}

plugin "terraform" {
  enabled = true
  preset  = "recommended"
}
