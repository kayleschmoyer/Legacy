# =============================================================================
# Terraform backend configuration for runners/ state
# =============================================================================
#
# Self-hosted runner fleet state file (LS-2425). Lives in the same S3 bucket
# as the main state but under a separate key, so the regular Apply Lambda
# Infrastructure workflow physically cannot see runner resources.
#
# State key: legacy-sports/runners.tfstate
# Lock table: terraform-state-locks (shared with main/ — different LockID rows)
#
# Bootstrap: the S3 bucket and DynamoDB table this references are managed
# by terraform/main/backend-setup.tf. They must exist before this state can
# be initialized.

terraform {
  required_version = ">= 1.13"

  backend "s3" {
    bucket  = "legacy-sports-terraform-state"
    key     = "legacy-sports/runners.tfstate"
    region  = "us-east-1"
    encrypt = true

    # State locking with DynamoDB (shared table with main/, different LockID).
    dynamodb_table = "terraform-state-locks"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.4"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }
}
