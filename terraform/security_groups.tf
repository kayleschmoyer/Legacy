# Security Groups

# Lambda Security Group
resource "aws_security_group" "lambda" {
  name_prefix = "${local.name_prefix}-lambda-"
  vpc_id      = aws_vpc.main.id
  description = "Security group for Lambda functions"

  # HTTPS egress — covers VPC endpoints (Secrets Manager, CloudWatch) and
  # external APIs via NAT (Google, Rollbar, Sentry, Stripe, Apple IAP)
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS to VPC endpoints and external APIs via NAT"
  }

  # DNS egress — required for VPC DNS resolution (e.g. RDS endpoints, Secrets Manager)
  egress {
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = [var.vpc_cidr]
    description = "DNS (UDP) to VPC DNS resolver"
  }

  egress {
    from_port   = 53
    to_port     = 53
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
    description = "DNS (TCP) to VPC DNS resolver"
  }

  # PostgreSQL egress — RDS and RDS Proxy within the VPC
  egress {
    from_port = 5432
    to_port   = 5432
    protocol  = "tcp"
    security_groups = compact([
      aws_security_group.rds.id,
      try(aws_security_group.rds_proxy[0].id, ""),
    ])
    description = "PostgreSQL to RDS and RDS Proxy security groups"
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-lambda-sg"
  })
}

# RDS Security Group
resource "aws_security_group" "rds" {
  name_prefix = "${local.name_prefix}-rds-"
  vpc_id      = aws_vpc.main.id
  description = "Security group for RDS database"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-rds-sg"
  })
}

# RDS Security Group Rules
resource "aws_security_group_rule" "rds_from_lambda" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.lambda.id
  security_group_id        = aws_security_group.rds.id
}

resource "aws_security_group_rule" "rds_from_proxy" {
  count                    = var.enable_rds_proxy ? 1 : 0
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.rds_proxy[0].id
  security_group_id        = aws_security_group.rds.id
}

# =============================================================================
# RDS ACCESS STRATEGY:
# - Lambda functions: Use RDS Proxy for connection pooling and reliability
# - CLI/Migrations: Use direct RDS access for simplicity and performance  
# - Security: Controlled via security group rules (source-based access control)
# =============================================================================

# CLI Development Access - Direct RDS connection for development tools
resource "aws_security_group_rule" "rds_from_cli_dev" {
  count = var.environment == "dev" && length(var.allowed_public_ips) > 0 ? 1 : 0

  type              = "ingress"
  from_port         = 5432
  to_port           = 5432
  protocol          = "tcp"
  cidr_blocks       = [for ip in var.allowed_public_ips : "${ip}/32"]
  security_group_id = aws_security_group.rds.id
  description       = "Direct PostgreSQL access from allowed development IPs (CLI tools)"
}

# RDS Proxy Security Group - Optional for dev cost savings
resource "aws_security_group" "rds_proxy" {
  count = var.enable_rds_proxy ? 1 : 0

  name_prefix = "${local.name_prefix}-rds-proxy-"
  vpc_id      = aws_vpc.main.id
  description = "Security group for RDS Proxy"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-rds-proxy-sg"
  })
}

# RDS Proxy Security Group Rules - Allow Lambda to RDS Proxy communication
resource "aws_security_group_rule" "rds_proxy_from_lambda" {
  count                    = var.enable_rds_proxy ? 1 : 0
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.lambda.id
  security_group_id        = aws_security_group.rds_proxy[0].id
  description              = "Allow GraphQL Lambda to access RDS Proxy"
}

resource "aws_security_group_rule" "rds_proxy_to_rds" {
  count                    = var.enable_rds_proxy ? 1 : 0
  type                     = "egress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.rds.id
  security_group_id        = aws_security_group.rds_proxy[0].id
  description              = "Allow RDS Proxy to access RDS instance"
}

# API Gateway security group removed - not needed since API Gateways are managed by Serverless Framework
# and don't require VPC endpoints for this application

# =============================================================================
# DEVELOPMENT RDS PROXY SECURITY GROUPS (PUBLIC ACCESS)
# =============================================================================

# =============================================================================
# CLI DATABASE ACCESS  
# =============================================================================
# CLI and development tools now access RDS directly via the rds_from_cli_dev rule above.
# This replaces the previous development RDS proxy approach for simplicity and cost savings.
