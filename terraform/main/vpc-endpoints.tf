# VPC Endpoints for NAT Gateway removal
# This file creates VPC endpoints to allow Lambda functions in private subnets 
# to access AWS services without requiring a NAT Gateway

# Note: aws_region data source is defined in main.tf

# Security Group for VPC Endpoints
resource "aws_security_group" "vpc_endpoints" {
  name_prefix = "${local.name_prefix}-vpc-endpoints-"
  vpc_id      = aws_vpc.main.id
  description = "Security group for VPC endpoints"

  # Allow HTTPS traffic from Lambda subnets
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "HTTPS from VPC"
  }

  # Allow all outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound traffic"
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-vpc-endpoints-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# Secrets Manager VPC Endpoint
# Required for Lambda functions to access database credentials
resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id             = aws_vpc.main.id
  service_name       = "com.amazonaws.${data.aws_region.current.id}.secretsmanager"
  vpc_endpoint_type  = "Interface"
  subnet_ids         = aws_subnet.private_lambda[*].id
  security_group_ids = [aws_security_group.vpc_endpoints.id]

  private_dns_enabled = true

  # Endpoint policy: scoped to this account's project-namespace secrets.
  # private_dns_enabled routes ALL Secrets Manager API calls through this
  # endpoint, including from self-hosted runners in public subnets.
  #
  # Resource scoping (not action filtering) is the meaningful control here:
  # it prevents the endpoint from being used to reach secrets in other accounts
  # or outside this project's namespace. IAM role policies enforce which
  # actions each principal can actually perform.
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowProjectNamespace"
        Effect    = "Allow"
        Principal = "*"
        Action    = "secretsmanager:*"
        Resource = [
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${local.name_prefix}-*",
          "arn:aws:secretsmanager:${local.region}:${local.account_id}:secret:${var.environment}/*",
        ]
      }
    ]
  })

  tags = merge(local.common_tags, {
    Name    = "${local.name_prefix}-secretsmanager-endpoint"
    Service = "secretsmanager"
  })
}

# CloudWatch Logs VPC Endpoint (optional but helpful for Lambda logging)
resource "aws_vpc_endpoint" "logs" {
  vpc_id             = aws_vpc.main.id
  service_name       = "com.amazonaws.${data.aws_region.current.id}.logs"
  vpc_endpoint_type  = "Interface"
  subnet_ids         = aws_subnet.private_lambda[*].id
  security_group_ids = [aws_security_group.vpc_endpoints.id]

  private_dns_enabled = true

  # Endpoint policy: scoped to this account's log groups.
  # private_dns_enabled routes ALL CW Logs API calls through this endpoint,
  # including from self-hosted runners in public subnets.
  #
  # Resource scoping (not action filtering) is the meaningful control here:
  # it prevents the endpoint from being used to reach log groups in other
  # accounts. IAM role policies enforce which actions each principal can
  # actually perform, so maintaining an action allowlist here only causes
  # repeated CI failures as new Terraform resources require new CW Logs APIs.
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowAccountLogGroups"
        Effect    = "Allow"
        Principal = "*"
        Action    = "logs:*"
        Resource  = "arn:aws:logs:*:${local.account_id}:*"
      }
    ]
  })

  tags = merge(local.common_tags, {
    Name    = "${local.name_prefix}-logs-endpoint"
    Service = "logs"
  })
}

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

# Output VPC Endpoint information
output "vpc_endpoints" {
  description = "VPC Endpoint information"
  value = {
    secretsmanager = {
      id  = aws_vpc_endpoint.secretsmanager.id
      dns = aws_vpc_endpoint.secretsmanager.dns_entry
    }
    logs = {
      id  = aws_vpc_endpoint.logs.id
      dns = aws_vpc_endpoint.logs.dns_entry
    }
    security_group_id = aws_security_group.vpc_endpoints.id
  }
}
