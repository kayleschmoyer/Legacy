# =============================================================================
# Provider configuration + locals for runners/ state
# =============================================================================
#
# Mirrors terraform/main/main.tf because each terraform state file needs its
# own provider configuration. The locals here are intentionally duplicated
# from main/ — they're cheap to maintain and avoid a remote-state lookup for
# every reference.

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = "legacy-sports"
      ManagedBy   = "terraform"
    }
  }
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Local values
# Intentionally duplicated from terraform/main/main.tf — these are derived from
# variables that this state declares too, so they're stable across both files.
locals {
  name_prefix = "${var.project_name}-${var.environment}"
  account_id  = data.aws_caller_identity.current.account_id
  region      = data.aws_region.current.id

  # Common tags
  common_tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }

  # Per-environment retention map for runner CloudWatch log groups.
  # Intentionally duplicated from terraform/main/variables.tf — keeping the
  # values in sync is part of the LS-2425 state separation contract.
  log_retention_days = {
    dev     = 30
    staging = 30
    prod    = 90
  }
}
