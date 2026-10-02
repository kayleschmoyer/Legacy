# Fixture for scripts/__tests__/check-iam-policy-size.test.mjs (LS-10408).
# Mirrors the shape of terraform/main/github-actions-oidc.tf: the three policies
# the checker measures, each using a jsonencode body that the pre-LS-10408
# parser rejected — bare Terraform references as values, and single-line maps.

resource "aws_iam_role_policy" "github_actions_additional" {
  name = "fixture-additional"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "BareReferenceList"
        Effect   = "Allow"
        Action   = ["ec2:CreateTags"]
        Resource = [aws_vpc.main.arn, aws_subnet.private[0].arn]
      }
    ]
  })
}

resource "aws_iam_policy" "github_actions_supplemental" {
  name = "fixture-supplemental"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SingleLineMap"
        Effect   = "Allow"
        Action   = ["ec2:CreateNetworkInterface"]
        Resource = "*"
        Condition = {
          StringEquals = { "ec2:Vpc" = aws_vpc.main.arn }
        }
      }
    ]
  })
}

resource "aws_iam_policy" "github_actions_supplemental_2" {
  name = "fixture-supplemental-2"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "BareLocalsAndVars"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = local.bucket_arn
        Condition = {
          StringEquals = { "aws:RequestedRegion" = local.region, "aws:ResourceTag/env" = var.environment }
        }
      }
    ]
  })
}
