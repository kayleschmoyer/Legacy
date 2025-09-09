# DB Subnet Group - Using public subnets to enable both public and VPC access
resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-db-subnet-group-v2"  # New name to force recreation
  subnet_ids = aws_subnet.public[*].id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-db-subnet-group"
  })
}

# RDS PostgreSQL Instance
resource "aws_db_instance" "postgres" {
  identifier = "${local.name_prefix}-postgres"

  # Engine configuration
  engine         = "postgres"
  engine_version = "16.8"
  instance_class = var.db_instance_class

  # Storage configuration - Optimized for dev
  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = 50   # Reduced from 100GB for dev
  storage_type          = "gp3"
  storage_encrypted     = true

  # Database configuration
  db_name  = var.database_name
  username = var.database_username
  password = random_password.database_password.result

  # Network & Security
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = true

  # Backup & Maintenance - Optimized for dev
  backup_retention_period = 1  # Reduced from 7 days for dev
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  auto_minor_version_upgrade = true

  # Performance & Monitoring - Disabled for dev cost savings
  performance_insights_enabled = false  # Disabled for dev
  monitoring_interval         = 0       # Disabled enhanced monitoring

  # Deletion protection
  deletion_protection = false
  skip_final_snapshot = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-postgres"
  })

  depends_on = [
    aws_secretsmanager_secret_version.database_credentials
  ]
}

# RDS Monitoring Role - Commented out for dev cost savings
# resource "aws_iam_role" "rds_monitoring" {
#   name = "${local.name_prefix}-rds-monitoring"

#   assume_role_policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [
#       {
#         Action = "sts:AssumeRole"
#         Effect = "Allow"
#         Principal = {
#           Service = "monitoring.rds.amazonaws.com"
#         }
#       }
#     ]
#   })

#   tags = local.common_tags
# }

# resource "aws_iam_role_policy_attachment" "rds_monitoring" {
#   role       = aws_iam_role.rds_monitoring.name
#   policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
# }

# RDS Proxy - Optional for dev cost savings
resource "aws_db_proxy" "main" {
  count = var.enable_rds_proxy ? 1 : 0
  
  name                   = "${local.name_prefix}-gql-proxy"
  engine_family         = "POSTGRESQL"
  auth {
    auth_scheme = "SECRETS"
    secret_arn  = aws_secretsmanager_secret.database_credentials.arn
  }
  
  role_arn               = aws_iam_role.rds_proxy[0].arn
  vpc_subnet_ids         = aws_subnet.private_database[*].id
  vpc_security_group_ids = [aws_security_group.rds_proxy[0].id]

  require_tls = true
  idle_client_timeout = 1800

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-gql-proxy"
  })
}

resource "aws_db_proxy_default_target_group" "main" {
  count = var.enable_rds_proxy ? 1 : 0
  
  db_proxy_name = aws_db_proxy.main[0].name

  connection_pool_config {
    connection_borrow_timeout    = 120
    max_connections_percent      = 100
    max_idle_connections_percent = 50
  }
}

resource "aws_db_proxy_target" "main" {
  count = var.enable_rds_proxy ? 1 : 0
  
  db_instance_identifier = aws_db_instance.postgres.identifier
  db_proxy_name          = aws_db_proxy.main[0].name
  target_group_name      = aws_db_proxy_default_target_group.main[0].name
}

# RDS Proxy IAM Role - Optional for dev cost savings
resource "aws_iam_role" "rds_proxy" {
  count = var.enable_rds_proxy ? 1 : 0
  
  name = "${local.name_prefix}-rds-proxy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "rds.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "rds_proxy_secrets" {
  count = var.enable_rds_proxy ? 1 : 0
  
  name = "${local.name_prefix}-rds-proxy-secrets"
  role = aws_iam_role.rds_proxy[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetResourcePolicy",
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
          "secretsmanager:ListSecretVersionIds"
        ]
        Resource = [
          aws_secretsmanager_secret.database_credentials.arn
        ]
      }
    ]
  })
}
