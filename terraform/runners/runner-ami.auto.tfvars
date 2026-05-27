# LS-2429: Committed runner AMI version selector.
#
# This file is the source of truth for which Playwright version the GitHub
# Actions self-hosted runners MUST run. Terraform's module "github_runners"
# filters AMIs whose name starts with "legacy-sports-runner-pw<version>-"
# (see github-runners.tf) and selects the most recent match.
#
# Lifecycle for a Playwright bump:
#
#   1. Dependabot (or a human) opens a PR updating @playwright/test + playwright
#      in package.json and regenerating pnpm-lock.yaml.
#   2. CI's runner-ami-drift-check workflow fails because this value, the Packer
#      playwright_version default, and pnpm-lock.yaml's resolved playwright-core
#      version no longer all agree.
#   3. The rebuild-runner-ami workflow (manual trigger OR dependabot label)
#      builds a new AMI named "legacy-sports-runner-pw<newversion>-<timestamp>"
#      and commits updated values for both this tfvars file and the Packer HCL
#      default back to the PR branch.
#   4. CI drift check passes, PR merges, and the runner-terraform-apply workflow
#      updates the launch template to select the new AMI by name filter. Existing
#      runners drain naturally as they finish jobs; new scale-ups use the new AMI.
#
# Rollback: revert the PR. Terraform re-selects the previous AMI (still present
# in the account until prune-runner-amis removes it).
#
# LS-4905 roll-out note: when the Playwright version is unchanged, the AMI name
# filter (legacy-sports-runner-pw<version>-*) still selects the *most recent*
# match, so a freshly-baked AMI built off the current packer config (e.g. after
# LS-4902 added JDK 17 + Android build-tools to PATH) is picked up by
# runner-terraform-apply.yml on the next merge that touches terraform/runners/**.
#
# LS-4909: touch to force runner-terraform-apply.yml to re-roll the launch
# template after rebuild-runner-ami.yml builds the new JDK-17 AMI.
runner_ami_playwright_version = "1.59.1"
