# =============================================================================
# IAM policy: let a runner EC2 instance heartbeat-tag ITSELF (LS-7874)
# =============================================================================
# A long-running self-hosted job (e.g. the live-draft-ui integration shard) has
# multi-minute quiet phases during which the GitHub API `busy` flag
# intermittently reads false, so the scale-down Lambda can terminate such a
# runner mid-job on a single stray reading.
#
# The robust fix is a job-driven heartbeat: while ANY job runs, the runner-level
# job hooks (ACTIONS_RUNNER_HOOK_JOB_STARTED/COMPLETED, wired in
# github-runners.tf) tag the instance with `ghr:job_heartbeat=<unix-seconds>`
# every minute and delete the tag when the job ends. The patched scale-down
# Lambda treats any runner with a heartbeat fresher than
# SCALE_DOWN_HEARTBEAT_TTL_SECONDS as active and skips removal, regardless of
# the flaky GitHub flag. The TTL is self-healing: when the job ends (the tag is
# deleted) or the runner dies (the tag goes stale) the override lapses and
# normal scale-down resumes, so a genuinely idle runner still scales to zero.
#
# For the runner to write that tag it needs ec2:CreateTags/DeleteTags on
# itself. The module's runner instance role only carries the cache policy, so
# we attach this narrow grant alongside it. The permissions boundary already
# permits ec2:CreateTags/DeleteTags (EC2Fleet sid in github-runners.tf), so no
# boundary change is required.
#
# Least privilege — two independent guards:
#   1. aws:TagKeys is constrained to exactly `ghr:job_heartbeat`, so a
#      compromised runner cannot manage any other tag. Critically, it cannot
#      set `ghr:bypass-removal` (which would keep it alive forever) or rewrite
#      `ghr:environment` (the scale-down terminate scope).
#   2. ec2:ResourceTag/ghr:environment pins the action to runner-fleet
#      instances, so the role cannot tag unrelated EC2 instances in the account.
# =============================================================================

resource "aws_iam_policy" "runner_self_tag" {
  name        = "${local.name_prefix}-runner-self-tag"
  description = "Grants runner EC2 instances permission to manage ONLY the ghr:job_heartbeat tag on runner-fleet instances (LS-7874 scale-down heartbeat)."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ManageJobHeartbeatTag"
        Effect   = "Allow"
        Action   = ["ec2:CreateTags", "ec2:DeleteTags"]
        Resource = "arn:aws:ec2:${local.region}:${local.account_id}:instance/*"
        Condition = {
          # Only the heartbeat tag key may be created or deleted.
          "ForAllValues:StringEquals" = {
            "aws:TagKeys" = ["ghr:job_heartbeat"]
          }
          # Only instances that are part of this runner fleet may be tagged.
          StringEquals = {
            "ec2:ResourceTag/ghr:environment" = "${local.name_prefix}-runner"
          }
        }
      },
    ]
  })

  tags = local.common_tags
}
