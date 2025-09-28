# Security Groups

# Lambda Security Group
resource "aws_security_group" "lambda" {
  name_prefix = "${local.name_prefix}-lambda-"
  vpc_id      = aws_vpc.main.id
  description = "Security group for Lambda functions"

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
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

# RDS now secured in private subnets - no public access
# Database access only through RDS proxy from Lambda functions in private subnets
# Migrations should use database tunneling or VPN for secure access

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
