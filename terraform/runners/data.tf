# =============================================================================
# Cross-state data sources — read live AWS state for resources defined in main/
# =============================================================================
#
# After LS-2425 (state separation), runners/ depends on resources defined in
# terraform/main/ for VPC, subnets, security groups, and the SNS ops alerts
# topic. Rather than reading terraform/main/'s remote state (which creates a
# plan-time ordering requirement — main must be applied before runners can
# plan), we query AWS directly for each resource by tag.
#
# Benefits of this approach over terraform_remote_state:
#   1. runners/ can plan/apply independently of main/ at any time.
#   2. Adding a new output to main/ does not require a main/ apply before
#      runners/ can reference it.
#   3. No chicken-and-egg bootstrap issue when splitting state.
#
# Every data source below has a matching resource in terraform/main/. Tags
# (Environment, Name, Project) are the contract — if you rename a resource or
# change its tags in main/, you must update the lookup here as well.

# ── GitHub Actions OIDC provider ────────────────────────────────────────────
# Defined in terraform/main/github-actions-oidc.tf. OIDC providers are global
# per-account, so this lookup is stable regardless of environment.
data "aws_iam_openid_connect_provider" "github_actions" {
  url = "https://token.actions.githubusercontent.com"
}

# ── VPC ─────────────────────────────────────────────────────────────────────
data "aws_vpc" "main" {
  tags = {
    Name = "${local.name_prefix}-vpc"
  }
}

# ── Public subnets (runner instances live here) ─────────────────────────────
# Matched by Name tag pattern (main/ creates them as
# ${name_prefix}-public-1, ${name_prefix}-public-2, ...).
data "aws_subnets" "public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.main.id]
  }
  filter {
    name   = "tag:Name"
    values = ["${local.name_prefix}-public-*"]
  }
}

data "aws_subnet" "public" {
  for_each = toset(data.aws_subnets.public.ids)
  id       = each.value
}

# ── Private (lambda) subnets ────────────────────────────────────────────────
data "aws_subnets" "private_lambda" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.main.id]
  }
  filter {
    name   = "tag:Name"
    values = ["${local.name_prefix}-private-lambda-*"]
  }
}

# ── RDS security group (runner egress to PostgreSQL) ────────────────────────
data "aws_security_group" "rds" {
  vpc_id = data.aws_vpc.main.id
  tags = {
    Name = "${local.name_prefix}-rds-sg"
  }
}

# ── NAT instance security group (for SSM port-forward tunnels) ──────────────
data "aws_security_group" "nat_instance" {
  vpc_id = data.aws_vpc.main.id
  tags = {
    Name = "${local.name_prefix}-nat-instance-sg"
  }
}

# ── Ops alerts SNS topic (runner alarms publish here) ───────────────────────
data "aws_sns_topic" "ops_alerts" {
  name = "${local.name_prefix}-ops-alerts"
}

# ── Convenience locals ──────────────────────────────────────────────────────
# Flatten the most-used lookups into the locals namespace so resource
# definitions read more cleanly.
locals {
  # VPC + networking
  vpc_id                    = data.aws_vpc.main.id
  vpc_cidr_block            = data.aws_vpc.main.cidr_block
  public_subnet_ids         = data.aws_subnets.public.ids
  public_subnet_cidr_blocks = [for s in data.aws_subnet.public : s.cidr_block]
  private_subnet_ids        = data.aws_subnets.private_lambda.ids

  # Security groups
  rds_security_group_id          = data.aws_security_group.rds.id
  nat_instance_security_group_id = data.aws_security_group.nat_instance.id

  # Cross-state SNS topic for runner alarms
  ops_alerts_topic_arn = data.aws_sns_topic.ops_alerts.arn
}
