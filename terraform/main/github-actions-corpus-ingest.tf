# LS-10562: OIDC role for the corpus-ingest GitHub workflow
# (.github/workflows/corpus-ingest.yml), which runs `ingest-nflverse-football`
# and `ingest-retrosheet` from Actions so the corpus refreshes no longer block
# on a maintainer with local AWS SSO credentials.
#
# Modelled on the other OIDC roles in github-actions-oidc.tf. Two deliberate
# narrowings:
#
#   1. Trust is the `corpus-ingest` GitHub environment ONLY -- not a branch ref,
#      not pull_request. That environment is created in the repo settings with
#      the owner as required reviewer, so every run that can assume this role
#      has been approved by a human.
#   2. Object read/write on the two corpus buckets and nothing else. No
#      s3:DeleteObject: the ingest only ever writes (or overwrites, with
#      --force), and bucket versioning keeps the previous revision of anything
#      it overwrites.
resource "aws_iam_role" "corpus_ingest" {
  name        = "${local.name_prefix}-corpus-ingest"
  description = "OIDC role for the corpus-ingest workflow - corpus S3 buckets only, corpus-ingest environment only"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github_actions.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:sub" = "repo:bkrupa/legacy-sports:environment:corpus-ingest"
          }
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_policy" "corpus_ingest" {
  # name_prefix, not name: `description` (like `name`) is ForceNew on
  # aws_iam_policy, and a fixed-name create-before-destroy replacement aborts
  # the apply on 409 EntityAlreadyExists (LS-9876, LS-10209).
  name_prefix = "${local.name_prefix}-corpus-ingest-"
  description = "Read/write (no delete) on the football and Retrosheet corpus buckets for the corpus-ingest workflow"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CorpusObjectReadWrite"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject"]
        Resource = [
          "${aws_s3_bucket.football_corpus.arn}/*",
          "${aws_s3_bucket.retrosheet_corpus.arn}/*",
        ]
      },
      {
        # The ingest HEADs each key to skip objects already present (without
        # --force); ListBucket makes a missing key a clean 404 instead of a 403.
        Sid    = "CorpusBucketList"
        Effect = "Allow"
        Action = ["s3:ListBucket"]
        Resource = [
          aws_s3_bucket.football_corpus.arn,
          aws_s3_bucket.retrosheet_corpus.arn,
        ]
      },
    ]
  })

  tags = local.common_tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_iam_role_policy_attachment" "corpus_ingest" {
  role       = aws_iam_role.corpus_ingest.name
  policy_arn = aws_iam_policy.corpus_ingest.arn

  # Paired with create_before_destroy on the policy: the new attachment lands
  # before the old one is removed, so the role is never left without access.
  lifecycle {
    create_before_destroy = true
  }
}

output "corpus_ingest_role_arn" {
  description = "ARN of the OIDC role assumed by .github/workflows/corpus-ingest.yml"
  value       = aws_iam_role.corpus_ingest.arn
}
