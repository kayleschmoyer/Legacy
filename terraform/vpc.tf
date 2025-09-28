# VPC
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-vpc"
  })
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-igw"
  })
}

# Public Subnets
resource "aws_subnet" "public" {
  count = length(var.availability_zones)

  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.${count.index + 1}.0/24"
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-public-${count.index + 1}"
    Type = "public"
  })
}

# Private Subnets for Lambda
resource "aws_subnet" "private_lambda" {
  count = length(var.availability_zones)

  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = var.availability_zones[count.index]

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-private-lambda-${count.index + 1}"
    Type = "private"
  })
}

# Private Subnets for Database
resource "aws_subnet" "private_database" {
  count = length(var.availability_zones)

  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 20}.0/24"
  availability_zone = var.availability_zones[count.index]

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-private-database-${count.index + 1}"
    Type = "private"
  })
}

# Elastic IPs for NAT Gateways
resource "aws_eip" "nat" {
  count = var.nat_gateway_count

  domain     = "vpc"
  depends_on = [aws_internet_gateway.main]

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-nat-eip-${count.index + 1}"
  })
}

# NAT Gateways
resource "aws_nat_gateway" "main" {
  count = var.nat_gateway_count

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-nat-${count.index + 1}"
  })

  depends_on = [aws_internet_gateway.main]
}

# Route Tables
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-rt-public"
  })
}

resource "aws_route_table" "private_lambda" {
  count = length(var.availability_zones)

  vpc_id = aws_vpc.main.id

  # Default route added via nat-instance.tf when use_nat_instance = true
  # This provides cost-effective internet access for OAuth Lambda to reach Google APIs
  # VPC endpoints handle AWS services traffic

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-rt-private-lambda-${count.index + 1}"
  })
}

resource "aws_route_table" "private_database" {
  vpc_id = aws_vpc.main.id

  # No default route - database subnets are completely isolated
  # No external access needed for RDS instances

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-rt-private-database"
  })
}

# Route Table Associations
resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private_lambda" {
  count = length(aws_subnet.private_lambda)

  subnet_id      = aws_subnet.private_lambda[count.index].id
  route_table_id = aws_route_table.private_lambda[count.index].id
}

resource "aws_route_table_association" "private_database" {
  count = length(aws_subnet.private_database)

  subnet_id      = aws_subnet.private_database[count.index].id
  route_table_id = aws_route_table.private_database.id
}
