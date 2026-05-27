# =============================================================================
# Runner AMI Builder IAM Role (LS-2429)
# =============================================================================
#
# OIDC role assumed by the `rebuild-runner-ami` GitHub Actions workflow to run
# Packer inside CI. Packer launches a temporary EC2 build instance, installs
# software, creates a new AMI, and terminates the instance — all of which
# requires broad EC2 permissions that are deliberately NOT granted to the
# regular github_actions apply role.
#
# Trust policy:
#   - Pull requests can assume this role so `rebuild-runner-ami.yml` can build
#     a new AMI during the PR cycle (before merge), commit the version bump
#     back to the PR branch, and let CI validate the change against the new AMI.
#   - Refs on main are also permitted for `workflow_dispatch` manual rebuilds.
#   - Scoped to this specific repo via the `sub` claim.
#
# Permissions:
#   - Packer minimum permission set per
#     https://developer.hashicorp.com/packer/plugins/builders/amazon#iam-task-or-instance-role
#   - Scoped via tags and name patterns where AWS supports resource-level scoping.
#   - EC2 instance termination scoped to the Packer build VPC/subnet via tag
#     conditions to prevent this role from touching runner or Lambda instances.
#
# Security considerations:
#   - Packer build instances are short-lived (≤10 min) and operate on a public
#     subnet with default SGs; the boundary below limits blast radius.
#   - The role cannot modify the runner launch template, IAM roles, or any
#     non-AMI resource — it only produces images. Applying the new AMI to the
#     runner fleet happens via the separate `runner-terraform-apply` workflow,
#     which uses the github_actions apply role.
# =============================================================================

resource "aws_iam_role" "runner_ami_builder" {
  name        = "${local.name_prefix}-runner-ami-builder"
  description = "OIDC role assumed by the rebuild-runner-ami GitHub Actions workflow to build runner AMIs via Packer (LS-2429)."

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = data.aws_iam_openid_connect_provider.github_actions.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            # pull_request: rebuild-runner-ami.yml can build an AMI during a
            #   Playwright bump PR and commit the version back to the PR branch.
            # ref:refs/heads/main: workflow_dispatch manual rebuild on main.
            "token.actions.githubusercontent.com:sub" = [
              "repo:bkrupa/legacy-sports:pull_request",
              "repo:bkrupa/legacy-sports:ref:refs/heads/main"
            ]
          }
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "runner_ami_builder" {
  name = "${local.name_prefix}-runner-ami-builder"
  role = aws_iam_role.runner_ami_builder.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # Packer minimum permissions for the amazon-ebs builder. Most of these
      # cannot be resource-scoped because Packer creates/discovers resources
      # dynamically (temporary keypair, SG, volume, instance, snapshot, image).
      # Scoping is applied below via tag conditions and name patterns where
      # supported.
      {
        Sid    = "PackerBuilderEc2"
        Effect = "Allow"
        Action = [
          "ec2:AttachVolume",
          "ec2:AuthorizeSecurityGroupIngress",
          "ec2:CopyImage",
          "ec2:CreateImage",
          "ec2:CreateKeyPair",
          "ec2:CreateSecurityGroup",
          "ec2:CreateSnapshot",
          "ec2:CreateTags",
          "ec2:CreateVolume",
          "ec2:DeleteKeyPair",
          "ec2:DeleteSecurityGroup",
          "ec2:DeleteSnapshot",
          "ec2:DeleteVolume",
          "ec2:DeregisterImage",
          "ec2:DescribeImageAttribute",
          "ec2:DescribeImages",
          "ec2:DescribeInstances",
          "ec2:DescribeInstanceStatus",
          "ec2:DescribeRegions",
          "ec2:DescribeRouteTables",
          "ec2:DescribeSecurityGroups",
          "ec2:DescribeSnapshots",
          "ec2:DescribeSubnets",
          "ec2:DescribeTags",
          "ec2:DescribeVolumes",
          "ec2:DescribeVpcs",
          "ec2:DetachVolume",
          "ec2:GetPasswordData",
          "ec2:ModifyImageAttribute",
          "ec2:ModifyInstanceAttribute",
          "ec2:ModifySnapshotAttribute",
          "ec2:RegisterImage",
          "ec2:RunInstances",
          "ec2:StopInstances"
        ]
        Resource = "*"
      },
      # Instance termination is scoped strictly to Packer-tagged build instances.
      # The amazon-ebs builder does NOT apply a default Name tag — we set
      # `Name = "Packer Builder - legacy-sports-runner"` explicitly via the
      # `run_tags` block in terraform/runners/packer/runner-ami.pkr.hcl so this
      # condition matches. Before LS-4921, run_tags was unset and the condition
      # never matched, so failed builds leaked the build instance (and its temp
      # security group, since SG delete cascades on instance termination).
      # The condition uses ONLY the "Packer Builder*" prefix — the runner fleet's
      # instances are tagged `legacy-sports-dev-runner-...` and must NOT be
      # terminable by this role, so the previous wildcard that included
      # `legacy-sports-runner*` was removed per Copilot review on PR #2281.
      {
        Sid    = "PackerBuilderTerminateTagged"
        Effect = "Allow"
        Action = [
          "ec2:TerminateInstances"
        ]
        Resource = "arn:aws:ec2:${local.region}:${local.account_id}:instance/*"
        Condition = {
          StringLike = {
            "ec2:ResourceTag/Name" = ["Packer Builder*"]
          }
        }
      },
      # Terraform state locking (so the rebuild workflow can read current AMI
      # inventory via `terraform plan` if needed). Read-only S3 for state.
      {
        Sid    = "TerraformStateRead"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::legacy-sports-terraform-state",
          "arn:aws:s3:::legacy-sports-terraform-state/*"
        ]
      }
    ]
  })
}

# Note: the runner_ami_builder_role_arn output moved to terraform/runners/outputs.tf
# in LS-2425 to follow the convention of grouping outputs in outputs.tf.
