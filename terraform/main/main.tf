terraform {
  required_version = ">= 1.13"

  # Backend configuration for state management
  # This allows Terraform to track what resources already exist in AWS
  # and only apply changes when needed (e.g., Lambda code updates via SSM)
  backend "s3" {
    bucket  = "legacy-sports-terraform-state"
    key     = "legacy-sports/terraform.tfstate"
    region  = "us-east-1"
    encrypt = true

    # State locking via S3 native lockfile (replaces deprecated dynamodb_table)
    use_lockfile = true
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
}
