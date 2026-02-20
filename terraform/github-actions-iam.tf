# GitHub Actions SSM policy — CONSOLIDATED
# SSM read/write permissions have been merged into the inline policy
# in github-actions-oidc.tf (github_actions_additional) to eliminate
# the triple-overlap between this policy, the inline policy, and the
# data source lookup.
#
# The aws_iam_policy.github_actions_ssm and aws_iam_role_policy_attachment.github_actions_ssm
# resources were removed. The data.aws_iam_role.github_actions lookup was also removed
# in favor of the direct aws_iam_role.github_actions resource reference.
