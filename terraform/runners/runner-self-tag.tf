# =============================================================================
# IAM policy: let a runner EC2 instance heartbeat-tag ITSELF (LS-7874)
# =============================================================================
# A long-running integration shard (live-draft-ui) has multi-minute quiet
# phases during which the GitHub API `busy` flag intermittently reads false.
# The LS-7870 idle-strike debounce reduced — but did not eliminate — the
# scale-down Lambda terminating such a runner mid-job once enough consecutive
# idle readings accrue.
#
# The robust fix is a job-driven heartbeat: while the integration job runs, it
# tags its own instance with `ghr:job_heartbeat=<unix-seconds>` every minute
# (see .github/workflows/run-playwright-tests.yml). The patched scale-down
# Lambda treats any runner with a heartbeat fresher than
# SCALE_DOWN_HEARTBEAT_TTL_SECONDS as active and skips removal, regardless of
# the flaky GitHub flag. The TTL is self-healing: when the job ends (the tag is
# deleted) or the runner dies (the tag goes stale) the override lapses and
# normal scale-down resumes.
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
