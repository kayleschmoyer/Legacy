# LS-9948: S3 bucket holding the football game-stat corpus, one object per
# (pfrId, season), used as the primary source for game-level football stats.
#
# Why this exists: football has the same rate-limit problem baseball had
# (LS-9809/LS-9817), but the fix does not transfer. Pro Football Reference is
# behind a Cloudflare managed challenge -- it returns HTTP 403 to every scripted
# request at any rate, including robots.txt, and lib/pfr-client only works with a
# hand-harvested `PFR_CF_CLEARANCE` cookie that expires. Sports Reference's terms
# also prohibit building a derived data store from their content. So unlike
# Retrosheet, the corpus here is assembled from two differently-licensed sources
# split at the 1999 boundary (LS-9908):
#
#   1999-2025  nflverse (github.com/nflverse/nflverse-data), CC-BY-4.0.
#              Derived from NFL play-by-play, which does not exist before 1999 --
#              that boundary is the league's own digitisation limit, not a gap
#              someone will fill. ~97.7% of our 1999+ player-seasons.
#
#   1960-1998  Pro Football Archives (profootballarchives.com), licensed
#              separately. ~92.2% of our pre-1999 skill-position player-seasons.
#
# Both are keyed by the app's own `players.pfr_id` so the id crosswalk happens at
# ingest time and the read path needs no lookup -- the same trick LS-9817 used to
# move the Chadwick crosswalk out of the hot path. One prefix per source keeps
# their provenance (and their licences) separable:
#
#   nflverse/v1/<pfrId>/<season>.json.gz
#   pfa/v1/<pfrId>/<season>.json.gz
#
# Known permanent gaps, for whoever debugs a zero score later: PFA does not track
# fumbles in any era (confirmed against their published coverage table), and
# individual tackles were never an official NFL statistic, so pre-1999 rows carry
# no fumbles and no IDP tackle data. See LS-9948.
#
# Attribution: nflverse is CC-BY-4.0 and REQUIRES visible attribution wherever
# this data (or a product built on it) is distributed. The Pro Football Archives
# licence carries its own attribution terms -- honour whichever the agreement
# specifies.

resource "aws_s3_bucket" "football_corpus" {
  bucket = "${local.name_prefix}-football-corpus"

  tags = local.common_tags
}

resource "aws_s3_bucket_server_side_encryption_configuration" "football_corpus" {
  bucket = aws_s3_bucket.football_corpus.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "football_corpus" {
  bucket = aws_s3_bucket.football_corpus.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Deliberately NO lifecycle expiration of any kind: this is a durable reference
# corpus of immutable historical box scores. Versioning guards against a bad
# re-ingest overwriting good data.
resource "aws_s3_bucket_versioning" "football_corpus" {
  bucket = aws_s3_bucket.football_corpus.id

  versioning_configuration {
    status = "Enabled"
  }
}

# This is where football DIVERGES from terraform/main/retrosheet-corpus.tf, which
# expires noncurrent versions after 30 days to avoid "paying to store every
# historical revision forever". That trade does not transfer:
#
#   1. Retrosheet is re-downloadable on demand from retrosheet.org, so a lost
#      rollback target there costs a re-run. The PFA half here is NOT: it was
#      assembled from ~8,000 crawled box-score pages over a multi-hour polite
#      crawl against a small independent site, under a negotiated licence. If a
#      bad re-ingest is noticed on day 31, the last good copy is unrecoverable
#      except by re-crawling -- which depends on that site still being reachable
#      and the licence still holding.
#   2. The cost argument is ~nil at this size. The whole corpus is roughly 5 MiB
#      gzipped (~15.5k objects), so retaining every revision indefinitely is
#      pennies. Retrosheet's ~135 MiB made the trade at least arguable; here it
#      buys nothing and risks the one thing that is expensive to reproduce.
#
# So only the multipart cleanup is kept -- that reclaims aborted uploads, which
# are never a recovery target. If a future ingest starts churning objects enough
# to make version retention material, revisit with a measured number rather than
# copying Retrosheet's 30 days back in.
resource "aws_s3_bucket_lifecycle_configuration" "football_corpus" {
  bucket = aws_s3_bucket.football_corpus.id

  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# Read-only access for the stats Lambda. The ingest path (CLI) runs with operator
# credentials and is intentionally not granted write access here -- the Lambda
# must never be able to mutate the corpus it reads.
resource "aws_iam_policy" "stats_lambda_football_corpus_read" {
  name        = "${local.name_prefix}-stats-lambda-football-corpus-read"
  description = "Allow the stats Lambda to read the football game-stat corpus from S3"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.football_corpus.arn}/*"
      },
      {
        # Needed so a missing object returns a clean 404 (NoSuchKey) instead of
        # an AccessDenied, which is what lets the provider distinguish "not in
        # the corpus" from a real failure.
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.football_corpus.arn
      },
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "stats_lambda_football_corpus_read" {
  role       = aws_iam_role.stats_lambda.name
  policy_arn = aws_iam_policy.stats_lambda_football_corpus_read.arn
}

output "football_corpus_bucket" {
  description = "S3 bucket holding the football game-stat corpus (nflverse 1999+, PFA 1960-1998)"
  value       = aws_s3_bucket.football_corpus.bucket
}
