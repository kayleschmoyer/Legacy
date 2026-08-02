# VPC Endpoints for NAT Gateway removal
# This file creates VPC endpoints to allow Lambda functions in private subnets 
# to access AWS services without requiring a NAT Gateway

# Note: aws_region data source is defined in main.tf

# Secrets Manager and CloudWatch Logs interface endpoints (and the security
# group that existed solely to attach to them) were removed in
# LS-8906 (cost-optimization epic LS-8893): at ~$29/month + per-GB data
# processing for 4 ENIs across 2 AZs, they were the largest fixed non-runner
# cost line item in the 2026-08 CI/infra audit, and are substantially
# redundant given the t3.nano NAT instance (nat-instance.tf) already provides
# HTTPS egress for the private subnets. Traffic to both services now routes
# through the NAT instance instead of a dedicated endpoint path — see the
# PR description for the resulting single-point-of-failure tradeoff.

# S3 Gateway VPC Endpoint (required for Lambda deployment artifacts)
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${data.aws_region.current.id}.s3"
  vpc_endpoint_type = "Gateway"

  # Associate with private route tables
  route_table_ids = aws_route_table.private_lambda[*].id

  tags = merge(local.common_tags, {
    Name    = "${local.name_prefix}-s3-gateway-endpoint"
    Service = "s3"
  })
}

# NOTE: For Google APIs access from private subnets, we have several options:
# Option 1: Use a lightweight NAT instance (cost ~$3-8/month vs $45/month NAT Gateway)
# Option 2: Use AWS PrivateLink + VPC Endpoint for specific Google services (complex)
# Option 3: Use AWS Lambda Layer + proxy pattern (development overhead)
#
# RECOMMENDED: Add a minimal NAT instance for Google API access only
# This provides the best balance of cost, security, and simplicity

# Output VPC Endpoint information. Kept as a stable contract even though the
# secretsmanager/logs interface endpoints and their security group are gone
# (LS-8906) — an empty/removed output would itself be a breaking change for
# any consumer that reads it, so it now reflects only what still exists.
output "vpc_endpoints" {
  description = "VPC Endpoint information"
  value = {
    s3 = {
      id = aws_vpc_endpoint.s3.id
    }
  }
}

